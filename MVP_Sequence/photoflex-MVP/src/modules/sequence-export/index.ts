import { PDFDocument, rgb } from "pdf-lib";
import type { SequencePdfImageSource, SequencePdfOptions } from "../../contracts";
import { createSequenceLookup, readingPaperLayout, readingUnitItemIds, READING_PHOTO_INSET } from "../sequence";

/** Produces one white PDF page per Reading Unit. No DOM, storage writes or downloads. */
export async function createSequencePdf(options: SequencePdfOptions, images: SequencePdfImageSource): Promise<Uint8Array> {
  const { sequence, viewport, signal, onProgress } = options;
  signal?.throwIfAborted();
  if (!sequence.readingUnits.length) throw new Error("This Sequence has no pages to export.");
  const { itemById } = createSequenceLookup(sequence);
  const pdf = await PDFDocument.create();
  pdf.setTitle(sequence.name);
  pdf.setCreator("PhotoFlex");
  const total = sequence.readingUnits.length;
  onProgress?.({ completed: 0, total });
  // Process sequentially so only one decoded preview is held at a time.
  for (const [index, unit] of sequence.readingUnits.entries()) {
    signal?.throwIfAborted();
    const ids = readingUnitItemIds(unit);
    const layout = readingPaperLayout(viewport, ids.length);
    const pt = 0.75;
    const page = pdf.addPage([layout.width * pt, layout.height * pt]);
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: rgb(1, 1, 1) });
    for (const [slot, id] of ids.entries()) {
      const item = itemById.get(id);
      if (!item) throw new Error(`Reading page ${index + 1} contains an unavailable item.`);
      if (item.kind === "blank") continue;
      const bytes = await images.loadJpeg(item.photoId, signal);
      signal?.throwIfAborted();
      const image = await pdf.embedJpg(bytes);
      const available = 1 - READING_PHOTO_INSET * 2;
      const scale = Math.min(layout.paperWidth * available / image.width, layout.height * available / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: (slot * (layout.paperWidth + layout.gap) + (layout.paperWidth - width) / 2) * pt,
        y: (layout.height - height) / 2 * pt,
        width: width * pt, height: height * pt,
      });
      await pdf.flush();
    }
    onProgress?.({ completed: index + 1, total });
  }
  signal?.throwIfAborted();
  const bytes = await pdf.save();
  signal?.throwIfAborted();
  return bytes;
}
