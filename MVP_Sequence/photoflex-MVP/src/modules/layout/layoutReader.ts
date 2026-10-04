import type { DerivedPreviewMaxEdge, LayoutDocument, LayoutObject } from "../../contracts";

/** Clip each physical face independently, including content crossing its spine. */
export function layoutReaderPageObjects(document: LayoutDocument, pageIndex: number): readonly LayoutObject[] {
  const objects = document.pages[pageIndex].objects;
  if (pageIndex === 0) return objects;
  const left = pageIndex % 2 === 1;
  const neighbour = document.pages[pageIndex + (left ? 1 : -1)];
  if (!neighbour) return objects;
  const width = document.pageSpec.widthPt;
  const overflow = neighbour.objects.filter((object) => left ? object.rect.x < 0 : object.rect.x + object.rect.width > width)
    .map((object) => ({ ...object, rect: { ...object.rect, x: object.rect.x + (left ? width : -width) } }));
  return [...objects, ...overflow];
}

export type LayoutReaderMode = "auto" | "single" | "facing";
export type ResolvedLayoutReaderMode = Exclude<LayoutReaderMode, "auto">;

export interface LayoutReaderSpread {
  readonly slots: readonly (number | null)[];
}

export interface LayoutReaderState {
  readonly mode: LayoutReaderMode;
  readonly currentPage: number;
  readonly zoom: number;
}

export type LayoutReaderAction =
  | { readonly type: "go-to-page"; readonly page: number; readonly pageCount: number }
  | { readonly type: "set-mode"; readonly mode: LayoutReaderMode }
  | { readonly type: "set-zoom"; readonly zoom: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function createLayoutReaderState(initialPage: number, pageCount: number): LayoutReaderState {
  return { mode: "auto", currentPage: clamp(initialPage, 0, Math.max(0, pageCount - 1)), zoom: 1 };
}

export function resolveLayoutReaderMode(mode: LayoutReaderMode, viewport: { width: number; height: number }): ResolvedLayoutReaderMode {
  if (mode !== "auto") return mode;
  return viewport.width >= 860 && viewport.width / Math.max(1, viewport.height) >= .9 ? "facing" : "single";
}

/** Page zero is a right-hand cover. Physical pages then pair as 2-3, 4-5, and so on. */
export function layoutReaderSpreads(pageCount: number, mode: ResolvedLayoutReaderMode): readonly LayoutReaderSpread[] {
  if (pageCount <= 0) return [];
  if (mode === "single") return Array.from({ length: pageCount }, (_, index) => ({ slots: [index] }));
  const spreads: LayoutReaderSpread[] = [{ slots: [null, 0] }];
  for (let index = 1; index < pageCount; index += 2) spreads.push({ slots: [index, index + 1 < pageCount ? index + 1 : null] });
  return spreads;
}

export function layoutReaderSpreadIndex(spreads: readonly LayoutReaderSpread[], page: number): number {
  const index = spreads.findIndex((spread) => spread.slots.includes(page));
  return index >= 0 ? index : 0;
}

export function layoutReaderVisiblePages(spread: LayoutReaderSpread | undefined): readonly number[] {
  return spread?.slots.filter((page): page is number => page !== null) ?? [];
}

export function layoutReaderPageLabel(spread: LayoutReaderSpread | undefined, pageCount: number): string {
  const pages = layoutReaderVisiblePages(spread).map((page) => page + 1);
  return `${pages.join("–")} / ${pageCount}`;
}

export function navigateLayoutReaderPage(pageCount: number, currentPage: number, mode: ResolvedLayoutReaderMode, direction: -1 | 1): number {
  const spreads = layoutReaderSpreads(pageCount, mode);
  if (!spreads.length) return 0;
  const currentSpread = layoutReaderSpreadIndex(spreads, currentPage);
  const target = spreads[clamp(currentSpread + direction, 0, spreads.length - 1)];
  return layoutReaderVisiblePages(target)[0] ?? currentPage;
}

export function layoutReaderFitPage(viewport: { width: number; height: number }, pageSpec: { widthPt: number; heightPt: number }, slotCount: number) {
  const horizontalInset = viewport.width < 640 ? 32 : 96;
  // Leave room for the rigid page's projected top/bottom edges during a turn.
  const verticalInset = viewport.height < 700 ? 136 : 184;
  const gap = slotCount > 1 ? 2 : 0;
  const availableWidth = Math.max(120, viewport.width - horizontalInset - gap);
  const availableHeight = Math.max(120, viewport.height - verticalInset);
  const scale = Math.min(availableHeight / pageSpec.heightPt, availableWidth / (pageSpec.widthPt * Math.max(1, slotCount)));
  return { width: pageSpec.widthPt * scale, height: pageSpec.heightPt * scale, gap };
}

export function layoutReaderPreviewEdge(page: { width: number; height: number }, zoom: number, pixelRatio: number): DerivedPreviewMaxEdge {
  const required = Math.max(page.width, page.height) * zoom * Math.max(1, pixelRatio);
  return required <= 768 ? 768 : required <= 1536 ? 1536 : 2048;
}

export function layoutReaderReducer(state: LayoutReaderState, action: LayoutReaderAction): LayoutReaderState {
  if (action.type === "set-mode") return { ...state, mode: action.mode, zoom: 1 };
  if (action.type === "set-zoom") return { ...state, zoom: Math.round(clamp(action.zoom, .5, 3) * 100) / 100 };
  const nextPage = clamp(action.page, 0, Math.max(0, action.pageCount - 1));
  if (nextPage === state.currentPage) return state;
  return { ...state, currentPage: nextPage };
}
