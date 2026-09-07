import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type UIEvent } from "react";
import type { PhotoId, PhotoRef, ProjectId, ProjectWorkspace, SourceError, SourceId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { mergeUniquePhotos, stateNeedsScan } from "./AppPrimitives";
import { useSourceMonitor } from "./ProjectSourceMonitor";
import { PhotoThumb } from "./PhotoThumb";
import { calculateContactSheetVirtualGrid } from "../modules/contactSheet/contactSheetVirtualizer";
import chevronIcon from "../assets/icons/table-chevron-down.svg";
import gridIcon from "../assets/icons/table-grid.svg";
import plusIcon from "../assets/icons/table-plus.svg";

type SourceSelection = SourceId | "all";
type SourceFilter = "all" | "not-on-table" | "on-table";
type SourcePanelMode = "compact" | "expanded" | "closed";

export interface SourceBrowserProps {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly workspace: ProjectWorkspace;
  readonly onPlacePhotos: (photos: readonly PhotoRef[]) => Promise<boolean>;
  readonly onOpenPhoto: (photoId: PhotoId) => void;
  readonly onAddSource: () => void;
  readonly onOpenProjectDetails?: () => void;
  readonly projectPanel?: ReactNode;
  readonly onOpenContactSheet?: (sourceId: SourceId) => void;
  readonly onReconnectSource?: (sourceId: SourceId) => void;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
  readonly onPanelModeChange?: (mode: SourcePanelMode) => void;
}

/** Photo Sources browser for Table. It owns only source browsing and pending selection. */
export function SourceBrowser({ dependencies, workspace, onPlacePhotos, onOpenPhoto, onAddSource, onOpenProjectDetails, projectPanel, onOpenContactSheet, onReconnectSource, onPhotoError, onPanelModeChange }: SourceBrowserProps) {
  const sources = workspace.sources;
  const connectedSources = useMemo(() => sources.filter((source) => !source.removedAt), [sources]);
  const uiStorageKey = `photoflex:table-sources:${workspace.projectId}`;
  const storedState = useMemo(() => readPanelState(uiStorageKey, sources), [sources, uiStorageKey]);
  const [mode, setMode] = useState<SourcePanelMode>(storedState.mode);
  const [lastOpenMode, setLastOpenMode] = useState<"compact" | "expanded">(storedState.lastOpenMode);
  const [view, setView] = useState<"sources" | "project">("sources");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [sourceId, setSourceId] = useState<SourceSelection>(storedState.sourceId);
  const [filter, setFilter] = useState<SourceFilter>(storedState.filter);
  const [photos, setPhotos] = useState<readonly PhotoRef[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<PhotoId>>(new Set());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRef>();
  const generationRef = useRef(0);
  const { states, startScan } = useSourceMonitor(dependencies.photoSource, connectedSources);
  const sourceLoadSignal = connectedSources.map((source) => {
    const state = states[source.id];
    return `${source.id}:${state?.status ?? "unknown"}:${(state?.indexedCount ?? 0) > 0 ? "has-photos" : "empty"}`;
  }).join("|");
  const tableIds = useMemo(() => new Set(workspace.worktableDraft.entryOrder), [workspace.worktableDraft.entryOrder]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(uiStorageKey, JSON.stringify({ mode, lastOpenMode, sourceId, filter }));
    } catch {
      // UI context is disposable; storage availability must not affect the project session.
    }
  }, [filter, lastOpenMode, mode, sourceId, uiStorageKey]);
  useEffect(() => { if (mode !== "closed") setLastOpenMode(mode); }, [mode]);
  useEffect(() => onPanelModeChange?.(mode), [mode, onPanelModeChange]);

  useEffect(() => {
    if (sourceId !== "all" && !connectedSources.some((source) => source.id === sourceId)) setSourceId(connectedSources[0]?.id ?? "all");
    connectedSources.forEach((source) => {
      if (stateNeedsScan(states[source.id])) startScan(source.id);
    });
  }, [connectedSources, sourceId, startScan, states]);

  useEffect(() => {
    const generation = ++generationRef.current;
    setLoading(true);
    setPhotos([]);
    setNotice(undefined);
    const sourceIds = sourceId === "all" ? connectedSources.map((source) => source.id) : connectedSources.some((source) => source.id === sourceId) ? [sourceId] : [];
    void (async () => {
      let collected: readonly PhotoRef[] = [];
      const readSource = async (id: SourceId) => {
        let sourcePhotos: readonly PhotoRef[] = [];
        let cursor: string | null | undefined = "0";
        while (cursor !== null) {
          const page = await dependencies.photoSource.listPhotos(id, cursor, 200);
          if (generation !== generationRef.current) return sourcePhotos;
          if (!page.ok) {
            setNotice("照片索引暂时无法读取。");
            break;
          }
          sourcePhotos = mergeUniquePhotos(sourcePhotos, page.value.items);
          setPhotos((current) => mergeUniquePhotos(current, page.value.items));
          cursor = page.value.nextCursor;
        }
        return sourcePhotos;
      };
      for (let index = 0; index < sourceIds.length; index += 2) {
        const batch = await Promise.all(sourceIds.slice(index, index + 2).map(readSource));
        if (generation !== generationRef.current) return;
        batch.forEach((items) => { collected = mergeUniquePhotos(collected, items); });
      }
      if (generation === generationRef.current) setPhotos(collected);
    })().finally(() => {
      if (generation === generationRef.current) setLoading(false);
    });
    return () => { generationRef.current += 1; };
  }, [connectedSources, dependencies.photoSource, sourceId, sourceLoadSignal]);

  const visiblePhotos = useMemo(() => {
    return photos.filter((photo) => {
      if (filter === "not-on-table" && tableIds.has(photo.id)) return false;
      if (filter === "on-table" && !tableIds.has(photo.id)) return false;
      return true;
    });
  }, [filter, photos, tableIds]);
  const selectedVisible = useMemo(() => visiblePhotos.filter((photo) => selected.has(photo.id)), [selected, visiblePhotos]);
  const currentCount = sourceId === "all"
    ? connectedSources.reduce((total, source) => total + (states[source.id]?.indexedCount ?? 0), 0)
    : Math.max(states[sourceId]?.indexedCount ?? 0, photos.length);

  const toggle = (photoId: PhotoId) => setSelected((current) => {
    if (tableIds.has(photoId)) return current;
    const next = new Set(current);
    if (next.has(photoId)) next.delete(photoId); else next.add(photoId);
    return next;
  });
  const eligibleSelected = useMemo(() => selectedVisible.filter((photo) => !tableIds.has(photo.id) && connectedSources.some((source) => source.id === photo.sourceId)), [connectedSources, selectedVisible, tableIds]);
  const placeSelected = async () => {
    if (!eligibleSelected.length) return;
    const placed = await onPlacePhotos(eligibleSelected);
    if (placed) setSelected(new Set());
  };

  if (mode === "closed") return <aside className="table-source-browser is-closed" aria-label="Photo Sources"><button type="button" aria-label="Open Photo Sources" className="table-source-open" onClick={() => setMode(lastOpenMode)}><img src={chevronIcon} alt="" aria-hidden="true" /><span>Photo Sources</span></button></aside>;

  return <aside className={`table-source-browser is-${mode}`} aria-label="Photo Sources">
    <header className="table-source-browser-header">
      <strong>Photo Sources</strong>
      <div className="table-source-header-actions"><button type="button" className="table-source-header-icon" aria-label="Add Source" title="Add Source" onClick={onAddSource}><img src={plusIcon} alt="" /></button><button type="button" title={mode === "compact" ? "Expand Photo Sources" : "Use compact Photo Sources"} aria-label={mode === "compact" ? "Expand Photo Sources" : "Use compact Photo Sources"} className="table-source-header-icon" onClick={() => setMode(mode === "compact" ? "expanded" : "compact")}><img src={gridIcon} alt="" /></button><button type="button" className="table-source-header-icon table-source-collapse" aria-label="Collapse Photo Sources" title="Collapse Photo Sources" onClick={() => setMode("closed")}><img src={chevronIcon} alt="" /></button></div>
    </header>
    {mode === "expanded" && <div className="table-source-project-row"><span><small>PROJECT</small><strong>{workspace.name}</strong></span>{onOpenProjectDetails && <button type="button" onClick={() => { setView("project"); onOpenProjectDetails(); }}>Project details →</button>}</div>}
    {mode === "expanded" && <nav className="table-source-directory" aria-label="Photo source directory"><button type="button" className={sourceId === "all" ? "is-active" : ""} onClick={() => setSourceId("all")}><span>▣ All Sources</span><small>{connectedSources.reduce((total, source) => total + (states[source.id]?.indexedCount ?? 0), 0)}</small></button>{sources.map((source) => <button key={source.id} type="button" className={`${sourceId === source.id ? "is-active " : ""}${source.removedAt ? "is-disconnected" : ""}`} onClick={() => source.removedAt ? onReconnectSource?.(source.id) : setSourceId(source.id)}><span>▣ {source.displayName}</span><small>{source.removedAt ? "Reconnect" : states[source.id]?.indexedCount ?? 0}</small></button>)}</nav>}
    <div className="table-source-browser-content">
    {view === "project" && projectPanel ? <div className="table-source-project-panel">{projectPanel}<button type="button" className="table-source-back" onClick={() => setView("sources")}>← Back to Photo Sources</button></div> : <>
    {mode === "compact" && <div className="table-source-selector-row">
      <label><select aria-label="Select photo source" value={sourceId} onChange={(event) => setSourceId(event.target.value as SourceSelection)}>
          <option value="all">All Sources</option>
          {sources.map((source) => <option key={source.id} value={source.id} disabled={Boolean(source.removedAt)}>{source.displayName}{source.removedAt ? " (Disconnected)" : ""}</option>)}
        </select></label>
    </div>}
    <div className="table-source-title-row"><div>{mode === "expanded" && <strong>{sourceId === "all" ? "All Sources" : sources.find((source) => source.id === sourceId)?.displayName ?? "Disconnected source"}</strong>}<small>{currentCount} photos · {visiblePhotos.filter((photo) => tableIds.has(photo.id)).length} on Table</small></div>{onOpenContactSheet && <button type="button" className="table-source-contact" onClick={() => sourceId === "all" ? setContactPickerOpen(true) : onOpenContactSheet(sourceId)}><span aria-hidden="true">▦</span><span className="table-source-contact-label">Contact Sheet</span></button>}</div>
    <div className="table-source-tabs" role="group" aria-label="Photo source filter">
      <button type="button" aria-pressed={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All</button>
      <button type="button" aria-pressed={filter === "not-on-table"} className={filter === "not-on-table" ? "is-active" : ""} onClick={() => setFilter("not-on-table")}>Not on Table</button>
      <button type="button" aria-pressed={filter === "on-table"} className={filter === "on-table" ? "is-active" : ""} onClick={() => setFilter("on-table")}>On Table</button>
    </div>
    {notice && <p className="table-source-notice" role="status">{notice}</p>}
    <SourcePhotoGrid
      photos={visiblePhotos}
      loading={loading || (filter === "all" && currentCount > 0 && visiblePhotos.length === 0)}
      selected={selected}
      tableIds={tableIds}
      photoSource={dependencies.photoSource}
      onToggle={toggle}
      onOpen={(photo) => tableIds.has(photo.id) ? onOpenPhoto(photo.id) : setPreviewPhoto(photo)}
      onPhotoError={onPhotoError}
      onDragStart={(event, photo) => event.dataTransfer.setData("application/x-photoflex-photo", selected.has(photo.id) ? eligibleSelected.map((item) => item.id).join(",") : photo.id)}
      resetKey={`${sourceId}:${filter}`}
      mode={mode}
    />
    </>}
    {view === "sources" && selected.size > 0 && <footer className="table-source-footer">
      <span>{selected.size ? `${eligibleSelected.length ? eligibleSelected.length : selected.size} selected${selected.size > selectedVisible.length ? ` · ${selected.size - selectedVisible.length} hidden` : ""}` : "Select photos to add to the table"}</span>
      {selected.size > 0 && <><button type="button" className="table-source-clear" onClick={() => setSelected(new Set())}>Clear</button><button type="button" className="button button-primary" disabled={!eligibleSelected.length} onClick={() => void placeSelected()}>Add {eligibleSelected.length} to Table</button></>}
    </footer>}
    </div>
    {previewPhoto && <SourcePreview photo={previewPhoto} photoSource={dependencies.photoSource} onClose={() => setPreviewPhoto(undefined)} onError={onPhotoError} />}
    {contactPickerOpen && <div className="source-contact-picker" role="dialog" aria-modal="true" aria-label="Choose Contact Sheet source"><strong>Choose a source</strong>{connectedSources.map((source) => <button key={source.id} type="button" onClick={() => { setContactPickerOpen(false); onOpenContactSheet?.(source.id); }}>{source.displayName}</button>)}<button type="button" onClick={() => setContactPickerOpen(false)}>Cancel</button></div>}
  </aside>;
}

function SourcePhotoGrid({ photos, loading, selected, tableIds, photoSource, onToggle, onOpen, onPhotoError, onDragStart, resetKey, mode }: {
  readonly photos: readonly PhotoRef[];
  readonly loading: boolean;
  readonly selected: ReadonlySet<PhotoId>;
  readonly tableIds: ReadonlySet<PhotoId>;
  readonly photoSource: AppDependencies["photoSource"];
  readonly onToggle: (photoId: PhotoId) => void;
  readonly onOpen: (photo: PhotoRef) => void;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
  readonly onDragStart: (event: React.DragEvent<HTMLElement>, photo: PhotoRef) => void;
  readonly resetKey: string;
  readonly mode: "compact" | "expanded";
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0, scrollTop: 0 });
  const [gridAttempt, setGridAttempt] = useState(0);
  const grid = useMemo(() => calculateContactSheetVirtualGrid({
    photoCount: photos.length,
    viewportWidth: Math.max(220, (layout.width || (mode === "expanded" ? 380 : 280)) - 28),
    viewportHeight: layout.height || 560,
    scrollTop: layout.scrollTop,
    targetTileWidth: 150,
    overscanRows: 2,
    columns: mode === "expanded" ? 3 : 2,
    gap: 8,
    rowGap: 8,
    photoAspectHeight: 1,
    metaAndGapHeight: 8,
  }), [layout, mode, photos.length]);
  const clickTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (clickTimerRef.current !== undefined) window.clearTimeout(clickTimerRef.current);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = 0;
    setLayout((current) => current.scrollTop === 0 ? current : { ...current, scrollTop: 0 });
  }, [resetKey]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      setLayout((current) => {
        const next = { width: viewport.clientWidth || rect.width, height: viewport.clientHeight || rect.height, scrollTop: viewport.scrollTop };
        return current.width === next.width && current.height === next.height && current.scrollTop === next.scrollTop ? current : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(viewport);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const visible = photos.slice(grid.startIndex, grid.endIndex);
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    setLayout((current) => current.scrollTop === scrollTop ? current : { ...current, scrollTop });
  };
  const onPhotoClick = (event: ReactMouseEvent<HTMLElement>, photoId: PhotoId) => {
    if (event.detail > 1) return;
    if (clickTimerRef.current !== undefined) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = undefined;
      onToggle(photoId);
    }, 180);
  };
  const onPhotoDoubleClick = (photo: PhotoRef) => {
    if (clickTimerRef.current !== undefined) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = undefined;
    onOpen(photo);
  };
  return <LocalGridErrorBoundary key={gridAttempt} onRetry={() => { setGridAttempt((value) => value + 1); viewportRef.current?.scrollTo({ top: 0 }); }}><div className="table-source-grid" aria-busy={loading} ref={viewportRef} onScroll={onScroll}>
    <div className="table-source-grid-inner" style={{ height: grid.totalHeight }}>
      {visible.map((photo, offset) => {
        const index = grid.startIndex + offset;
        const row = Math.floor(index / grid.columns);
        const column = index % grid.columns;
        const style: CSSProperties = { top: row * grid.rowHeight, left: column * (grid.tileWidth + grid.gap), width: grid.tileWidth, height: grid.rowHeight - grid.rowGap };
        return <button type="button" key={photo.id} className={`table-source-photo${selected.has(photo.id) ? " is-selected" : ""}`} style={style} onClick={(event) => onPhotoClick(event, photo.id)} onDoubleClick={() => onPhotoDoubleClick(photo)} aria-pressed={selected.has(photo.id)} title={`${photo.relativePath}${tableIds.has(photo.id) ? " · On Table" : " · Click to select · Double-click to preview"}`} draggable onDragStart={(event) => onDragStart(event, photo)} aria-label={`${photo.relativePath}${tableIds.has(photo.id) ? "，已在 Table" : ""}`}>
          <PhotoThumb photoSource={photoSource} photoId={photo.id} alt={photo.relativePath} onError={onPhotoError} />
          {tableIds.has(photo.id) && <span className="table-source-on-table" aria-hidden="true" title="On Table">✓</span>}
          {selected.has(photo.id) && <span className="table-source-check">✓</span>}
        </button>;
      })}
    </div>
    {loading && !photos.length && <div className="table-source-loading" role="status" aria-live="polite"><span className="table-source-loading-mark" aria-hidden="true" /><strong>Loading photos…</strong><span>This source is connected. Photos have not finished loading yet.</span></div>}
    {!loading && !photos.length && <p className="table-source-empty">No photos match this view.</p>}
  </div></LocalGridErrorBoundary>;
}

class LocalGridErrorBoundary extends Component<{ readonly children: ReactNode; readonly onRetry: () => void }, { readonly failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.failed) return <div className="table-source-grid-fallback" role="alert"><strong>Photo grid could not be rendered.</strong><button type="button" onClick={() => { this.setState({ failed: false }); this.props.onRetry(); }}>Retry grid</button></div>;
    return this.props.children;
  }
}

function SourcePreview({ photo, photoSource, onClose, onError }: { readonly photo: PhotoRef; readonly photoSource: AppDependencies["photoSource"]; readonly onClose: () => void; readonly onError: (photoId: PhotoId, error: SourceError) => void }) {
  const [url, setUrl] = useState<string>();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    let active = true;
    let lease: { readonly url: string; readonly release: () => void } | undefined;
    void photoSource.preview(photo.id).then((result) => {
      if (!result.ok) { if (active) onError(photo.id, result.error); return; }
      if (!active) { result.value.release(); return; }
      lease = result.value;
      setUrl(result.value.url);
    });
    return () => { active = false; lease?.release(); };
  }, [onError, photo.id, photoSource]);
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      event.preventDefault();
      closeButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") { event.preventDefault(); closeButtonRef.current?.focus(); }
  };
  return <div className="table-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${photo.relativePath}`} onPointerDown={onClose} onKeyDown={onDialogKeyDown}><section className="table-preview-dialog" onPointerDown={(event) => event.stopPropagation()}><header><span>{photo.relativePath}</span><button ref={closeButtonRef} onClick={onClose} aria-label="Close preview">×</button></header><div className="table-preview-image-wrap">{url ? <img src={url} alt={photo.relativePath} /> : <div className="preview-placeholder">Preview unavailable</div>}</div></section></div>;
}

function readPanelState(key: string, sources: readonly { readonly id: SourceId }[]): { mode: SourcePanelMode; lastOpenMode: "compact" | "expanded"; sourceId: SourceSelection; filter: SourceFilter } {
  const fallback = { mode: "compact" as const, lastOpenMode: "compact" as const, sourceId: sources[0]?.id ?? "all" as SourceSelection, filter: "all" as const };
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as { mode?: unknown; lastOpenMode?: unknown; sourceId?: unknown; filter?: unknown } | null;
    const sourceId: SourceSelection = value?.sourceId === "all" || (typeof value?.sourceId === "string" && sources.some((source) => source.id === value.sourceId))
      ? value.sourceId as SourceSelection
      : fallback.sourceId;
    return {
      mode: value?.mode === "compact" || value?.mode === "expanded" || value?.mode === "closed" ? value.mode : fallback.mode,
      lastOpenMode: value?.lastOpenMode === "expanded" ? "expanded" : fallback.lastOpenMode,
      sourceId,
      filter: value?.filter === "not-on-table" || value?.filter === "on-table" ? value.filter : fallback.filter,
    };
  } catch {
    return fallback;
  }
}
