import type { LayoutDocument, LayoutFontFamily, LayoutFontStyle, LayoutFontWeight, LayoutImageFrame, LayoutPaper, PhotoId, PhotoSource } from "../../contracts";
import { createLayoutPdf, type LayoutPdfFontSource, type LayoutPdfPhoto, type LayoutPdfProgress } from "../../modules/layout/layoutPdf";
import { LAYOUT_CHINESE_FALLBACK_FONT, LAYOUT_FONT_BY_FAMILY, layoutFontCssShorthand, layoutFontStyle, layoutFontWeight, needsLayoutChineseFallback } from "../../modules/layout/layoutFonts";
import { isDarkLayoutPaper, layoutPaperMaterial } from "../../modules/layout/layoutPaper";
import { resolveImagePlacement } from "../../modules/page-layout/pageGeometry";
import { loadLayoutFont } from "./layoutFontAssets";
import { resolveLayoutPdfFontAsset } from "./layoutPdfFontAssets";
import { decodePhotoImage, encodePhotoCanvas, inspectPhotoImage } from "./photoImage";

export interface LayoutPdfIssue { readonly page: number; readonly objectId: string; readonly kind: "empty" | "missing" | "low-resolution" }
export interface LayoutPdfPreflight { readonly blocking: readonly LayoutPdfIssue[]; readonly warnings: readonly LayoutPdfIssue[] }
export type LayoutPdfQuality = "low" | "medium" | "high" | "original";

const rasterQuality = {
  low: { dpi: 150, jpeg: .72 },
  medium: { dpi: 220, jpeg: .82 },
  high: { dpi: 300, jpeg: .9 },
} as const;

/** Confirm source access before offering an export. The document is already a fixed snapshot. */
export async function preflightLayoutPdf(snapshot: LayoutDocument, source: PhotoSource, signal?: AbortSignal): Promise<LayoutPdfPreflight> {
  const blocking: LayoutPdfIssue[] = [], warnings: LayoutPdfIssue[] = [];
  for (const [index, page] of snapshot.pages.entries()) for (const object of page.objects) {
    if (object.kind !== "image-frame") continue;
    signal?.throwIfAborted();
    const location = { page: index + 1, objectId: object.id };
    if (!object.photoId) { blocking.push({ ...location, kind: "empty" }); continue; }
    const [metadata, file] = await Promise.all([source.getPhoto(object.photoId), source.readOriginalFile(object.photoId)]);
    signal?.throwIfAborted();
    if (!metadata.ok || !file.ok || !metadata.value.width || !metadata.value.height) {
      blocking.push({ ...location, kind: "missing" }); continue;
    }
    const density = photoDensity(object, metadata.value);
    if (density < 150) warnings.push({ ...location, kind: "low-resolution" });
  }
  return { blocking, warnings };
}

function photoDensity(frame: LayoutImageFrame, photo: { width: number; height: number }): number {
  const placed = resolveImagePlacement(photo, frame.rect, frame.crop);
  return Math.min(photo.width / placed.width, photo.height / placed.height) * 72;
}

export async function exportLayoutPdf(snapshot: LayoutDocument, source: PhotoSource, signal?: AbortSignal,
  onProgress?: (progress: LayoutPdfProgress) => void, quality: LayoutPdfQuality = "original"): Promise<void> {
  signal?.throwIfAborted();
  const requests = new Map<string, { family: LayoutFontFamily; weight: LayoutFontWeight; style: LayoutFontStyle }>();
  const addRequest = (family: LayoutFontFamily, weight: LayoutFontWeight, style: LayoutFontStyle) => {
    requests.set(`${family}:${weight}:${style}`, { family, weight, style });
  };
  const textStyles: Array<{ family: LayoutFontFamily; weight: LayoutFontWeight; style: LayoutFontStyle; text: string }> = [];
  for (const page of snapshot.pages) for (const object of page.objects) {
    if (object.kind !== "text-box") continue;
    const style = { family: object.style.fontFamily, weight: layoutFontWeight(object.style.fontWeight), style: layoutFontStyle(object.style.fontStyle) };
    textStyles.push({ ...style, text: object.text });
    addRequest(style.family, style.weight, style.style);
    if (needsLayoutChineseFallback(style.family, object.text, style.weight, style.style)) addRequest(LAYOUT_CHINESE_FALLBACK_FONT, style.weight, style.style);
  }
  const byteLoads = new Map<string, Promise<Uint8Array>>();
  const loadBytes = (url: string, family: LayoutFontFamily) => {
    const cached = byteLoads.get(url);
    if (cached) return cached;
    const promise = fetch(url, { signal }).then(async (response) => {
      if (!response.ok) throw new Error(`The Layout font "${LAYOUT_FONT_BY_FAMILY[family].label}" could not be loaded.`);
      return new Uint8Array(await response.arrayBuffer());
    });
    byteLoads.set(url, promise);
    return promise;
  };
  const fonts: LayoutPdfFontSource[] = await Promise.all([...requests.values()].map(async (request) => {
    const asset = resolveLayoutPdfFontAsset(request.family, request.weight, request.style);
    return { ...request, ...asset, bytes: await loadBytes(asset.url, request.family) };
  }));
  await Promise.all(textStyles.map(({ family, weight, style, text }) => loadLayoutFont(family, weight, style, text)));
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("This browser could not measure Layout text for PDF export.");
  const bytes = await createLayoutPdf(snapshot, {
    fonts,
    loadPhoto: (photoId, frame, currentSignal) => loadLayoutPhoto(source, photoId, frame, quality, currentSignal),
    loadPaperBackground: renderLayoutPaperJpeg,
    imageKey: quality === "original" ? (frame) => frame.photoId! : (frame) => JSON.stringify([
      frame.photoId, frame.rect.width, frame.rect.height, frame.crop,
    ]),
    measureText: (text, size, family, weight, style) => { context.font = layoutFontCssShorthand(family, size * 4 / 3, weight, style); return context.measureText(text).width * 3 / 4; },
  }, signal, onProgress);
  signal?.throwIfAborted();
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${snapshot.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim() || "Layout"}.pdf`;
  try { document.body.append(link); link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}

const textureBlobs = new Map<string, Promise<Blob>>();

async function renderLayoutPaperJpeg(paper: LayoutPaper, pageSpec: LayoutDocument["pageSpec"], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const material = layoutPaperMaterial(paper.material);
  if (!material.textureUrl) throw new Error(`The Layout paper material "${paper.material}" could not be loaded.`);
  let request = textureBlobs.get(material.textureUrl);
  if (!request) {
    request = fetch(material.textureUrl).then((response) => {
      if (!response.ok) throw new Error(`The Layout paper material "${material.name}" could not be loaded.`);
      return response.blob();
    });
    textureBlobs.set(material.textureUrl, request);
  }
  const bitmap = await createImageBitmap(await request);
  const canvas = document.createElement("canvas");
  const dpi = 220;
  canvas.width = Math.max(1, Math.round(pageSpec.widthPt / 72 * dpi));
  canvas.height = Math.max(1, Math.round(pageSpec.heightPt / 72 * dpi));
  try {
    signal?.throwIfAborted();
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the Layout paper for PDF export.");
    context.fillStyle = paper.color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.globalAlpha = isDarkLayoutPaper(paper) ? material.darkOpacity : material.lightOpacity;
    context.globalCompositeOperation = "soft-light";
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (material.repeat === "repeat") {
      const tile = document.createElement("canvas");
      tile.width = Math.max(1, Math.round(canvas.width * material.sizeRatio));
      tile.height = Math.max(1, Math.round(tile.width * bitmap.height / bitmap.width));
      const tileContext = tile.getContext("2d");
      if (!tileContext) throw new Error("This browser could not prepare the Layout paper texture.");
      tileContext.filter = isDarkLayoutPaper(paper) ? material.filter : "none";
      tileContext.drawImage(bitmap, 0, 0, tile.width, tile.height);
      const pattern = context.createPattern(tile, "repeat");
      if (!pattern) throw new Error("This browser could not prepare the Layout paper pattern.");
      context.fillStyle = pattern;
      context.fillRect(0, 0, canvas.width, canvas.height);
      tile.width = tile.height = 0;
    } else {
      const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
      const width = bitmap.width * scale, height = bitmap.height * scale;
      context.filter = isDarkLayoutPaper(paper) ? material.filter : "none";
      context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
    context.restore();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("The Layout paper could not be encoded for PDF export.")), "image/jpeg", .9));
    signal?.throwIfAborted();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format: "jpg" as const };
  } finally { bitmap.close(); canvas.width = canvas.height = 0; }
}

export async function loadLayoutPhoto(source: PhotoSource, photoId: PhotoId, frame: LayoutImageFrame, quality: LayoutPdfQuality, signal?: AbortSignal): Promise<LayoutPdfPhoto> {
  signal?.throwIfAborted();
  const [file, metadata] = await Promise.all([source.readOriginalFile(photoId), source.getPhoto(photoId)]);
  if (!file.ok) throw new Error("A photo became unavailable during export. Reconnect its source and retry.");
  if (!metadata.ok) throw new Error("A photo became unavailable during export. Reconnect its source and retry.");
  const info = await inspectPhotoImage(file.value);
  const format = info.format === "jpg" ? "jpg" : "png";
  if (quality === "original" && format === "jpg") {
    // Only original quality embeds an unrotated source JPEG without recompression.
    const header = new Uint8Array(await file.value.slice(0, 256 * 1024).arrayBuffer());
    if (jpegOrientation(header) === 1) {
      signal?.throwIfAborted();
      return { bytes: new Uint8Array(await file.value.arrayBuffer()), format, width: metadata.value.width, height: metadata.value.height };
    }
  }
  const bitmap = await decodePhotoImage(file.value, info);
  const canvas = document.createElement("canvas");
  try {
    signal?.throwIfAborted();
    const preset = quality === "original" ? undefined : rasterQuality[quality];
    const placed = preset ? resolveImagePlacement(bitmap, frame.rect, frame.crop) : undefined;
    const visible = placed ? {
      x: Math.max(0, placed.x), y: Math.max(0, placed.y),
      width: Math.min(frame.rect.width, placed.x + placed.width) - Math.max(0, placed.x),
      height: Math.min(frame.rect.height, placed.y + placed.height) - Math.max(0, placed.y),
    } : undefined;
    const sourceDpi = placed ? bitmap.width / placed.width * 72 : 0;
    const targetDpi = preset ? Math.min(preset.dpi, sourceDpi) : 0;
    canvas.width = visible ? Math.max(1, Math.round(visible.width / 72 * targetDpi)) : bitmap.width;
    canvas.height = visible ? Math.max(1, Math.round(visible.height / 72 * targetDpi)) : bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare a photo for PDF export.");
    if (format === "jpg") { context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    if (placed && visible) context.drawImage(bitmap, (placed.x - visible.x) * canvas.width / visible.width, (placed.y - visible.y) * canvas.height / visible.height,
      placed.width * canvas.width / visible.width, placed.height * canvas.height / visible.height);
    else context.drawImage(bitmap, 0, 0);
    const encoded = await encodePhotoCanvas(canvas, format, preset?.jpeg ?? .94);
    signal?.throwIfAborted();
    return { bytes: new Uint8Array(await encoded.arrayBuffer()), format, width: canvas.width, height: canvas.height, renderedRect: visible };
  } finally { bitmap.close(); canvas.width = canvas.height = 0; }
}

/** Return 1 only when the JPEG is known to need no EXIF rotation. */
export function jpegOrientation(bytes: Uint8Array): number | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 2; at + 4 <= bytes.length;) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xda || marker === 0xd9) return 1;
    if (marker === 0x00 || marker === 0xff) { at++; continue; }
    const size = view.getUint16(at + 2);
    if (size < 2 || at + 2 + size > bytes.length) return null;
    if (marker === 0xe1 && size >= 16 && String.fromCharCode(...bytes.slice(at + 4, at + 10)) === "Exif\0\0") {
      const tiff = at + 10;
      const endian = String.fromCharCode(bytes[tiff], bytes[tiff + 1]);
      if (endian !== "II" && endian !== "MM") return null;
      const little = endian === "II";
      const read16 = (offset: number) => view.getUint16(offset, little);
      const read32 = (offset: number) => view.getUint32(offset, little);
      if (read16(tiff + 2) !== 42) return null;
      const ifd = tiff + read32(tiff + 4);
      if (ifd + 2 > at + 2 + size) return null;
      const count = read16(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > at + 2 + size) return null;
        if (read16(entry) === 0x0112) return read16(entry + 8);
      }
      return 1;
    }
    at += 2 + size;
  }
  return null;
}
