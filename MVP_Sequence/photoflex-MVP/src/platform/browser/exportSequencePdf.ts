import type { PhotoId, PhotoSource, SequencePdfOptions } from "../../contracts";
import { createSequencePdf } from "../../modules/sequence-export";

/** Browser adapter owns decoding, preview leases and the download URL lifecycle. */
export async function exportSequencePdf(options: SequencePdfOptions, photoSource: PhotoSource): Promise<void> {
  const bytes = await createSequencePdf(options, {
    loadJpeg: (photoId, signal) => loadReadingJpeg(photoSource, photoId, signal),
    loadTextJpeg: (item, width, height, signal) => renderTextPageJpeg(item.text, item.fontSize, width, height, signal),
  });
  options.signal?.throwIfAborted();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const name = options.sequence.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  link.download = `${name || "Sequence"}.pdf`;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Keep the URL alive until the browser has consumed the download navigation.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function renderTextPageJpeg(text: string, fontSize: number, width: number, height: number, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  await document.fonts?.ready;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the text page for PDF export.");
  context.scale(scale, scale);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#1a1917";
  context.font = `${fontSize}px Inter, "Microsoft YaHei", "PingFang SC", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const maxWidth = width * .82;
  const lineHeight = fontSize * 1.35;
  const lines = wrapText(context, text, maxWidth);
  const startY = height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => context.fillText(line, width / 2, startY + index * lineHeight, maxWidth));
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The text page could not be prepared for PDF export.")), "image/jpeg", .95));
  signal?.throwIfAborted();
  return new Uint8Array(await jpeg.arrayBuffer());
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) { lines.push(line); line = character; }
      else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

async function loadReadingJpeg(photoSource: PhotoSource, photoId: PhotoId, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const result = await photoSource.derivedPreview(photoId, 2048);
  if (!result.ok) throw new Error("A photo could not be loaded. Reconnect its source folder and retry exporting.");
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        image.onload = null;
        image.onerror = null;
        signal?.removeEventListener("abort", abort);
        error ? reject(error) : resolve();
      };
      const abort = () => finish(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
      image.onload = () => finish();
      image.onerror = () => finish(new Error("A photo could not be decoded. Check its source file and retry exporting."));
      signal?.addEventListener("abort", abort, { once: true });
      image.src = result.value.url;
    });
    signal?.throwIfAborted();
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare photos for PDF export.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("A photo could not be prepared for PDF export.")), "image/jpeg", 0.95,
    ));
    signal?.throwIfAborted();
    return new Uint8Array(await jpeg.arrayBuffer());
  } finally {
    image.src = "";
    canvas.width = canvas.height = 0;
    result.value.release();
  }
}
