import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { PhotoId, PhotoRef, ProjectId, ProjectWorkspace, SourceError, SourceId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { InlineNotice, EmptyPanel, ErrorPage, LoadingPage, mergeUniquePhotos, now, shortId, sourceErrorMessage, stateNeedsScan, worktableDisplaySize, formatUpdated } from "./AppPrimitives";
import { useProjectWorkspaceSession, workspaceSaveErrorMessage } from "./useProjectWorkspace";
import { useTableSession } from "./tableSession";
import { useSourceMonitor } from "./ProjectSourceMonitor";
import { TablePreviewPanel } from "./TablePreviewPanel";
import { VirtualPhotoGrid } from "./VirtualPhotoGrid";
import { PreviewOverlay } from "./PreviewOverlay";
import { useLocale } from "./locale";

export function ContactSheetPage({
  dependencies,
  projectId,
  sourceId,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly sourceId: SourceId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { locale, t } = useLocale();
  const { workspace, save, updateResumeContext, saveWorktable, loading, error } = useProjectWorkspaceSession(dependencies, projectId);
  const tableSession = useTableSession(projectId, async ({ draft }) => {
    const result = await saveWorktable(draft);
    if (!result.ok) setNotice(workspaceSaveErrorMessage(result.error));
  });
  const tableDraft = tableSession.draft;
  const initializedTableRef = useRef<ProjectId | undefined>(undefined);
  const source = workspace?.sources.find((item) => item.id === sourceId && !item.removedAt);
  const { states, startScan } = useSourceMonitor(
    dependencies.photoSource,
    workspace?.sources.filter((item) => !item.removedAt) ?? [],
  );
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [cursor, setCursor] = useState<string | null>("0");
  const [loadingPage, setLoadingPage] = useState(false);
  const [selected, setSelected] = useState<Set<PhotoId>>(new Set());
  const [missingPhotoIds, setMissingPhotoIds] = useState<Set<PhotoId>>(new Set());
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [previewIndex, setPreviewIndex] = useState<number>();
  const [tablePreviewPhotoId, setTablePreviewPhotoId] = useState<PhotoId>();
  const [notice, setNotice] = useState<string>();
  const [anchorPhotoId, setAnchorPhotoId] = useState<PhotoId>();
  const [sourceCollapsed, setSourceCollapsed] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [gridZoom, setGridZoom] = useState(75);
  const lastSelectedIndexRef = useRef<number | undefined>(undefined);
  const resumeSavedKeyRef = useRef<string | undefined>(undefined);
  const exhaustedAtIndexedCountRef = useRef(-1);
  const reconciledScanRef = useRef<string | undefined>(undefined);
  const initialPageLoadRef = useRef(0);
  const handlePhotoSourceError = useCallback((photoId: PhotoId, photoError: SourceError) => {
    if (photoError.kind === "photo-not-found") {
      setMissingPhotoIds((current) => current.has(photoId) ? current : new Set([...current, photoId]));
      return;
    }
    if (photoError.kind === "permission-lost") {
      setNotice(sourceErrorMessage(photoError.kind, locale));
      return;
    }
    if (photoError.kind === "preview-unavailable") setNotice(t("source.previewFailed"));
  }, [locale, t]);

  useEffect(() => {
    if (!workspace || initializedTableRef.current === workspace.projectId) return;
    initializedTableRef.current = workspace.projectId;
    tableSession.resetCommittedDraft(workspace.worktableDraft);
  }, [tableSession.resetCommittedDraft, workspace]);

  useEffect(() => {
    const resumeKey = `${projectId}/${sourceId}`;
    if (!workspace || !source || resumeSavedKeyRef.current === resumeKey) return;
    resumeSavedKeyRef.current = resumeKey;
    void updateResumeContext((current) => ({ page: "contact-sheet" as const, sourceId, filter: "all" as const, sequenceId: current?.sequenceId }), true);
  }, [projectId, sourceId, updateResumeContext, workspace?.projectId, source?.id]);

  useEffect(() => {
    if (source && stateNeedsScan(states[source.id])) startScan(source.id);
  }, [source?.id]);

  useEffect(() => {
    let active = true;
    const requestId = initialPageLoadRef.current + 1;
    initialPageLoadRef.current = requestId;
    exhaustedAtIndexedCountRef.current = -1;
    reconciledScanRef.current = undefined;
    setPhotos([]); setCursor("0"); setSelected(new Set()); setMissingPhotoIds(new Set()); setFilter("all");
    void (async () => {
      const page = await dependencies.photoSource.listPhotos(sourceId, "0", 100);
      if (!active) return;
      if (page.ok) {
        setPhotos(mergeUniquePhotos([], page.value.items));
        const firstPhoto = page.value.items[0];
        if (firstPhoto) {
          void save((current) => current.coverPhotoId ? current : { ...current, coverPhotoId: firstPhoto.id }).then((result) => {
            if (!result.ok) setNotice(workspaceSaveErrorMessage(result.error));
          });
        }
        setMissingPhotoIds(new Set(page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)));
        setCursor(page.value.nextCursor);
      }
      else setNotice(t("source.indexReadFailed"));
    })().finally(() => {
      if (initialPageLoadRef.current === requestId) initialPageLoadRef.current = 0;
    });
    return () => { active = false; };
  }, [dependencies.photoSource, save, sourceId, t]);

  const loadMore = async () => {
    if (!cursor || loadingPage || initialPageLoadRef.current !== 0) return;
    setLoadingPage(true);
    const page = await dependencies.photoSource.listPhotos(sourceId, cursor, 100);
    if (page.ok) {
      setPhotos((current) => mergeUniquePhotos(current, page.value.items));
      setMissingPhotoIds((current) => new Set([...current, ...page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)]));
      setCursor(page.value.nextCursor);
    } else setNotice(t("source.indexReadFailed"));
    setLoadingPage(false);
  };

  const indexedCount = states[sourceId]?.indexedCount ?? 0;
  const sourceState = states[sourceId];
  const sourceRevision = sourceState?.scanRevision ?? 0;
  useEffect(() => {
    if (!sourceState || !["ready", "partial", "empty"].includes(sourceState.status)) return;
    const scanKey = `${sourceRevision}:${sourceState.indexedCount}`;
    if (reconciledScanRef.current === scanKey) return;
    reconciledScanRef.current = scanKey;
    let active = true;
    void dependencies.photoSource.listPhotos(sourceId, "0", 100).then((page) => {
      if (!active || !page.ok) return;
      setPhotos(mergeUniquePhotos([], page.value.items));
      setMissingPhotoIds(new Set(page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)));
      setCursor(page.value.nextCursor);
    });
    return () => { active = false; };
  }, [dependencies.photoSource, sourceId, sourceRevision, sourceState?.indexedCount, sourceState?.status]);
  useEffect(() => {
    if (indexedCount <= photos.length || loadingPage || initialPageLoadRef.current !== 0 || exhaustedAtIndexedCountRef.current === indexedCount) return;
    // A null cursor means the previous read reached the then-current tail. If a
    // running scan adds rows, continue once after the last stable path key.
    const nextCursor = cursor ?? photos.at(-1)?.relativePath ?? "0";
    setLoadingPage(true);
    void dependencies.photoSource.listPhotos(sourceId, nextCursor, 100).then((page) => {
      if (page.ok) {
        if (!page.value.items.length && page.value.nextCursor === null) {
          exhaustedAtIndexedCountRef.current = indexedCount;
        }
        setPhotos((current) => mergeUniquePhotos(current, page.value.items));
        setMissingPhotoIds((current) => new Set([...current, ...page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)]));
        setCursor(page.value.nextCursor);
      } else {
        exhaustedAtIndexedCountRef.current = indexedCount;
        setNotice(t("source.indexReadFailed"));
      }
      setLoadingPage(false);
    });
  }, [cursor, dependencies.photoSource, indexedCount, loadingPage, photos.length, sourceId, t]);

  useEffect(() => {
    if (!anchorPhotoId) return;
    const timer = window.setTimeout(() => {
      void updateResumeContext((current) => ({ page: "contact-sheet" as const, sourceId, filter: "all" as const, anchorPhotoId, sequenceId: current?.sequenceId }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [anchorPhotoId, sourceId, updateResumeContext]);

  if (loading) return <LoadingPage />;
  if (!workspace || !source) return <ErrorPage message={error ?? t("source.loadFailed")} />;

  const visiblePhotos = filter === "selected" ? photos.filter((photo) => selected.has(photo.id)) : photos;
  const tablePreviewIndex = tablePreviewPhotoId === undefined
    ? -1
    : tableDraft.entryOrder.indexOf(tablePreviewPhotoId);
  const visibleSources = workspace.sources.filter((item) => {
    if (item.removedAt) return false;
    return item.displayName.toLowerCase().includes(sourceSearch.trim().toLowerCase());
  });
  const toggleSelection = (photoId: PhotoId, index: number, event?: ReactMouseEvent<HTMLElement>) => {
    setSelected((current) => {
      const next = new Set(current);
      if (event?.shiftKey && lastSelectedIndexRef.current !== undefined) {
        const [start, end] = [lastSelectedIndexRef.current, index].sort((left, right) => left - right);
        visiblePhotos.slice(start, end + 1).forEach((photo) => next.add(photo.id));
      } else if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      lastSelectedIndexRef.current = index;
      return next;
    });
  };
  const placeOnTable = async (ids: readonly PhotoId[]) => {
    const requested = ids.map((photoId) => photos.find((photo) => photo.id === photoId)).filter((photo): photo is PhotoRef => Boolean(photo));
    const before = tableSession.draft.entryOrder.length;
    const result = tableSession.placePhotos(requested.map((photo) => ({ photoId: photo.id, ...worktableDisplaySize(photo.width, photo.height), filename: photo.relativePath.split(/[\\/]/).at(-1) ?? shortId(photo.id) })));
    if (result.ok) {
      const added = result.value.draft.entryOrder.length - before;
      setSelected(new Set());
      setNotice(locale === "zh-CN" ? `已将 ${added} 张照片放上桌面${requested.length - added ? ` · ${requested.length - added} 张已在桌面` : ""}` : `${added} photos placed on Table${requested.length - added ? ` · ${requested.length - added} already there` : ""}`);
      return true;
    }
    setNotice(t("table.photosPlaceFailed"));
    return false;
  };
  const toggleTable = async (photoId: PhotoId) => {
    const photo = photos.find((item) => item.id === photoId);
    const inTable = tableSession.draft.placements[photoId];
    const result = inTable
      ? tableSession.execute({ type: "remove", photoIds: [photoId] })
      : photo
        ? tableSession.placePhotos([{ photoId, ...worktableDisplaySize(photo.width, photo.height), filename: photo.relativePath.split(/[\\/]/).at(-1) ?? shortId(photoId) }])
        : undefined;
    if (result && !result.ok) setNotice("Table update could not be completed.");
  };

  return (
    <main className={`workspace-layout contact-layout has-table-preview page${sourceCollapsed ? " is-source-collapsed" : ""}`}>
      <aside className="context-rail source-rail">
        <button className="rail-collapse" onClick={() => setSourceCollapsed((value) => !value)} aria-label={sourceCollapsed ? t("source.expand") : t("source.collapse")}>{sourceCollapsed ? "›" : "‹"}</button>
        {!sourceCollapsed && <>
          <label className="source-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">{t("source.search")}</span>
            <input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder={t("source.searchProject")} />
          </label>
          <div className="source-nav-list">{visibleSources.map((item) => <button className={`source-nav-item${item.id === sourceId ? " is-active" : ""}`} key={item.id} onClick={() => navigate({ name: "contact-sheet", projectId, sourceId: item.id })}><strong>{item.displayName.toUpperCase()}</strong><span>{t("common.photoCount", { count: item.id === sourceId ? Math.max(states[item.id]?.indexedCount ?? 0, photos.length) : (states[item.id]?.indexedCount ?? 0) })}</span></button>)}</div>
          <div className="rail-updated"><span>{t("status.updated")}</span><time>{formatUpdated(workspace.updatedAt, locale)}</time></div>
        </>}
      </aside>
      <section className="workspace-main contact-main">
        <div className="workspace-heading contact-heading">
          <h1>{source.displayName}</h1>
          <div className="sheet-zoom" aria-label={t("table.controls")}>
            <button onClick={() => setGridZoom((value) => Math.max(50, value - 25))} disabled={gridZoom === 50} aria-label={t("table.zoomOut")}>−</button>
            <span>{gridZoom}%</span>
            <button onClick={() => setGridZoom((value) => Math.min(125, value + 25))} disabled={gridZoom === 125} aria-label={t("table.zoomIn")}>＋</button>
          </div>
        </div>
        <div className="sheet-toolbar"><div className="filter-tabs"><button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>{t("source.all")} {Math.max(states[sourceId]?.indexedCount ?? 0, photos.length)}</button><button className={filter === "selected" ? "is-active" : ""} onClick={() => setFilter("selected")}>{t("common.selectedPhotos", { count: selected.size })}</button></div><div className="toolbar-actions"><button className="button button-secondary" onClick={() => setSelected(new Set(visiblePhotos.map((photo) => photo.id)))}>{t("source.selectAll")}</button><button className="button button-secondary" onClick={() => setSelected((current) => new Set(visiblePhotos.filter((photo) => !current.has(photo.id)).map((photo) => photo.id)))}>{t("source.invert")}</button><button className="button button-primary" disabled={!selected.size} onClick={() => void placeOnTable([...selected])}>{t("table.placeOnTable")}</button></div></div>
        {notice && <InlineNotice message={notice} />}
        {visiblePhotos.length ? <VirtualPhotoGrid photos={visiblePhotos} selected={selected} tableIds={tableDraft.entryOrder} missingIds={missingPhotoIds} zoom={gridZoom} sourceRevision={sourceRevision} initialAnchorPhotoId={workspace.resumeContext?.sourceId === sourceId ? workspace.resumeContext.anchorPhotoId : undefined} onAnchorChange={setAnchorPhotoId} onToggle={toggleSelection} onOpen={(index) => setPreviewIndex(index)} onNearEnd={() => void loadMore()} onPhotoSourceError={handlePhotoSourceError} photoSource={dependencies.photoSource} /> : <EmptyPanel title={filter === "selected" ? t("source.noSelected") : t("source.noSupportedJpeg")} detail={filter === "selected" ? t("source.selectInAll") : t("source.noReadableJpeg")} />}
        {loadingPage && <p className="loading-line">{t("source.loadingMore")}</p>}
      </section>
      <TablePreviewPanel
        draft={tableDraft}
        photoSource={dependencies.photoSource}
        onOpen={setTablePreviewPhotoId}
        onOpenTable={() => navigate({ name: "table", projectId })}
        onPhotoSourceError={handlePhotoSourceError}
      />
      {previewIndex !== undefined && <PreviewOverlay photoIds={visiblePhotos.map((photo) => photo.id)} index={previewIndex} workspace={workspace} photoSource={dependencies.photoSource} onClose={() => setPreviewIndex(undefined)} onMove={setPreviewIndex} onToggleTable={toggleTable} onPhotoSourceError={handlePhotoSourceError} />}
      {tablePreviewIndex >= 0 && <PreviewOverlay
        photoIds={tableDraft.entryOrder}
        index={tablePreviewIndex}
        workspace={workspace}
        photoSource={dependencies.photoSource}
        onClose={() => setTablePreviewPhotoId(undefined)}
        onMove={(index) => setTablePreviewPhotoId(tableDraft.entryOrder[index])}
        onToggleTable={toggleTable}
        onPhotoSourceError={handlePhotoSourceError}
      />}
    </main>
  );
}
