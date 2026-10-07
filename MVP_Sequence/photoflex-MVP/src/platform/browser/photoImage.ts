import { supportedPhotoFormat, type PhotoFormat } from "../../contracts/photoFormats";

export interface PhotoImageInfo { readonly format: PhotoFormat; readonly animated: boolean }

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));

/** Inspect container metadata, rather than trusting MIME or treating an APNG poster as frame zero. */
export async function inspectPhotoImage(file: Blob): Promise<PhotoImageInfo> {
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (header[0] === 0xff && header[1] === 0xd8) return { format: "jpg", animated: false };
  if (header[0] === 137 && ascii(header, 1, 7) === "PNG\r\n\x1a\n") {
    // acTL precedes IDAT even when the default PNG image is outside the animation.
    for (let offset = 8; offset + 8 <= file.size;) {
      const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      const kind = ascii(chunk, 4, 4);
      if (kind === "acTL") return { format: "png", animated: true };
      if (kind === "IDAT" || kind === "IEND") break;
      offset += new DataView(chunk.buffer).getUint32(0) + 12;
    }
    return { format: "png", animated: false };
  }
  if (ascii(header, 0, 4) === "RIFF" && ascii(header, 8, 4) === "WEBP") {
    return { format: "webp", animated: ascii(header, 12, 4) === "VP8X" && (header[20] & 2) !== 0 };
  }
  const format = supportedPhotoFormat((file as File).name ?? "")
    ?? (file.type === "image/png" || file.type === "image/apng" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
  return { format, animated: false };
}

/** All photo consumers share orientation and animation-frame selection. Caller closes the bitmap. */
export async function decodePhotoImage(file: Blob, info?: PhotoImageInfo): Promise<ImageBitmap> {
  const image = info ?? await inspectPhotoImage(file);
  if (!image.animated) return createImageBitmap(file);
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(),
    type: image.format === "png" ? "image/png" : "image/webp", preferAnimation: true });
  try {
    const frame = await decoder.decode({ frameIndex: 0 });
    try { return await createImageBitmap(frame.image); }
    finally { frame.image.close(); }
  } finally { decoder.close(); }
}

export function encodePhotoCanvas(canvas: HTMLCanvasElement, format: "jpg" | "png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob)
    : reject(new Error("A photo could not be encoded.")), format === "png" ? "image/png" : "image/jpeg", quality));
}

/** Original-size previews must also be static; original-file copying remains a separate path. */
export async function staticPhotoPreview(file: Blob): Promise<Blob> {
  const info = await inspectPhotoImage(file);
  if (!info.animated) return file;
  const bitmap = await decodePhotoImage(file, info);
  const canvas = document.createElement("canvas");
  try {
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare a photo preview.");
    context.drawImage(bitmap, 0, 0);
    return await encodePhotoCanvas(canvas, "png");
  } finally { bitmap.close(); canvas.width = canvas.height = 0; }
}
