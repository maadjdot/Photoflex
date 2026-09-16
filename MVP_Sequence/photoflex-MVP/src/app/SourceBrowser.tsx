import { TableHeaderControl } from "./TableHeaderControl";
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type MouseEvent as ReactMouseEvent, type ReactNode, type UIEvent } from "react";
import type { PhotoId, PhotoRef, ProjectId, ProjectWorkspace, SourceError, SourceId, SourceRuntimeState } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { mergeUniquePhotos, stateNeedsScan, useDialogKeyboard } from "./AppPrimitives";
import { useSourceMonitor } from "./ProjectSourceMonitor";
import { PhotoThumb } from "./PhotoThumb";
import { calculateContactSheetVirtualGrid } from "../modules/contactSheet/contactSheetVirtualizer";
import chevronIcon from "../assets/icons/table-chevron-down.svg";
import sourcesIcon from "../assets/icons/table-sources.svg";
import expandIcon from "../assets/icons/table-expand.svg";
import contactIcon from "../assets/icons/table-contact-sheet.svg";
import manageIcon from "../assets/icons/table-manage-sources.svg";
import plusIcon from "../assets/icons/table-plus.svg";
import { useLocale } from "./locale";
import { hasNativeDirectoryPicker } from "../platform/browser/webkitDirectoryPicker";

type SourceSelection = SourceId | "all";
type SourcePanelMode = "compact" | "expanded" | "closed";

export interface SourceBrowserProps {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly workspace: ProjectWorkspace;
  readonly onPlacePhotos: (photos: readonly PhotoRef[]) => Promise<boolean>;
  readonly onOpenPhoto: (photoId: PhotoId) => void;
  readonly onAddSource: () => void;
  readonly addingSource?: boolean;
  readonly onRemoveSource?: (sourceId: SourceId) => Promise<boolean>;
  readonly onOpenContactSheet?: (sourceId: SourceId) => void;
  readonly onReconnectSource?: (sourceId: SourceId) => void;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
  readonly onPanelModeChange?: (mode: SourcePanelMode) => void;
}

/** Photo Sources browser for Table. It owns only source browsing and pending selection. */
export function SourceBrowser({ dependencies, workspace, onPlacePhotos, onOpenPhoto, onAddSource, addingSource = false, onRemoveSource, onOpenContactSheet, onReconnectSource, onPhotoError, onPanelModeChange }: SourceBrowserProps) {
  const { locale, t } = useLocale();
  const sources = workspace.sources;
  const connectedSources = useMemo(() => sources.filter((source) => !source.removedAt), [sources]);
  const uiStorageKey = `photoflex:table-sources:${workspace.projectId}`;
  const storedState = useMemo(() => readPanelState(uiStorageKey, sources), [sources, uiStorageKey]);
  const [mode, setMode] = useState<SourcePanelMode>(storedState.mode);
  const [lastOpenMode, setLastOpenMode] = useState<"compact" | "expanded">(storedState.lastOpenMode);
  const [managing, setManaging] = useState(false);
  const [removing, setRemoving] = useState<SourceId>();
  const manageRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(manageRef, () => setManaging(false), managing);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [sourceId, setSourceId] = useState<SourceSelection>(storedState.sourceId);
  const [photos, setPhotos] = useState<readonly PhotoRef[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<PhotoId>>(new Set());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRef>();
  const generationRef = useRef(0);
  const contactDialogRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(contactDialogRef, () => setContactPickerOpen(false), contactPickerOpen);
  const { states, startScan } = useSourceMonitor(dependencies.photoSource, connectedSources);
  const sourceLoadSignal = connectedSources.map((source) => {
    const state = states[source.id];
    return `${source.id}:${state?.status ?? "unknown"}:${state?.indexedCount ?? 0}:${state?.scanRevision ?? 0}`;
  }).join("|");
  const tableIds = useMemo(
    () => new Set(workspace.worktableDraft.entryOrder.map((id) => workspace.worktableDraft.placements[id].photoId)),
    [workspace.worktableDraft.entryOrder, workspace.worktableDraft.placements],
  );

  useEffect(() => {
    try {
      window.sessionStorage.setItem(uiStorageKey, JSON.stringify({ mode, lastOpenMode, sourceId }));
    } catch {
      // UI context is disposable; storage availability must not affect the project session.
    }
  }, [lastOpenMode, mode, sourceId, uiStorageKey]);
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
            setNotice(t("source.indexReadFailed"));
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
  }, [connectedSources, dependencies.photoSource, sourceId, sourceLoadSignal, t]);

  const visiblePhotos = photos;
  const selectedVisible = useMemo(() => visiblePhotos.filter((photo) => selected.has(photo.id)), [selected, visiblePhotos]);
  const currentCount = sourceId === "all"
    ? connectedSources.reduce((total, source) => total + (states[source.id]?.indexedCount ?? 0), 0)
    : Math.max(states[sourceId]?.indexedCount ?? 0, photos.length);

  const displayedSources = connectedSources.filter((source) => sourceId === "all" || source.id === sourceId);
  const scanning = displayedSources.some((source) => stateNeedsScan(states[source.id]));
  const sourceBusy = addingSource || loading || scanning;
  const problemSources = displayedSources.filter((source) => ["error", "offline", "permission-lost"].includes(states[source.id]?.status ?? ""));

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

  const sourceToggle = <TableHeaderControl><button type="button" aria-label={mode === "closed" ? t("source.open") : t("source.hide")} aria-pressed={mode !== "closed"} className="table-source-toggle" onClick={() => setMode(mode === "closed" ? lastOpenMode : "closed")}><img src={sourcesIcon} alt="" /><span>{t("table.photoSources")}</span></button></TableHeaderControl>;
  if (mode === "closed") return sourceToggle;

  return <>{sourceToggle}<aside className={`table-source-browser is-${mode}`} aria-label={t("table.photoSources")}>
    <header className="table-source-browser-header">
      <strong>{t("table.photoSources")}</strong>
      <div className="table-source-header-actions">{onRemoveSource && <button type="button" className="table-source-header-icon" aria-label={t("source.manage")} title={t("source.manage")} onClick={() => setManaging(true)}><img src={manageIcon} alt="" /></button>}<button type="button" className="table-source-header-icon" aria-label={t("project.addSource")} title={t("project.addSource")} disabled={addingSource} onClick={onAddSource}><img src={plusIcon} alt="" /></button><button type="button" title={mode === "compact" ? t("source.expand") : t("source.compact")} aria-label={mode === "compact" ? t("source.expand") : t("source.compact")} className="table-source-header-icon" onClick={() => setMode(mode === "compact" ? "expanded" : "compact")}><img src={expandIcon} alt="" /></button><button type="button" className="table-source-header-icon table-source-collapse" aria-label={t("source.collapse")} title={t("source.collapse")} onClick={() => setMode("closed")}><img src={chevronIcon} alt="" /></button></div>
    </header>
    {mode === "expanded" && <nav className="table-source-directory" aria-label={t("source.directory")}><button type="button" className={sourceId === "all" ? "is-active" : ""} onClick={() => setSourceId("all")}><span>▣ {t("source.all")}</span><small>{connectedSources.reduce((total, source) => total + (states[source.id]?.indexedCount ?? 0), 0)}</small></button>{sources.map((source) => <button key={source.id} type="button" className={`${sourceId === source.id ? "is-active " : ""}${source.removedAt ? "is-disconnected" : ""}`} onClick={() => source.removedAt ? onReconnectSource?.(source.id) : setSourceId(source.id)}><span>▣ {source.displayName}</span><small>{source.removedAt ? t("source.reconnect") : states[source.id]?.indexedCount ?? 0}</small></button>)}</nav>}
    <div className="table-source-browser-content">
    <div className="table-source-selector-row">
      <label><select aria-label={t("source.select")} value={sourceId} onChange={(event) => setSourceId(event.target.value as SourceSelection)}>
          <option value="all">{t("source.all")}</option>
          {sources.map((source) => <option key={source.id} value={source.id} disabled={Boolean(source.removedAt)}>{source.displayName}{source.removedAt ? " (Disconnected)" : ""}</option>)}
        </select></label>
    {onOpenContactSheet && <><button type="button" className="table-source-contact" onClick={() => sourceId === "all" ? setContactPickerOpen(true) : onOpenContactSheet(sourceId)}><img src={contactIcon} alt="" /><span className="table-source-contact-label">{t("source.contactSheet")}</span></button></>}
    </div>
    {sourceBusy && <div className="source-loading-status" role="status" aria-live="polite"><span className="loading-mark" aria-hidden="true" /><span>{addingSource ? t("project.connecting") : locale === "zh-CN" ? `正在加载照片… 已找到 ${currentCount} 张` : `Loading photos… ${currentCount} found`}</span></div>}
    {problemSources.map((source) => <p className="table-source-notice" role="alert" key={source.id}>{source.displayName}: {states[source.id]?.errorMessage ?? "Source unavailable."} <button type="button" onClick={() => states[source.id]?.status === "error" ? startScan(source.id) : onReconnectSource?.(source.id)}>{states[source.id]?.status === "error" ? "Retry" : "Reconnect"}</button></p>)}
    {!hasNativeDirectoryPicker() && <p className="table-source-notice">{t("source.temporaryFolderAccess")}</p>}
    {notice && <p className="table-source-notice" role="status">{notice}</p>}
    <SourcePhotoGrid
      photos={visiblePhotos}
      loading={sourceBusy}
      selected={selected}
      tableIds={tableIds}
      photoSource={dependencies.photoSource}
      sourceStates={states}
      onToggle={toggle}
      onOpen={(photo) => tableIds.has(photo.id) ? onOpenPhoto(photo.id) : setPreviewPhoto(photo)}
      onPhotoError={onPhotoError}
      onDragStart={(event, photo) => event.dataTransfer.setData("application/x-photoflex-photo", selected.has(photo.id) ? eligibleSelected.map((item) => item.id).join(",") : photo.id)}
      resetKey={sourceId}
      mode={mode}
    />
    {selected.size > 0 && <footer className="table-source-footer">
      <span>{t("common.selectedPhotos", { count: eligibleSelected.length || selected.size })}</span>
      {selected.size > 0 && <><button type="button" className="table-source-clear" onClick={() => setSelected(new Set())}>{t("source.clear")}</button><button type="button" className="button button-primary" disabled={!eligibleSelected.length} onClick={() => void placeSelected()}>{t("source.addToTable")}</button></>}
    </footer>}
    </div>
    {managing && <div className="source-manager-backdrop"><div ref={manageRef} className="source-manager" role="dialog" aria-modal="true" aria-label={t("source.manage")}><header><strong>{t("table.photoSources")}</strong><button type="button" aria-label={t("table.closeSourceManager")} onClick={() => setManaging(false)}>×</button></header><p>{t("source.removeHelp")}</p>{sources.map((source) => <div className="source-manager-row" key={source.id}><span>{source.displayName}</span>{source.removedAt ? <button type="button" onClick={() => onReconnectSource?.(source.id)}>{t("source.reconnect")}</button> : <button type="button" disabled={Boolean(removing)} onClick={async () => { setRemoving(source.id); try { await onRemoveSource?.(source.id); } finally { setRemoving(undefined); } }}>{removing === source.id ? t("source.removing") : t("source.remove")}</button>}</div>)}</div></div>}
    {previewPhoto && <SourcePreview photo={previewPhoto} photoSource={dependencies.photoSource} onClose={() => setPreviewPhoto(undefined)} onError={onPhotoError} />}
    {contactPickerOpen && <div ref={contactDialogRef} className="source-contact-picker" role="dialog" aria-modal="true" aria-label={t("source.choose")}><strong>{t("source.choose")}</strong>{connectedSources.map((source) => <button key={source.id} type="button" onClick={() => { setContactPickerOpen(false); onOpenContactSheet?.(source.id); }}>{source.displayName}</button>)}<button type="button" onClick={() => setContactPickerOpen(false)}>{t("common.cancel")}</button></div>}
  </aside></>;
}

function SourcePhotoGrid({ photos, loading, selected, tableIds, photoSource, sourceStates, onToggle, onOpen, onPhotoError, onDragStart, resetKey, mode }: {
  readonly photos: readonly PhotoRef[];
  readonly loading: boolean;
  readonly selected: ReadonlySet<PhotoId>;
  readonly tableIds: ReadonlySet<PhotoId>;
  readonly photoSource: AppDependencies["photoSource"];
  readonly sourceStates: Readonly<Record<string, SourceRuntimeState>>;
  readonly onToggle: (photoId: PhotoId) => void;
  readonly onOpen: (photo: PhotoRef) => void;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
  readonly onDragStart: (event: React.DragEvent<HTMLElement>, photo: PhotoRef) => void;
  readonly resetKey: string;
  readonly mode: "compact" | "expanded";
}) {
  const { t } = useLocale();
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
        return <button type="button" key={photo.id} className={`table-source-photo${selected.has(photo.id) ? " is-selected" : ""}`} style={style} onClick={(event) => onPhotoClick(event, photo.id)} onDoubleClick={() => onPhotoDoubleClick(photo)} aria-pressed={selected.has(photo.id)} title={`${photo.relativePath}${tableIds.has(photo.id) ? ` · ${t("source.onTable")}` : ""}`} draggable onDragStart={(event) => onDragStart(event, photo)} aria-label={`${photo.relativePath}${tableIds.has(photo.id) ? ` · ${t("source.onTable")}` : ""}`}>
          <PhotoThumb photoSource={photoSource} photoId={photo.id} alt={photo.relativePath} sourceRevision={sourceStates[photo.sourceId]?.scanRevision} onError={onPhotoError} />
          {tableIds.has(photo.id) && <span className="table-source-on-table" aria-hidden="true" title={t("source.onTable")}>✓</span>}
          {selected.has(photo.id) && <span className="table-source-check">✓</span>}
        </button>;
      })}
    </div>

    {!loading && !photos.length && <p className="table-source-empty">{t("source.noMatch")}</p>}
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
  const { t } = useLocale();
  const [url, setUrl] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogKeyboard(dialogRef, onClose);
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
  }, []);
  return <div ref={dialogRef} className="table-preview-backdrop" role="dialog" aria-modal="true" aria-label={`${t("table.preview")} ${photo.relativePath}`} onPointerDown={onClose}><section className="table-preview-dialog" onPointerDown={(event) => event.stopPropagation()}><header><span>{photo.relativePath}</span><button ref={closeButtonRef} onClick={onClose} aria-label={t("table.closePreview")}>×</button></header><div className="table-preview-image-wrap">{url ? <img src={url} alt={photo.relativePath} /> : <div className="preview-placeholder">{t("table.previewUnavailable")}</div>}</div></section></div>;
}

function readPanelState(key: string, sources: readonly { readonly id: SourceId }[]): { mode: SourcePanelMode; lastOpenMode: "compact" | "expanded"; sourceId: SourceSelection } {
  const fallback = { mode: "compact" as const, lastOpenMode: "compact" as const, sourceId: sources[0]?.id ?? "all" as SourceSelection };
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as { mode?: unknown; lastOpenMode?: unknown; sourceId?: unknown } | null;
    const sourceId: SourceSelection = value?.sourceId === "all" || (typeof value?.sourceId === "string" && sources.some((source) => source.id === value.sourceId))
      ? value.sourceId as SourceSelection
      : fallback.sourceId;
    return {
      mode: value?.mode === "compact" || value?.mode === "expanded" || value?.mode === "closed" ? value.mode : fallback.mode,
      lastOpenMode: value?.lastOpenMode === "expanded" ? "expanded" : fallback.lastOpenMode,
      sourceId,
    };
  } catch {
    return fallback;
  }
}
