import type { PhotoSource, WorktableFrame } from "../../contracts";
import { copyFrame } from "../../modules/worktable/frameCommands";
import { framePaper, resolveFramePhoto } from "../../modules/worktable/frameLayout";
import { frameCaptionStyle, frameInnerEdge } from "../../modules/worktable/frameAppearance";
import { layoutPaperMaterial } from "../../modules/layout/layoutPaper";
import { LAYOUT_CHINESE_FALLBACK_FONT, LAYOUT_FONT_BY_FAMILY } from "../../modules/layout/layoutFonts";
import { resolveLayoutFontAsset } from "./layoutFontAssets";

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("A Frame export asset could not be read."));
    reader.readAsDataURL(blob);
  });
}

function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob)
    : reject(new Error("The Frame could not be encoded as JPEG.")), "image/jpeg", .95));
}

// Capture page styles at the click, independent of later edits or Table zoom.
// Pseudo-elements include paper texture and the legacy film markings.
function clonePage(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(false) as HTMLElement;
  const copyStyle = (style: CSSStyleDeclaration, target: HTMLElement) => {
    for (const property of style) target.style.setProperty(property, style.getPropertyValue(property));
    target.style.animation = "none";
    target.style.transition = "none";
    target.style.outline = "none";
  };
  copyStyle(getComputedStyle(element), clone);
  for (const child of element.childNodes) clone.append(child instanceof HTMLElement ? clonePage(child) : child.cloneNode(true));
  for (const pseudo of ["::before", "::after"]) {
    const style = getComputedStyle(element, pseudo);
    if (style.content === "none" || style.content === "normal" || style.display === "none") continue;
    const layer = document.createElement("span");
    copyStyle(style, layer);
    if (pseudo === "::before") clone.prepend(layer); else clone.append(layer);
  }
  return clone;
}

/** Export only the page composition, with original photos and embedded assets. */
export async function createFrameJpeg(frame: WorktableFrame, page: HTMLElement, source: PhotoSource, signal?: AbortSignal): Promise<Blob> {
  const snapshot = copyFrame(frame);
  const clone = clonePage(page);
  clone.querySelectorAll(".table-frame-slot-handle, .table-frame-alignment-guides, .table-frame-slot:not(.has-photo)").forEach((node) => node.remove());
  Object.assign(clone.style, { position: "relative", left: "0", top: "0", width: `${snapshot.page.widthPt}px`, height: `${snapshot.page.heightPt}px`,
    transform: "none", border: "0", boxShadow: "none", margin: "0", opacity: "1" });
  clone.querySelectorAll<HTMLElement>(".table-frame-slot").forEach((node) => { node.style.outline = "none"; });
  const photos = new Map<string, { url: string; width: number; height: number }>();
  for (const slot of snapshot.page.slots) {
    if (!slot.photoId) continue;
    signal?.throwIfAborted();
    let photo = photos.get(slot.photoId);
    if (!photo) {
      const file = await source.readOriginalFile(slot.photoId);
      if (!file.ok) throw new Error("A photo is unavailable. Reconnect its source and try again.");
      const bitmap = await createImageBitmap(file.value);
      const canvas = document.createElement("canvas");
      try {
        signal?.throwIfAborted();
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser could not prepare a Frame photo.");
        context.drawImage(bitmap, 0, 0);
        photo = { url: await dataUrl(await encodeJpeg(canvas)), width: bitmap.width, height: bitmap.height };
        photos.set(slot.photoId, photo);
      } finally { bitmap.close(); canvas.width = canvas.height = 0; }
    }
    const target = [...clone.querySelectorAll<HTMLElement>("[data-frame-slot-id]")].find((node) => node.dataset.frameSlotId === slot.id);
    if (!target) continue;
    target.querySelectorAll(".table-frame-loading, .table-frame-missing").forEach((node) => node.remove());
    const image = target.querySelector("img") ?? document.createElement("img");
    const placed = resolveFramePhoto(photo, slot.rect, slot.crop);
    const x = Math.max(0, placed.x), y = Math.max(0, placed.y);
    const width = Math.min(slot.rect.width, placed.x + placed.width) - x;
    const height = Math.min(slot.rect.height, placed.y + placed.height) - y;
    const clip = target.querySelector<HTMLElement>(".table-frame-photo-clip");
    if (clip) Object.assign(clip.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
    image.removeAttribute("srcset");
    image.src = photo.url;
    Object.assign(image.style, { position: "absolute", left: `${placed.x - x}px`, top: `${placed.y - y}px`, width: `${placed.width}px`, height: `${placed.height}px`,
      visibility: "visible", opacity: "1", animation: "none", transform: "none" });
    if (snapshot.page.templateSource.id === "sheet-bw") image.style.filter = "grayscale(1) contrast(1.15)";
    if (!image.parentElement) target.querySelector(".table-frame-photo-clip")?.append(image);
    const elevation = target.querySelector<HTMLElement>(".table-frame-photo-elevation");
    if (elevation) Object.assign(elevation.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
    const edge = target.querySelector<HTMLElement>(".table-frame-inner-edge");
    const edgeWidth = frameInnerEdge(snapshot.page).widthPt;
    if (edge) Object.assign(edge.style, { left: `${x - edgeWidth}px`, top: `${y - edgeWidth}px`, width: `${width + edgeWidth * 2}px`, height: `${height + edgeWidth * 2}px` });
  }
  const material = layoutPaperMaterial(framePaper(snapshot.page).material);
  if (material.textureUrl) {
    const response = await fetch(material.textureUrl, { signal });
    if (!response.ok) throw new Error("The Frame paper texture could not be loaded.");
    const texture = await dataUrl(await response.blob());
    for (const node of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
      if (node.style.backgroundImage.includes("url(")) node.style.backgroundImage = `url("${texture}")`;
    }
  }
  if (snapshot.page.caption) {
    const caption = frameCaptionStyle(snapshot.page);
    const fonts = await Promise.all([...new Set([caption.fontFamily, LAYOUT_CHINESE_FALLBACK_FONT])].map(async (family) => {
      const asset = resolveLayoutFontAsset(family, caption.fontWeight, caption.fontStyle);
      const response = await fetch(asset.url, { signal });
      if (!response.ok) throw new Error("The Frame caption font could not be loaded.");
      return `@font-face { font-family: "${LAYOUT_FONT_BY_FAMILY[family].cssFamily}"; font-weight: ${caption.fontWeight === "bold" ? 700 : 400}; font-style: ${caption.fontStyle ?? "normal"}; src: url("${await dataUrl(await response.blob())}"); }`;
    }));
    const style = document.createElement("style");
    style.textContent = fonts.join("\n");
    clone.prepend(style);
  }
  signal?.throwIfAborted();
  const scale = Math.min(300 / 72, 8192 / Math.max(snapshot.page.widthPt, snapshot.page.heightPt));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(snapshot.page.widthPt * scale));
  canvas.height = Math.max(1, Math.round(snapshot.page.heightPt * scale));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${snapshot.page.widthPt} ${snapshot.page.heightPt}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The Frame image could not be rendered."));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    signal?.throwIfAborted();
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not create the Frame JPEG.");
    context.fillStyle = framePaper(snapshot.page).color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return await encodeJpeg(canvas);
  } finally { image.src = ""; canvas.width = canvas.height = 0; }
}

export async function exportFrameJpeg(frame: WorktableFrame, page: HTMLElement, source: PhotoSource, signal?: AbortSignal): Promise<void> {
  const blob = await createFrameJpeg(frame, page, source, signal);
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${frame.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim() || "Frame"}.jpeg`;
  try { document.body.append(link); link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
