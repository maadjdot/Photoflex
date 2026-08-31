export interface ContactSheetVirtualGridInput {
  readonly photoCount: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly scrollTop: number;
  readonly targetTileWidth?: number;
  readonly overscanRows?: number;
}

export interface ContactSheetVirtualGrid {
  readonly columns: number;
  readonly gap: number;
  readonly tileWidth: number;
  readonly rowHeight: number;
  readonly totalHeight: number;
  readonly firstVisibleIndex: number;
  readonly startIndex: number;
  readonly endIndex: number;
}

const GAP = 18;
const TARGET_TILE_WIDTH = 205;
const MIN_COLUMNS = 2;
const PHOTO_ASPECT_HEIGHT = 0.75;
const META_AND_GAP_HEIGHT = 58;
const DEFAULT_OVERSCAN_ROWS = 2;

/**
 * Calculates the complete fixed-row virtual grid without reading the DOM.
 * Keeping this as one pure interface lets React render only the returned range
 * while tests can exercise the same layout rules with no browser setup.
 */
export function calculateContactSheetVirtualGrid(
  input: ContactSheetVirtualGridInput,
): ContactSheetVirtualGrid {
  const photoCount = Math.max(0, Math.floor(input.photoCount));
  const viewportWidth = Math.max(1, input.viewportWidth);
  const viewportHeight = Math.max(0, input.viewportHeight);
  const targetTileWidth = Math.max(120, input.targetTileWidth ?? TARGET_TILE_WIDTH);
  const overscanRows = Math.max(0, Math.floor(input.overscanRows ?? DEFAULT_OVERSCAN_ROWS));
  const columns = Math.max(MIN_COLUMNS, Math.floor((viewportWidth + GAP) / targetTileWidth));
  const tileWidth = (viewportWidth - GAP * (columns - 1)) / columns;
  const rowHeight = Math.round(tileWidth * PHOTO_ASPECT_HEIGHT + META_AND_GAP_HEIGHT);
  const rowCount = Math.ceil(photoCount / columns);
  const totalHeight = rowCount * rowHeight;

  if (!photoCount) {
    return { columns, gap: GAP, tileWidth, rowHeight, totalHeight, firstVisibleIndex: 0, startIndex: 0, endIndex: 0 };
  }

  // Browser scrollTop is bounded by the content height. Clamping here keeps
  // restored positions safe when a filter makes the photo list shorter.
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  const scrollTop = Math.min(maxScrollTop, Math.max(0, input.scrollTop));
  const firstVisibleRow = Math.min(rowCount - 1, Math.floor(scrollTop / rowHeight));
  const firstRenderedRow = Math.max(0, firstVisibleRow - overscanRows);
  const lastRenderedRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscanRows,
  );

  return {
    columns,
    gap: GAP,
    tileWidth,
    rowHeight,
    totalHeight,
    firstVisibleIndex: firstVisibleRow * columns,
    startIndex: firstRenderedRow * columns,
    endIndex: Math.min(photoCount, lastRenderedRow * columns),
  };
}
