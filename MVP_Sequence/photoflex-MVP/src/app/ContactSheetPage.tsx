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
  const reconciledScanRef = useRef(-1);
  const initialPageLoadRef = useRef(0);
  const handlePhotoSourceError = useCallback((photoId: PhotoId, photoError: SourceError) => {
    if (photoError.kind === "photo-not-found") {
      setMissingPhotoIds((current) => current.has(photoId) ? current : new Set([...current, photoId]));
      return;
    }
    if (photoError.kind === "permission-lost") {
      setNotice("文件夹授权已失效，请重新连接。");
      return;
    }
    if (photoError.kind === "preview-unavailable") setNotice("照片预览生成失败。");
  }, []);

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
    reconciledScanRef.current = -1;
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
      else setNotice("照片索引暂时无法读取，请重试。");
    })().finally(() => {
      if (initialPageLoadRef.current === requestId) initialPageLoadRef.current = 0;
    });
    return () => { active = false; };
  }, [dependencies.photoSource, sourceId]);

  const loadMore = async () => {
    if (!cursor || loadingPage || initialPageLoadRef.current !== 0) return;
    setLoadingPage(true);
    const page = await dependencies.photoSource.listPhotos(sourceId, cursor, 100);
    if (page.ok) {
      setPhotos((current) => mergeUniquePhotos(current, page.value.items));
      setMissingPhotoIds((current) => new Set([...current, ...page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)]));
      setCursor(page.value.nextCursor);
    }
    setLoadingPage(false);
  };

  const indexedCount = states[sourceId]?.indexedCount ?? 0;
  const sourceState = states[sourceId];
  useEffect(() => {
    if (!sourceState || !["ready", "partial", "empty"].includes(sourceState.status)) return;
    if (reconciledScanRef.current === sourceState.indexedCount) return;
    reconciledScanRef.current = sourceState.indexedCount;
    let active = true;
    void dependencies.photoSource.listPhotos(sourceId, "0", 100).then((page) => {
      if (!active || !page.ok) return;
      setPhotos(mergeUniquePhotos([], page.value.items));
      setMissingPhotoIds(new Set(page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)));
      setCursor(page.value.nextCursor);
    });
    return () => { active = false; };
  }, [dependencies.photoSource, sourceId, sourceState?.indexedCount, sourceState?.status]);
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
        setNotice("照片索引暂时无法读取，请重试。");
      }
      setLoadingPage(false);
    });
  }, [cursor, dependencies.photoSource, indexedCount, loadingPage, photos.length, sourceId]);

  useEffect(() => {
    if (!anchorPhotoId) return;
    const timer = window.setTimeout(() => {
      void updateResumeContext((current) => ({ page: "contact-sheet" as const, sourceId, filter: "all" as const, anchorPhotoId, sequenceId: current?.sequenceId }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [anchorPhotoId, sourceId, updateResumeContext]);

  if (loading) return <LoadingPage />;
  if (!workspace || !source) return <ErrorPage message={error ?? "Source 无法读取。"} />;

  const visiblePhotos = filter === "selected" ? photos.filter((photo) => selected.has(photo.id)) : photos;
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
      setNotice(`${added} photos placed on Table${requested.length - added ? ` · ${requested.length - added} already there` : ""}`);
      return true;
    }
    setNotice("Photos could not be placed on Table.");
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
        <button className="rail-collapse" onClick={() => setSourceCollapsed((value) => !value)} aria-label={sourceCollapsed ? "展开 Source 栏" : "收起 Source 栏"}>{sourceCollapsed ? "›" : "‹"}</button>
        {!sourceCollapsed && <>
          <label className="source-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search sources</span>
            <input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search Project" />
          </label>
          <div className="source-nav-list">{visibleSources.map((item) => <button className={`source-nav-item${item.id === sourceId ? " is-active" : ""}`} key={item.id} onClick={() => navigate({ name: "contact-sheet", projectId, sourceId: item.id })}><strong>{item.displayName.toUpperCase()}</strong><span>{item.id === sourceId ? Math.max(states[item.id]?.indexedCount ?? 0, photos.length) : (states[item.id]?.indexedCount ?? 0)} photos</span></button>)}</div>
          <div className="rail-updated"><span>UPDATED</span><time>{formatUpdated(workspace.updatedAt)}</time></div>
        </>}
      </aside>
      <section className="workspace-main contact-main">
        <div className="workspace-heading contact-heading">
          <h1>{source.displayName}</h1>
          <div className="sheet-zoom" aria-label="Photos 缩放">
            <button onClick={() => setGridZoom((value) => Math.max(50, value - 25))} disabled={gridZoom === 50} aria-label="缩小照片">−</button>
            <span>{gridZoom}%</span>
            <button onClick={() => setGridZoom((value) => Math.min(125, value + 25))} disabled={gridZoom === 125} aria-label="放大照片">＋</button>
          </div>
        </div>
        <div className="sheet-toolbar"><div className="filter-tabs"><button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All {Math.max(states[sourceId]?.indexedCount ?? 0, photos.length)}</button><button className={filter === "selected" ? "is-active" : ""} onClick={() => setFilter("selected")}>Selected {selected.size}</button></div><div className="toolbar-actions"><button className="button button-secondary" onClick={() => setSelected(new Set(visiblePhotos.map((photo) => photo.id)))}>Select all</button><button className="button button-secondary" onClick={() => setSelected((current) => new Set(visiblePhotos.filter((photo) => !current.has(photo.id)).map((photo) => photo.id)))}>Invert</button><button className="button button-primary" disabled={!selected.size} onClick={() => void placeOnTable([...selected])}>Place on Table</button></div></div>
        {notice && <InlineNotice message={notice} />}
        {visiblePhotos.length ? <VirtualPhotoGrid photos={visiblePhotos} selected={selected} tableIds={tableDraft.entryOrder} missingIds={missingPhotoIds} zoom={gridZoom} initialAnchorPhotoId={workspace.resumeContext?.sourceId === sourceId ? workspace.resumeContext.anchorPhotoId : undefined} onAnchorChange={setAnchorPhotoId} onToggle={toggleSelection} onOpen={(index) => setPreviewIndex(index)} onNearEnd={() => void loadMore()} onPhotoSourceError={handlePhotoSourceError} photoSource={dependencies.photoSource} /> : <EmptyPanel title={filter === "selected" ? "No selected photos" : "No supported JPEG files"} detail={filter === "selected" ? "Select photos in All to continue." : "This folder has no readable .jpg or .jpeg files."} />}
        {loadingPage && <p className="loading-line">Loading more photos…</p>}
      </section>
      <TablePreviewPanel
        draft={tableDraft}
        photoSource={dependencies.photoSource}
        onOpen={setTablePreviewPhotoId}
        onOpenTable={() => navigate({ name: "table", projectId })}
        onPhotoSourceError={handlePhotoSourceError}
      />
      {previewIndex !== undefined && <PreviewOverlay photoIds={visiblePhotos.map((photo) => photo.id)} index={previewIndex} workspace={workspace} photoSource={dependencies.photoSource} onClose={() => setPreviewIndex(undefined)} onMove={setPreviewIndex} onToggleTable={toggleTable} onPhotoSourceError={handlePhotoSourceError} />}
      {tablePreviewPhotoId && <PreviewOverlay
        photoIds={tableDraft.entryOrder}
        index={Math.max(0, tableDraft.entryOrder.indexOf(tablePreviewPhotoId))}
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
