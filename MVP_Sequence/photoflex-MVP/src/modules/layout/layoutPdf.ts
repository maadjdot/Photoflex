import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames, clip, endMarkedContent, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFImage } from "pdf-lib";
import type { LayoutDocument, LayoutImageFrame, LayoutTextBox, PhotoId } from "../../contracts";
import { layoutText } from "./layoutText";
import { resolveImagePlacement } from "../page-layout/pageGeometry";

export interface LayoutPdfPhoto { readonly bytes: Uint8Array; readonly width: number; readonly height: number;
  readonly renderedRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } }
export interface LayoutPdfAssets {
  readonly fontBytes: Uint8Array;
  loadPhoto(photoId: PhotoId, frame: LayoutImageFrame, signal?: AbortSignal): Promise<LayoutPdfPhoto>;
  imageKey?(frame: LayoutImageFrame): string;
  measureText?(text: string, fontSizePt: number): number;
}
export interface LayoutPdfProgress { readonly completed: number; readonly total: number }

/** Render the immutable export snapshot in document order. All dimensions are physical points. */
export async function createLayoutPdf(snapshot: LayoutDocument, assets: LayoutPdfAssets, signal?: AbortSignal,
  onProgress?: (progress: LayoutPdfProgress) => void): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(assets.fontBytes, { subset: false });
  pdf.setTitle(snapshot.name);
  pdf.setCreator("PhotoFlex");
  const embedded = new Map<string, { image: PDFImage; width: number; height: number; renderedRect?: LayoutPdfPhoto["renderedRect"] }>();
  onProgress?.({ completed: 0, total: snapshot.pages.length });
  for (const [index, sourcePage] of snapshot.pages.entries()) {
    signal?.throwIfAborted();
    const { widthPt, heightPt } = snapshot.pageSpec;
    const page = pdf.addPage([widthPt, heightPt]);
    page.drawRectangle({ x: 0, y: 0, width: widthPt, height: heightPt, color: rgb(1, 1, 1) });
    for (const object of sourcePage.objects) {
      signal?.throwIfAborted();
      if (object.kind === "image-frame") {
        if (!object.photoId) throw new Error(`Page ${index + 1} has an empty image frame.`);
        const key = assets.imageKey?.(object) ?? object.photoId;
        let entry = embedded.get(key);
        if (!entry) {
          const photo = await assets.loadPhoto(object.photoId, object, signal);
          signal?.throwIfAborted();
          entry = { image: await pdf.embedJpg(photo.bytes), width: photo.width, height: photo.height, renderedRect: photo.renderedRect };
          embedded.set(key, entry);
        }
        const x = object.rect.x, y = heightPt - object.rect.y - object.rect.height;
        if (entry.renderedRect) page.drawImage(entry.image, { x: x + entry.renderedRect.x,
          y: y + object.rect.height - entry.renderedRect.y - entry.renderedRect.height,
          width: entry.renderedRect.width, height: entry.renderedRect.height });
        else {
          const placed = resolveImagePlacement(entry, object.rect, object.crop);
          page.pushOperators(pushGraphicsState(), rectangle(x, y, object.rect.width, object.rect.height), clip(), endPath());
          page.drawImage(entry.image, { x: x + placed.x, y: y + object.rect.height - placed.y - placed.height,
            width: placed.width, height: placed.height });
          page.pushOperators(popGraphicsState());
        }
      } else drawText(page, object, heightPt, font, assets.measureText);
    }
    await pdf.flush();
    onProgress?.({ completed: index + 1, total: snapshot.pages.length });
  }
  signal?.throwIfAborted();
  const bytes = await pdf.save();
  signal?.throwIfAborted();
  return bytes;
}

type Page = ReturnType<PDFDocument["addPage"]>;
type Font = Awaited<ReturnType<PDFDocument["embedFont"]>>;
function drawText(page: Page, box: LayoutTextBox, pageHeight: number, font: Font, measure?: (text: string, size: number) => number): void {
  const result = layoutText(box, measure ?? ((text, size) => font.widthOfTextAtSize(text, size)));
  const { x, y, width, height } = box.rect;
  page.pushOperators(pushGraphicsState(), rectangle(x, pageHeight - y - height, width, height), clip(), endPath());
  const color = box.style.color.match(/^#([0-9a-f]{6})$/i)?.[1] ?? "1a1917";
  const ink = rgb(parseInt(color.slice(0, 2), 16) / 255, parseInt(color.slice(2, 4), 16) / 255, parseInt(color.slice(4, 6), 16) / 255);
  for (const [index, line] of result.lines.entries()) {
    if (!line.text) continue;
    const lineWidth = font.widthOfTextAtSize(line.text, box.style.fontSizePt);
    const alignOffset = box.style.align === "right" ? width - lineWidth : box.style.align === "center" ? (width - lineWidth) / 2 : 0;
    // CSS line boxes start at the top; the baseline sits about one font size below it.
    const baseline = pageHeight - y - box.style.fontSizePt - index * result.lineHeightPt;
    if (baseline < pageHeight - y - height - box.style.fontSizePt) break;
    page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("Span"), `<< /ActualText ${PDFHexString.fromText(line.text)} >>`]));
    page.drawText(line.text, { x: x + alignOffset, y: baseline, font, size: box.style.fontSizePt, color: ink, lineHeight: result.lineHeightPt });
    page.pushOperators(endMarkedContent());
  }
  page.pushOperators(popGraphicsState());
}
