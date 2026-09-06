import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { PhotoId, PhotoRef, SourceError } from "../contracts";
import { calculateContactSheetVirtualGrid, type ContactSheetVirtualGrid } from "../modules/contactSheet/contactSheetVirtualizer";
import { PhotoThumb } from "./PhotoThumb";
import type { AppDependencies } from "./dependencies";

export function VirtualPhotoGrid({ photos, selected, tableIds, missingIds, zoom = 75, initialAnchorPhotoId, onAnchorChange, onToggle, onOpen, onNearEnd, onPhotoSourceError, photoSource }: { readonly photos: readonly PhotoRef[]; readonly selected: ReadonlySet<PhotoId>; readonly tableIds: readonly PhotoId[]; readonly missingIds: ReadonlySet<PhotoId>; readonly zoom?: number; readonly initialAnchorPhotoId?: PhotoId; readonly onAnchorChange: (photoId: PhotoId | undefined) => void; readonly onToggle: (photoId: PhotoId, index: number, event?: ReactMouseEvent<HTMLElement>) => void; readonly onOpen: (index: number) => void; readonly onNearEnd: () => void; readonly onPhotoSourceError: (photoId: PhotoId, error: SourceError) => void; readonly photoSource: AppDependencies["photoSource"]; }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // Resume only once when the page mounts.  Subsequent anchor updates are
  // persistence metadata, never instructions to snap a reader back in place.
  const restoredAnchorRef = useRef(false);
  const frameRef = useRef<number | undefined>(undefined);
  const latestScrollTopRef = useRef(0);
  const photosRef = useRef(photos);
  const targetTileWidthRef = useRef(205 * zoom / 75);
  const gridRef = useRef<ContactSheetVirtualGrid>(calculateContactSheetVirtualGrid({
    photoCount: photos.length,
    viewportWidth: 860,
    viewportHeight: 620,
    scrollTop: 0,
  }));
  const [grid, setGrid] = useState(gridRef.current);
  const tableIdSet = useMemo(() => new Set(tableIds), [tableIds]);
  const onAnchorChangeRef = useRef(onAnchorChange);
  const onNearEndRef = useRef(onNearEnd);
  photosRef.current = photos;
  targetTileWidthRef.current = 205 * zoom / 75;
  onAnchorChangeRef.current = onAnchorChange;
  onNearEndRef.current = onNearEnd;

  const refreshGrid = (notifyScroll: boolean) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const previous = gridRef.current;
    const next = calculateContactSheetVirtualGrid({
      photoCount: photosRef.current.length,
      viewportWidth: viewport.clientWidth || 860,
      viewportHeight: viewport.clientHeight || 620,
      scrollTop: latestScrollTopRef.current,
      targetTileWidth: targetTileWidthRef.current,
    });
    if (!sameVirtualGrid(previous, next)) {
      gridRef.current = next;
      setGrid(next);
    }
    if (notifyScroll && next.firstVisibleIndex !== previous.firstVisibleIndex) {
      onAnchorChangeRef.current(photosRef.current[next.firstVisibleIndex]?.id);
    }
    if (notifyScroll && viewport.scrollTop + viewport.clientHeight > viewport.scrollHeight - next.rowHeight * 2) {
      onNearEndRef.current();
    }
  };

  const scheduleGridRefresh = () => {
    if (frameRef.current !== undefined) return;
    // Scroll events may arrive faster than the browser can paint. One pending
    // frame always reads the newest scrollTop, so intermediate positions cost no render.
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = undefined;
      refreshGrid(true);
    });
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    refreshGrid(false);
    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(scheduleGridRefresh)
      : undefined;
    observer?.observe(viewport);
    if (!observer) window.addEventListener("resize", scheduleGridRefresh);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", scheduleGridRefresh);
      if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    };
  }, []);
  useEffect(() => refreshGrid(false), [photos.length, zoom]);
  useEffect(() => {
    if (restoredAnchorRef.current || !viewportRef.current) return;
    if (!initialAnchorPhotoId) {
      restoredAnchorRef.current = true;
      return;
    }
    const index = photos.findIndex((photo) => photo.id === initialAnchorPhotoId);
    if (index < 0) return;
    viewportRef.current.scrollTop = Math.floor(index / grid.columns) * grid.rowHeight;
    latestScrollTopRef.current = viewportRef.current.scrollTop;
    refreshGrid(false);
    restoredAnchorRef.current = true;
  }, [grid.columns, grid.rowHeight, initialAnchorPhotoId, photos]);
  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    latestScrollTopRef.current = event.currentTarget.scrollTop;
    scheduleGridRefresh();
  };
  const moveFocus = (index: number, delta: number) => {
    const next = Math.max(0, Math.min(photos.length - 1, index + delta));
    if (next === index) return;
    const nextRow = Math.floor(next / grid.columns);
    const viewport = viewportRef.current;
    if (viewport) {
      const rowTop = nextRow * grid.rowHeight;
      if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
      if (rowTop + grid.rowHeight > viewport.scrollTop + viewport.clientHeight) {
        viewport.scrollTop = Math.max(0, rowTop - viewport.clientHeight + grid.rowHeight);
      }
    }
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-photo-index="${next}"]`)?.focus();
    });
  };
  const visible = photos.slice(grid.startIndex, grid.endIndex);
  return <div className="sheet-scroll" ref={viewportRef} onScroll={onScroll} tabIndex={0}><div className="virtual-grid-inner" style={{ height: grid.totalHeight }}><div className="virtual-grid-layer">{visible.map((photo, offset) => { const index = grid.startIndex + offset; const row = Math.floor(index / grid.columns); const column = index % grid.columns; return <PhotoTile key={photo.id} photoSource={photoSource} photo={photo} selected={selected.has(photo.id)} inTable={tableIdSet.has(photo.id)} missing={missingIds.has(photo.id)} index={index} columns={grid.columns} style={{ top: row * grid.rowHeight, left: column * (grid.tileWidth + grid.gap), width: grid.tileWidth, height: grid.rowHeight - grid.gap }} onToggle={(event) => onToggle(photo.id, index, event)} onOpen={() => onOpen(index)} onMoveFocus={moveFocus} onPhotoSourceError={onPhotoSourceError} />; })}</div></div></div>;
}
function sameVirtualGrid(left: ContactSheetVirtualGrid, right: ContactSheetVirtualGrid) {
  return left.columns === right.columns
    && left.tileWidth === right.tileWidth
    && left.rowHeight === right.rowHeight
    && left.totalHeight === right.totalHeight
    && left.firstVisibleIndex === right.firstVisibleIndex
    && left.startIndex === right.startIndex
    && left.endIndex === right.endIndex;
}


function PhotoTile({ photoSource, photo, selected, inTable, missing, index, columns, style, onToggle, onOpen, onMoveFocus, onPhotoSourceError }: { readonly photoSource: AppDependencies["photoSource"]; readonly photo: PhotoRef; readonly selected: boolean; readonly inTable: boolean; readonly missing: boolean; readonly index: number; readonly columns: number; readonly style: CSSProperties; readonly onToggle: (event?: ReactMouseEvent<HTMLElement>) => void; readonly onOpen: () => void; readonly onMoveFocus: (index: number, delta: number) => void; readonly onPhotoSourceError: (photoId: PhotoId, error: SourceError) => void; }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") { event.preventDefault(); onToggle(); }
    if (event.key === "Enter") { event.preventDefault(); onOpen(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); onMoveFocus(index, -1); }
    if (event.key === "ArrowRight") { event.preventDefault(); onMoveFocus(index, 1); }
    if (event.key === "ArrowUp") { event.preventDefault(); onMoveFocus(index, -columns); }
    if (event.key === "ArrowDown") { event.preventDefault(); onMoveFocus(index, columns); }
  };
  const stateLabel = `${selected ? "已选择" : "未选择"}${inTable ? "，已在 Table" : ""}${missing ? "，文件已移动或重命名" : ""}`;

  return (
    <article
      className={`photo-tile${selected ? " is-selected" : ""}${inTable ? " is-in-table" : ""}${missing ? " is-missing" : ""}`}
      data-photo-index={index}
      style={style}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={onToggle}
      onDoubleClick={onOpen}
      draggable
      onDragStart={(event) => event.dataTransfer.setData("application/x-photoflex-photo", photo.id)}
      aria-label={`${photo.relativePath}，${stateLabel}`}
    >
      <div className="photo-image-wrap">
        <PhotoThumb photoSource={photoSource} photoId={photo.id} alt={photo.relativePath} onError={onPhotoSourceError} />
        {inTable && <span className="table-mark">ON TABLE</span>}
        {missing && <span className="missing-mark">MISSING</span>}
        {selected && <span className="check-mark">✓</span>}
      </div>
      <div className="photo-meta">
        <strong>{photo.relativePath.split("/").at(-1)}</strong>
        <button className="view-button" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
          View
        </button>
      </div>
    </article>
  );
}
