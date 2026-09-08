import type { ReadingUnit, SequenceItemId } from "../../contracts";

/** Shared by Read and PDF: paper geometry in CSS pixels; photos fit without cropping. */
export const READING_PHOTO_INSET = 0.06;

export function readingUnitItemIds(unit: ReadingUnit): readonly SequenceItemId[] {
  return unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId];
}

export function readingPaperLayout(viewport: { width: number; height: number }, count: number) {
  const gap = 6;
  const paperWidth = Math.min(760, (Math.min(viewport.width * 0.82, 1280) - gap * (count - 1)) / count);
  const height = Math.min(viewport.height * 0.78, 860);
  return { paperWidth, height, gap, width: paperWidth * count + gap * (count - 1) };
}
