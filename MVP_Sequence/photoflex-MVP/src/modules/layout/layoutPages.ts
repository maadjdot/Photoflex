import type { LayoutDocument, LayoutImageFrame, LayoutObjectId, LayoutPage, LayoutPageId, LayoutTextBox, SequenceDocument, SequenceItem } from "../../contracts";
import { createEmptyLayout } from "./layoutDocument";
import { defaultCrop, defaultTemplate, templateRects, type PageRect } from "../page-layout/pageGeometry";

export type LayoutStart = "sequence" | "blank";

export function sequenceLayoutPreview(sequence: SequenceDocument): { pages: number; insertedBlanks: number; simplifiedText: number } {
  const pages = sequenceLayoutPages(sequence, { widthPt: 210 * 72 / 25.4, heightPt: 297 * 72 / 25.4 }, () => "preview");
  return { pages: Math.max(1, pages.length), insertedBlanks: pages.filter((page) => page.insertedBlank).length,
    simplifiedText: sequence.readingUnits.flatMap((unit) => unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId])
      .filter((id) => sequence.items.find((item) => item.id === id)?.kind === "text").length };
}

export function createLayoutFromSequence(input: {
  sequence: SequenceDocument; id: LayoutDocument["id"]; name: string; widthPt: number; heightPt: number;
  start: LayoutStart; now: string; newId?: () => string;
}): LayoutDocument {
  const newId = input.newId ?? (() => crypto.randomUUID());
  const first = createEmptyLayout({ id: input.id, projectId: input.sequence.projectId, sequenceId: input.sequence.id,
    pageId: newId() as LayoutPageId, name: input.name, createdAt: input.now, widthPt: input.widthPt, heightPt: input.heightPt });
  if (input.start === "blank") return first;
  const pages = sequenceLayoutPages(input.sequence, first.pageSpec, newId).map(({ page }) => page);
  return { ...first, pages: pages.length ? pages : first.pages };
}

function sequenceLayoutPages(sequence: SequenceDocument, spec: LayoutDocument["pageSpec"], newId: () => string) {
  const items = new Map(sequence.items.map((item) => [item.id, item]));
  const pages: Array<{ page: LayoutPage; insertedBlank: boolean }> = [];
  const add = (item?: SequenceItem, insertedBlank = false) => {
    const objects: Array<LayoutImageFrame | LayoutTextBox> = [];
    if (item?.kind === "photo") {
      const rect = templateRects(spec.widthPt, spec.heightPt, defaultTemplate("single"))[0];
      objects.push({ kind: "image-frame", id: newId() as LayoutObjectId, rect, photoId: item.photoId, crop: defaultCrop("single") });
    } else if (item?.kind === "text" && item.text) {
      const rect: PageRect = templateRects(spec.widthPt, spec.heightPt, defaultTemplate("single"))[0];
      objects.push({ kind: "text-box", id: newId() as LayoutObjectId, rect, text: item.text,
        style: { fontFamily: "noto-sans-sc", fontSizePt: 12, lineHeight: 1.4, color: "#171513", align: "left" } });
    }
    pages.push({ page: { id: newId() as LayoutPageId, objects }, insertedBlank });
  };
  for (const unit of sequence.readingUnits) {
    if (unit.kind === "spread") {
      if (pages.length % 2 === 0) add(undefined, true);
      add(items.get(unit.leftItemId));
      add(items.get(unit.rightItemId));
    } else add(items.get(unit.itemId));
  }
  return pages;
}

/** Page zero sits alone on the right. Remaining physical pages pair in order. */
export function facingPageIndices(pageCount: number, selectedIndex: number): readonly [number | null, number | null] {
  if (selectedIndex <= 0) return [null, 0];
  const left = selectedIndex % 2 === 1 ? selectedIndex : selectedIndex - 1;
  return [left, left + 1 < pageCount ? left + 1 : null];
}
