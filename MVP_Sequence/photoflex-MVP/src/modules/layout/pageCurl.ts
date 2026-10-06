import {
  layoutReaderSpreadIndex,
  layoutReaderSpreads,
  layoutReaderVisiblePages,
  navigateLayoutReaderPage,
  type ResolvedLayoutReaderMode,
} from "./layoutReader";

export type PageCurlDirection = -1 | 1;

/** Physical book pose, independent of the engine's extra flyleaf. */
export function pageCurlBookPose(page: number, pageCount: number, mode: ResolvedLayoutReaderMode, backCover = false) {
  const spreads = layoutReaderSpreads(pageCount, mode, backCover);
  const spreadIndex = layoutReaderSpreadIndex(spreads, page);
  const spread = spreads[spreadIndex];
  if (mode === "single") {
    return { offset: 0, spine: 0, left: 0, right: (pageCount - page) / Math.max(1, pageCount) };
  }
  const progress = spreadIndex / Math.max(1, spreads.length - 1);
  const hasLeft = spread?.slots[0] != null, hasRight = spread?.slots[1] != null;
  return {
    offset: hasLeft ? (hasRight ? 0 : .5) : -.5,
    spine: hasLeft && hasRight ? 1 : 0,
    left: hasLeft ? progress : 0,
    right: hasRight ? 1 - progress : 0,
  };
}

export type PageCurlNavigationState =
  | { readonly status: "idle"; readonly committedPage: number }
  | {
    readonly status: "turning";
    readonly committedPage: number;
    readonly targetPage: number;
    readonly direction: PageCurlDirection;
  };

const clampPage = (page: number, pageCount: number) => Math.max(0, Math.min(Math.max(0, pageCount - 1), page));

/**
 * Facing mode gets an engine-only flyleaf before logical page zero. This makes
 * the engine's [0,1], [2,3] spreads match the reader's [blank,0], [1,2]
 * spreads without enabling the engine's incompatible hard-back-cover model.
 */
export function pageCurlEnginePage(page: number, mode: ResolvedLayoutReaderMode, pageCount = 0, backCover = false): number {
  if (mode === "single") return Math.max(0, page);
  if (backCover && pageCount > 1 && pageCount % 2 === 1 && page === pageCount - 1) return page + 2;
  return page <= 0 ? 0 : page + 1;
}

/** Translate an engine spread head back to the reader's logical page index. */
export function pageCurlLogicalPage(page: number, mode: ResolvedLayoutReaderMode, pageCount = 0, backCover = false): number {
  if (mode === "single") return Math.max(0, page);
  if (backCover && pageCount > 1 && pageCount % 2 === 1 && page >= pageCount + 1) return pageCount - 1;
  return page <= 1 ? 0 : page - 1;
}

export function createPageCurlNavigationState(page: number, pageCount: number): PageCurlNavigationState {
  return { status: "idle", committedPage: clampPage(page, pageCount) };
}

/** Begin a reversible turn without changing the page exposed to the rest of the reader. */
export function beginPageCurlTurn(
  state: PageCurlNavigationState,
  direction: PageCurlDirection,
  pageCount: number,
  mode: ResolvedLayoutReaderMode,
  backCover = false,
): PageCurlNavigationState {
  if (state.status === "turning") return state;
  const targetPage = navigateLayoutReaderPage(pageCount, state.committedPage, mode, direction, backCover);
  return targetPage === state.committedPage
    ? state
    : { status: "turning", committedPage: state.committedPage, targetPage, direction };
}

/** Begin a reversible direct jump, normalising facing-mode targets to a spread head. */
export function beginPageCurlGoTo(
  state: PageCurlNavigationState,
  page: number,
  pageCount: number,
  mode: ResolvedLayoutReaderMode,
  backCover = false,
): PageCurlNavigationState {
  if (state.status === "turning" || pageCount <= 0) return state;
  const spreads = layoutReaderSpreads(pageCount, mode, backCover);
  const requestedPage = clampPage(page, pageCount);
  const targetPage = layoutReaderVisiblePages(spreads[layoutReaderSpreadIndex(spreads, requestedPage)])[0]
    ?? state.committedPage;
  if (targetPage === state.committedPage) return state;
  return {
    status: "turning",
    committedPage: state.committedPage,
    targetPage,
    direction: targetPage > state.committedPage ? 1 : -1,
  };
}

/** Adopt the page reported by the curl engine after the leaf has landed. */
export function commitPageCurlTurn(
  state: PageCurlNavigationState,
  page: number,
  pageCount: number,
): PageCurlNavigationState {
  const committedPage = clampPage(page, pageCount);
  return state.status === "idle" && state.committedPage === committedPage
    ? state
    : { status: "idle", committedPage };
}

/** Return to the last committed page after a short drag or an interrupted turn. */
export function cancelPageCurlTurn(state: PageCurlNavigationState): PageCurlNavigationState {
  return state.status === "idle" ? state : { status: "idle", committedPage: state.committedPage };
}
