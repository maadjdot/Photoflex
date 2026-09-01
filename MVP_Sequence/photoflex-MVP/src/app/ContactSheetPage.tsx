import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { PhotoId, PhotoRef, ProjectId, ProjectWorkspace, SourceError, SourceId } from "../contracts";
import { createWorktableEditor } from "../modules/worktable";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { InlineNotice, EmptyPanel, ErrorPage, LoadingPage, mergeUniquePhotos, now, shortId, sourceErrorMessage, stateNeedsScan, worktableDisplaySize, formatUpdated } from "./AppPrimitives";
import { useProjectWorkspace, workspaceSaveErrorMessage } from "./useProjectWorkspace";
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
  const { workspace, workspaceRef, save, loading, error } = useProjectWorkspace(dependencies, projectId);
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
    const resumeKey = `${projectId}/${sourceId}`;
    if (!workspace || !source || resumeSavedKeyRef.current === resumeKey) return;
    resumeSavedKeyRef.current = resumeKey;
    void save((current) => ({
      ...current,
      lastOpenedAt: now(),
      resumeContext: { page: "contact-sheet" as const, sourceId, filter: "all" as const, sequenceId: current.resumeContext?.sequenceId },
    }));
  }, [projectId, sourceId, workspace?.projectId, source?.id]);

  useEffect(() => {
    if (source && stateNeedsScan(states[source.id])) startScan(source.id);
  }, [source?.id]);

  useEffect(() => {
    let active = true;
    const requestId = initialPageLoadRef.current + 1;
    initialPageLoadRef.current = requestId;
    exhaustedAtIndexedCountRef.current = -1;
    setPhotos([]); setCursor("0"); setSelected(new Set()); setMissingPhotoIds(new Set()); setFilter("all");
    void (async () => {
      const page = await dependencies.photoSource.listPhotos(sourceId, "0", 100);
      if (!active) return;
      if (page.ok) {
        setPhotos(mergeUniquePhotos([], page.value.items));
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
      void save((latest) => ({
        ...latest,
        resumeContext: { page: "contact-sheet" as const, sourceId, filter: "all" as const, anchorPhotoId, sequenceId: latest.resumeContext?.sequenceId },
      }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [anchorPhotoId, save, sourceId]);

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
    const current = workspaceRef.current;
    if (!current) return false;
    const editor = createWorktableEditor(current.worktableDraft);
    const requested = ids.map((photoId) => photos.find((photo) => photo.id === photoId)).filter((photo): photo is PhotoRef => Boolean(photo));
    const beforeCount = current.worktableDraft.entryOrder.length;
    const placed = editor.execute({
      type: "place",
      items: requested.map((photo) => ({
        photoId: photo.id,
        ...worktableDisplaySize(photo.width, photo.height),
        filename: photo.relativePath.split("/").at(-1) ?? shortId(photo.id),
      })),
    });
    if (!placed.ok) {
      setNotice("无法把当前选择放到 Table。");
      return false;
    }
    const added = placed.value.entryOrder.length - beforeCount;
    const saveResult = await save((latest) => ({ ...latest, worktableDraft: placed.value, updatedAt: now() }));
    if (saveResult.ok) {
      setSelected(new Set());
      setNotice(`${added} photos placed on Table${requested.length - added ? ` · ${requested.length - added} already there` : ""}`);
      return true;
    }
    setNotice(workspaceSaveErrorMessage(saveResult.error));
    return false;
  };
  const toggleTable = async (photoId: PhotoId) => {
    const current = workspaceRef.current;
    if (!current) return;
    const editor = createWorktableEditor(current.worktableDraft);
    const inTable = Boolean(current.worktableDraft.placements[photoId]);
    const photo = photos.find((item) => item.id === photoId);
    const result = inTable
      ? editor.execute({ type: "remove", photoIds: [photoId] })
      : photo
        ? editor.execute({ type: "place", items: [{ photoId, ...worktableDisplaySize(photo.width, photo.height), filename: photo.relativePath.split("/").at(-1) ?? shortId(photo.id) }] })
        : undefined;
    if (!result?.ok) {
      setNotice("Table 状态保存失败。");
      return;
    }
    const saveResult = await save((latest) => ({ ...latest, worktableDraft: result.value, updatedAt: now() }));
    if (!saveResult.ok) setNotice(workspaceSaveErrorMessage(saveResult.error));
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
          <div className="sheet-zoom" aria-label="Contact Sheet 缩放">
            <button onClick={() => setGridZoom((value) => Math.max(50, value - 25))} disabled={gridZoom === 50} aria-label="缩小照片">−</button>
            <span>{gridZoom}%</span>
            <button onClick={() => setGridZoom((value) => Math.min(125, value + 25))} disabled={gridZoom === 125} aria-label="放大照片">＋</button>
          </div>
        </div>
        <div className="sheet-toolbar"><div className="filter-tabs"><button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All {Math.max(states[sourceId]?.indexedCount ?? 0, photos.length)}</button><button className={filter === "selected" ? "is-active" : ""} onClick={() => setFilter("selected")}>Selected {selected.size}</button></div><div className="toolbar-actions"><button className="button button-secondary" onClick={() => setSelected(new Set(visiblePhotos.map((photo) => photo.id)))}>Select all</button><button className="button button-secondary" onClick={() => setSelected((current) => new Set(visiblePhotos.filter((photo) => !current.has(photo.id)).map((photo) => photo.id)))}>Invert</button><button className="button button-primary" disabled={!selected.size} onClick={() => void placeOnTable([...selected])}>Place on Table</button></div></div>
        {notice && <InlineNotice message={notice} />}
        {visiblePhotos.length ? <VirtualPhotoGrid photos={visiblePhotos} selected={selected} tableIds={workspace.worktableDraft.entryOrder} missingIds={missingPhotoIds} zoom={gridZoom} initialAnchorPhotoId={workspace.resumeContext?.sourceId === sourceId ? workspace.resumeContext.anchorPhotoId : undefined} onAnchorChange={setAnchorPhotoId} onToggle={toggleSelection} onOpen={(index) => setPreviewIndex(index)} onNearEnd={() => void loadMore()} onPhotoSourceError={handlePhotoSourceError} photoSource={dependencies.photoSource} /> : <EmptyPanel title={filter === "selected" ? "No selected photos" : "No supported JPEG files"} detail={filter === "selected" ? "Select photos in All to continue." : "This folder has no readable .jpg or .jpeg files."} />}
        {loadingPage && <p className="loading-line">Loading more photos…</p>}
      </section>
      <TablePreviewPanel
        draft={workspace.worktableDraft}
        photoSource={dependencies.photoSource}
        onOpen={setTablePreviewPhotoId}
        onOpenTable={() => navigate({ name: "table", projectId })}
        onPhotoSourceError={handlePhotoSourceError}
      />
      {previewIndex !== undefined && <PreviewOverlay photoIds={visiblePhotos.map((photo) => photo.id)} index={previewIndex} workspace={workspace} photoSource={dependencies.photoSource} onClose={() => setPreviewIndex(undefined)} onMove={setPreviewIndex} onToggleTable={toggleTable} onPhotoSourceError={handlePhotoSourceError} />}
      {tablePreviewPhotoId && <PreviewOverlay
        photoIds={workspace.worktableDraft.entryOrder}
        index={Math.max(0, workspace.worktableDraft.entryOrder.indexOf(tablePreviewPhotoId))}
        workspace={workspace}
        photoSource={dependencies.photoSource}
        onClose={() => setTablePreviewPhotoId(undefined)}
        onMove={(index) => setTablePreviewPhotoId(workspace.worktableDraft.entryOrder[index])}
        onToggleTable={toggleTable}
        onPhotoSourceError={handlePhotoSourceError}
      />}
    </main>
  );
}
