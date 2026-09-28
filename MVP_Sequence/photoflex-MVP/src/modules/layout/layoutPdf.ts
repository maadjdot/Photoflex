import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames, clip, degrees, endMarkedContent, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFImage } from "pdf-lib";
import type { LayoutDocument, LayoutFontFamily, LayoutFontStyle, LayoutFontWeight, LayoutImageFrame, LayoutObject, LayoutTextBox, PhotoId } from "../../contracts";
import { LAYOUT_CHINESE_FALLBACK_FONT, layoutFontStyle, layoutFontWeight } from "./layoutFonts";
import { layoutText } from "./layoutText";
import { resolveImagePlacement } from "../page-layout/pageGeometry";

export interface LayoutPdfPhoto { readonly bytes: Uint8Array; readonly width: number; readonly height: number;
  readonly renderedRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } }
export interface LayoutPdfFontSource {
  readonly family: LayoutFontFamily;
  readonly weight: LayoutFontWeight;
  readonly style: LayoutFontStyle;
  readonly bytes: Uint8Array;
  readonly syntheticBold: boolean;
  readonly syntheticItalic: boolean;
}
export interface LayoutPdfAssets {
  readonly fonts: readonly LayoutPdfFontSource[];
  loadPhoto(photoId: PhotoId, frame: LayoutImageFrame, signal?: AbortSignal): Promise<LayoutPdfPhoto>;
  imageKey?(frame: LayoutImageFrame): string;
  measureText?(text: string, fontSizePt: number, fontFamily: LayoutFontFamily, weight: LayoutFontWeight, style: LayoutFontStyle): number;
}
export interface LayoutPdfProgress { readonly completed: number; readonly total: number }

/** Render the immutable export snapshot in document order. All dimensions are physical points. */
export async function createLayoutPdf(snapshot: LayoutDocument, assets: LayoutPdfAssets, signal?: AbortSignal,
  onProgress?: (progress: LayoutPdfProgress) => void): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const textBoxes = snapshot.pages.flatMap((page) => page.objects.filter((object): object is LayoutTextBox => object.kind === "text-box"));
  const sources = new Map(assets.fonts.map((source) => [fontKey(source.family, source.weight, source.style), source]));
  const fonts = new Map<string, EmbeddedFont>();
  const embedFont = async (family: LayoutFontFamily, weight: LayoutFontWeight, style: LayoutFontStyle) => {
    const key = fontKey(family, weight, style);
    const existing = fonts.get(key);
    if (existing) return existing;
    const source = sources.get(key);
    if (!source) throw new Error(`The Layout font "${family}" could not be loaded.`);
    const font = await pdf.embedFont(source.bytes, { subset: false });
    const embedded = { font, characters: new Set(font.getCharacterSet()),
      syntheticBold: source.syntheticBold, syntheticItalic: source.syntheticItalic };
    fonts.set(key, embedded);
    return embedded;
  };
  for (const box of textBoxes) await embedFont(box.style.fontFamily, layoutFontWeight(box.style.fontWeight), layoutFontStyle(box.style.fontStyle));
  for (const box of textBoxes) {
    const weight = layoutFontWeight(box.style.fontWeight), style = layoutFontStyle(box.style.fontStyle);
    const primary = fonts.get(fontKey(box.style.fontFamily, weight, style))!;
    const needsFallback = [...box.text].some((character) => character !== "\r" && character !== "\n"
      && !primary.characters.has(character.codePointAt(0)!));
    if (needsFallback) await embedFont(LAYOUT_CHINESE_FALLBACK_FONT, weight, style);
  }
  pdf.setTitle(snapshot.name);
  pdf.setCreator("PhotoFlex");
  const embedded = new Map<string, { image: PDFImage; width: number; height: number; renderedRect?: LayoutPdfPhoto["renderedRect"] }>();
  onProgress?.({ completed: 0, total: snapshot.pages.length });
  for (const [index] of snapshot.pages.entries()) {
    signal?.throwIfAborted();
    const { widthPt, heightPt } = snapshot.pageSpec;
    const page = pdf.addPage([widthPt, heightPt]);
    page.drawRectangle({ x: 0, y: 0, width: widthPt, height: heightPt, color: rgb(1, 1, 1) });
    const visibleObjects: LayoutObject[] = [...snapshot.pages[index].objects];
    // A physical spread consists of odd/even page pairs after the cover.
    if (index > 0 && index % 2 === 0) visibleObjects.push(...snapshot.pages[index - 1].objects
      .filter((object) => object.rect.x + object.rect.width > widthPt)
      .map((object) => ({ ...object, rect: { ...object.rect, x: object.rect.x - widthPt } })));
    if (index > 0 && index % 2 === 1 && index + 1 < snapshot.pages.length) visibleObjects.push(...snapshot.pages[index + 1].objects
      .filter((object) => object.rect.x < 0)
      .map((object) => ({ ...object, rect: { ...object.rect, x: object.rect.x + widthPt } })));
    for (const object of visibleObjects) {
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
      } else drawText(page, object, heightPt, fonts, assets.measureText);
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
interface EmbeddedFont { readonly font: Font; readonly characters: ReadonlySet<number>; readonly syntheticBold: boolean; readonly syntheticItalic: boolean }
interface FontRun { readonly text: string; readonly font: EmbeddedFont }

const fontKey = (family: LayoutFontFamily, weight: LayoutFontWeight, style: LayoutFontStyle) => `${family}:${weight}:${style}`;

function fontRuns(text: string, primary: EmbeddedFont, fallback: EmbeddedFont): FontRun[] {
  const runs: Array<{ text: string; font: EmbeddedFont }> = [];
  for (const character of text) {
    const font = primary.characters.has(character.codePointAt(0)!) ? primary : fallback;
    const previous = runs.at(-1);
    if (previous?.font === font) previous.text += character;
    else runs.push({ text: character, font });
  }
  return runs;
}

function runWidth(runs: readonly FontRun[], size: number): number {
  return runs.reduce((width, run) => width + run.font.font.widthOfTextAtSize(run.text, size), 0);
}

function drawText(page: Page, box: LayoutTextBox, pageHeight: number, fonts: ReadonlyMap<string, EmbeddedFont>,
  measure?: (text: string, size: number, family: LayoutFontFamily, weight: LayoutFontWeight, style: LayoutFontStyle) => number): void {
  const weight = layoutFontWeight(box.style.fontWeight), style = layoutFontStyle(box.style.fontStyle);
  const primary = fonts.get(fontKey(box.style.fontFamily, weight, style))!;
  const fallback = fonts.get(fontKey(LAYOUT_CHINESE_FALLBACK_FONT, weight, style)) ?? primary;
  const result = layoutText(box, measure
    ? (text, size) => measure(text, size, box.style.fontFamily, weight, style)
    : (text, size) => runWidth(fontRuns(text, primary, fallback), size));
  const { x, y, width, height } = box.rect;
  page.pushOperators(pushGraphicsState(), rectangle(x, pageHeight - y - height, width, height), clip(), endPath());
  const color = box.style.color.match(/^#([0-9a-f]{6})$/i)?.[1] ?? "1a1917";
  const ink = rgb(parseInt(color.slice(0, 2), 16) / 255, parseInt(color.slice(2, 4), 16) / 255, parseInt(color.slice(4, 6), 16) / 255);
  for (const [index, line] of result.lines.entries()) {
    if (!line.text) continue;
    const runs = fontRuns(line.text, primary, fallback);
    const lineWidth = runWidth(runs, box.style.fontSizePt);
    const alignOffset = box.style.align === "right" ? width - lineWidth : box.style.align === "center" ? (width - lineWidth) / 2 : 0;
    // CSS line boxes start at the top; the baseline sits about one font size below it.
    const baseline = pageHeight - y - box.style.fontSizePt - index * result.lineHeightPt;
    if (baseline < pageHeight - y - height - box.style.fontSizePt) break;
    page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("Span"), `<< /ActualText ${PDFHexString.fromText(line.text)} >>`]));
    let runX = x + alignOffset;
    for (const run of runs) {
      const options = { x: runX, y: baseline, font: run.font.font, size: box.style.fontSizePt, color: ink,
        lineHeight: result.lineHeightPt, xSkew: run.font.syntheticItalic ? degrees(12) : undefined };
      page.drawText(run.text, options);
      if (run.font.syntheticBold) page.drawText(run.text, { ...options, x: runX + Math.max(.18, box.style.fontSizePt * .018) });
      runX += run.font.font.widthOfTextAtSize(run.text, box.style.fontSizePt);
    }
    page.pushOperators(endMarkedContent());
  }
  page.pushOperators(popGraphicsState());
}
