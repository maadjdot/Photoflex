import type { LayoutDocument } from "../../contracts";

/** Covers occupy physical faces but do not count toward body numbering. */
export function layoutPageNumber(document: LayoutDocument, pageIndex: number): number | null {
  const page = document.pages[pageIndex];
  if (!page || page.kind) return null;
  return pageIndex + 1 - (document.pages[0].kind === "cover" ? 1 : 0);
}

export function layoutPageLabel(document: LayoutDocument, pageIndex: number, zh = false): string {
  const kind = document.pages[pageIndex].kind;
  if (kind === "cover") return zh ? "封面" : "Front cover";
  if (kind === "back-cover") return zh ? "封底" : "Back cover";
  const number = layoutPageNumber(document, pageIndex);
  return zh ? `第 ${number} 页` : `Page ${number}`;
}

export function layoutPageProgressLabel(document: LayoutDocument, pageIndices: readonly number[], zh = false): string {
  const numbers = pageIndices.map((index) => layoutPageNumber(document, index)).filter((number) => number !== null);
  if (!numbers.length) return pageIndices.map((index) => layoutPageLabel(document, index, zh)).join("–");
  const bodyCount = document.pages.filter((page) => !page.kind).length;
  return `${numbers.join("–")} / ${bodyCount}`;
}
