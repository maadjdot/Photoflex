import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoId, PhotoRef, ProjectId, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, SequenceRevision, SequenceSummary, SequenceVersion, SourceError, SourceId, SourceRecord, VersionId, WorktableDraft, WorktableEditCommand, WorktableViewport } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { worktableDisplaySize } from "./AppPrimitives";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { SourceBrowser } from "./SourceBrowser";
import { TableContextToolbar, TableFloatingToolbar } from "./TableContextToolbar";
import { TableSequenceAddDialog } from "./TableSequenceAddDialog";
import { SequenceOrderPanel } from "./SequenceOrderPanel";
import { TableCanvas, type TableCanvasHandle } from "./TableCanvas";
import { TableWorkspace } from "./TableWorkspace";
import { useTableSession, type TableSessionCommit } from "./tableSession";
import { useProjectWorkspaceSession, workspaceSaveErrorMessage } from "./useProjectWorkspace";

const DEFAULT_VIEWPORT: WorktableViewport = { originX: 48, originY: 38, zoom: 1 };
const PILE_WIDTH = 211;
const PILE_HEIGHT = 142;
interface SequenceConfirmation { name: string; photoIds: readonly PhotoId[] }

export function TablePage({ dependencies, projectId, navigate }: { dependencies: AppDependencies; projectId: ProjectId; navigate: (route: AppRoute) => void }) {
  const { workspace, updateResumeContext, save, saveWorktable, deleteSequences, createSequenceBundle, listSequences, coordinator, loading, error } = useProjectWorkspaceSession(dependencies, projectId);
  const [summaries, setSummaries] = useState<readonly SequenceSummary[]>([]);
  const [activeSequenceId, setActiveSequenceId] = useState<SequenceId>();
  const [missing, setMissing] = useState<Set<PhotoId>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [previewPhotoId, setPreviewPhotoId] = useState<PhotoId>();
  const [comparePhotoIds, setComparePhotoIds] = useState<readonly [PhotoId, PhotoId]>();
  const [confirmation, setConfirmation] = useState<SequenceConfirmation>();
  const [deleteConfirmation, setDeleteConfirmation] = useState<readonly SequenceId[]>();
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [addToSequenceOpen, setAddToSequenceOpen] = useState(false);
  const [addToSequenceId, setAddToSequenceId] = useState<SequenceId>();
  const [sequenceRefreshKey, setSequenceRefreshKey] = useState(0);
  const [confirmationDragId, setConfirmationDragId] = useState<PhotoId>();
  const [sourcePanelMode, setSourcePanelMode] = useState<"compact" | "expanded" | "closed">("compact");
  const [entryReady, setEntryReady] = useState(false);
  const canvasRef = useRef<TableCanvasHandle>(null);
  const viewportRef = useRef(DEFAULT_VIEWPORT);
  const viewportSaveTimerRef = useRef<number | undefined>(undefined);
  const initializedRef = useRef<ProjectId | undefined>(undefined);
  const reloadRequestedRef = useRef<ProjectId | undefined>(undefined);

  const persistTableCommit = useCallback(async ({ draft: nextDraft }: TableSessionCommit) => {
    const result = await saveWorktable(nextDraft);
    if (!result.ok) setNotice(workspaceSaveErrorMessage(result.error));
  }, [saveWorktable]);
  const tableSession = useTableSession(projectId, persistTableCommit);
  const { draft, selectedPhotoIds: photoIds, selectedPileIds: pileIds, actions } = tableSession;
  const selectedPileId = pileIds.length === 1 ? pileIds[0] : undefined;

  // The project Provider intentionally survives route changes. Refresh once
  // when Table enters so a preceding Contact Sheet write cannot leave this
  // page with the Provider's pre-write workspace snapshot.
  useEffect(() => {
    if (reloadRequestedRef.current === projectId) return;
    reloadRequestedRef.current = projectId;
    initializedRef.current = undefined;
    void coordinator.flush().then(() => coordinator.load()).then(() => setEntryReady(true));
  }, [coordinator, projectId]);

  useEffect(() => {
    if (!entryReady || !workspace || initializedRef.current === projectId) return;
    initializedRef.current = projectId;
    tableSession.resetCommittedDraft(workspace.worktableDraft);
    const restored = workspace.resumeContext?.page === "table" ? workspace.resumeContext.tableViewport : undefined;
    viewportRef.current = restored ?? DEFAULT_VIEWPORT;
    void listSequences().then((result) => {
      if (!result.ok) { setNotice("Sequences could not be loaded."); return; }
      setSummaries(result.value);
      const restoredId = workspace.resumeContext?.sequenceId;
      setActiveSequenceId(restoredId && result.value.some((item) => item.id === restoredId) ? restoredId : result.value[0]?.id);
    });
    void updateResumeContext((current) => ({ page: "table", filter: "all", tableViewport: restored ?? DEFAULT_VIEWPORT, sequenceId: current?.sequenceId }), true).then((result) => {
      if (!result.ok) setNotice(workspaceSaveErrorMessage(result.error));
    });
  }, [entryReady, listSequences, projectId, tableSession.resetCommittedDraft, updateResumeContext, workspace]);
  const onViewportChange = useCallback((next: WorktableViewport) => {
    viewportRef.current = next;
    if (viewportSaveTimerRef.current !== undefined) window.clearTimeout(viewportSaveTimerRef.current);
    viewportSaveTimerRef.current = window.setTimeout(() => {
      void updateResumeContext((current) => ({ page: "table", filter: "all", tableViewport: next, sequenceId: current?.sequenceId }));
    }, 500);
  }, [updateResumeContext]);
  useEffect(() => {
    if (!activeSequenceId || initializedRef.current !== projectId) return;
    void updateResumeContext((current) => ({ page: "table", filter: "all", tableViewport: current?.tableViewport ?? viewportRef.current, sequenceId: activeSequenceId }));
  }, [activeSequenceId, projectId, updateResumeContext]);
  useEffect(() => () => {
    if (viewportSaveTimerRef.current !== undefined) window.clearTimeout(viewportSaveTimerRef.current);
    void updateResumeContext((current) => ({ page: "table", filter: "all", tableViewport: viewportRef.current, sequenceId: current?.sequenceId }));
  }, [updateResumeContext]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (selectedPileId) setActiveSequenceId(selectedPileId);
  }, [selectedPileId]);
  const execute = useCallback((command: WorktableEditCommand) => {
    const result = tableSession.execute(command);
    if (!result.ok) setNotice("This Table operation could not be completed.");
  }, [tableSession.execute]);
  const history = useCallback((direction: "undo" | "redo") => {
    if (direction === "undo") tableSession.undo();
    else tableSession.redo();
  }, [tableSession.redo, tableSession.undo]);

  const onPhotoError = useCallback((id: PhotoId, sourceError: SourceError) => {
    if (sourceError.kind === "photo-not-found" || sourceError.kind === "preview-unavailable") setMissing((current) => new Set([...current, id]));
  }, []);

  const placeSourcePhotos = useCallback(async (photos: readonly PhotoRef[], point = canvasRef.current?.getViewportCenter() ?? { x: 200, y: 160 }) => {
    const beforeCount = draft?.entryOrder.length ?? 0;
    const result = tableSession.placePhotos(
      photos.map((photo) => ({
        photoId: photo.id,
        ...worktableDisplaySize(photo.width, photo.height),
        filename: photo.relativePath.split(/[\\/]/).at(-1) ?? photo.id,
      })),
      { x: point.x - 120, y: point.y - 88 },
    );
    if (!result.ok) {
      setNotice("Photos could not be placed on Table.");
      return false;
    }
    const addedCount = Math.max(0, result.value.draft.entryOrder.length - beforeCount);
    if (addedCount) setNotice(`${addedCount} photo${addedCount === 1 ? "" : "s"} placed on Table.`);
    return true;
  }, [draft?.entryOrder.length, tableSession.placePhotos]);
  const dropSourcePhotos = useCallback((photoIds: readonly PhotoId[], point: { x: number; y: number }) => {
    void Promise.all(photoIds.map((photoId) => dependencies.photoSource.getPhoto(photoId))).then((results) => {
      const photos = results.flatMap((result) => result.ok ? [result.value] : []);
      if (photos.length) void placeSourcePhotos(photos, point);
    });
  }, [dependencies.photoSource, placeSourcePhotos]);

  const requestSequence = (ids: readonly PhotoId[]) => {
    const ordered = draft?.entryOrder.filter((id) => ids.includes(id)) ?? [];
    if (!ordered.length) return;
    const used = new Set(summaries.map((item) => item.name.toLocaleLowerCase()));
    let n = summaries.length + 1;
    while (used.has(`sequence ${String(n).padStart(2, "0")}`)) n++;
    setConfirmation({ name: `Sequence ${String(n).padStart(2, "0")}`, photoIds: ordered });
  };
  const createPile = async () => {
    if (!confirmation || !draft) return;
    const name = confirmation.name.trim();
    if (!name) { setNotice("Give the Sequence a name."); return; }
    const id = newId("sequence") as SequenceId;
    const now = new Date().toISOString();
    const items = confirmation.photoIds.map((photoId) => ({ id: newId("item") as SequenceItemId, kind: "photo" as const, photoId }));
    const currentVersionId = newId("version") as VersionId;
    const sequence: SequenceDocument = { id, projectId, name, items, segments: [], readingUnits: items.map((item) => ({ id: newId("unit") as ReadingUnitId, kind: "single", itemId: item.id })), currentVersionId, revision: 0 as SequenceRevision, createdAt: now, updatedAt: now };
    const initialVersion: SequenceVersion = { id: currentVersionId, projectId, sequenceId: id, name: `Initial · ${name}`, itemCount: items.length, items, segments: [], readingUnits: sequence.readingUnits, createdAt: now };
    const center = canvasRef.current?.getViewportCenter() ?? { x: 200, y: 160 };
    const flushed = await coordinator.flush();
    if (!flushed.ok) { setNotice(workspaceSaveErrorMessage(flushed.error)); return; }
    const result = await createSequenceBundle({ sequence, initialVersion, pile: { x: center.x - PILE_WIDTH / 2, y: center.y - PILE_HEIGHT / 2, width: PILE_WIDTH, height: PILE_HEIGHT } });
    if (!result.ok) { setNotice(result.error.kind === "sequence-name-exists" ? "That Sequence name already exists." : "Sequence could not be created."); return; }
    if (result.value.worktableDraft) tableSession.resetCommittedDraft(result.value.worktableDraft, { pileIds: [id] });
    setSummaries((items) => [...items, result.value.summary]); setActiveSequenceId(id); setConfirmation(undefined); setNotice(`Created ${name}.`);
  };

  const confirmRemoveSelectedPiles = useCallback(async (sequenceIds: readonly SequenceId[] = pileIds) => {
    if (!draft || !sequenceIds.length) return;
    setDeleteBusy(true);
    const removed = tableSession.prepareStructuralDraft({ type: "remove-sequence-piles", sequenceIds });
    if (!removed.ok) { setNotice("This Sequence pile could not be removed."); setDeleteBusy(false); return; }
    const result = await deleteSequences(sequenceIds, removed.value);
    if (!result.ok) { setNotice(workspaceSaveErrorMessage(result.error)); setDeleteBusy(false); return; }
    // Deleting a pile also deletes its Sequence and versions. Start a new
    // history so Undo cannot resurrect a dangling pile reference.
    tableSession.resetCommittedDraft(removed.value);
    setSummaries((items) => items.filter((item) => !sequenceIds.includes(item.id)));
    if (activeSequenceId && sequenceIds.includes(activeSequenceId)) setActiveSequenceId(summaries.find((item) => !sequenceIds.includes(item.id))?.id);
    setDeleteBusy(false);
    setDeleteConfirmation(undefined);
  }, [activeSequenceId, deleteSequences, draft, pileIds, summaries, tableSession.prepareStructuralDraft, tableSession.resetCommittedDraft]);

  if (!entryReady || loading) return <main className="page centered-state"><div className="loading-mark" /><p>Loading Table…</p></main>;
  if (!workspace) return <main className="page centered-state"><h1>{error ?? "Table could not be loaded."}</h1></main>;
  if (initializedRef.current !== projectId) return <main className="page centered-state"><div className="loading-mark" /><p>Loading Table…</p></main>;
  const writeSnapshot = coordinator.getSnapshot();
  const firstSource = workspace.sources.find((source) => !source.removedAt);
  const addSource = async () => {
    const result = await dependencies.photoSource.chooseFolder(workspace.sources.map((source) => source.id));
    if (!result.ok) { if (result.error.kind !== "cancelled") setNotice("Photo source could not be added."); return; }
    const source: SourceRecord = { id: result.value.sourceId, displayName: result.value.displayName, createdAt: new Date().toISOString() };
    const saved = await save((current) => ({ ...current, sources: current.sources.some((item) => item.id === source.id) ? current.sources.map((item) => item.id === source.id ? { ...item, removedAt: undefined } : item) : [...current.sources, source], updatedAt: new Date().toISOString() }));
    if (!saved.ok) setNotice(workspaceSaveErrorMessage(saved.error));
  };
  const openContactSheet = (sourceId: SourceId) => { void coordinator.flush().then((result) => { if (result.ok) navigate({ name: "contact-sheet", projectId, sourceId }); else setNotice(workspaceSaveErrorMessage(result.error)); }); };
  const reconnectSource = async (sourceId: SourceId) => {
    const restored = await dependencies.photoSource.restoreFolder(sourceId);
    if (!restored.ok) { setNotice("This source could not be reconnected. Choose the original folder."); return; }
    const saved = await save((current) => ({ ...current, sources: current.sources.map((source) => source.id === sourceId ? { ...source, removedAt: undefined } : source), updatedAt: new Date().toISOString() }));
    if (!saved.ok) setNotice(workspaceSaveErrorMessage(saved.error));
  };
  const projectPanel = <section className="table-source-project-details"><small>PROJECT DETAILS</small><h2>{workspace.name}</h2><label>Name<input defaultValue={workspace.name} onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== workspace.name) void save((current) => ({ ...current, name, updatedAt: new Date().toISOString() })); }} /></label><label>Memo<textarea defaultValue={workspace.memo} onBlur={(event) => { const memo = event.currentTarget.value; void save((current) => ({ ...current, memo, updatedAt: new Date().toISOString() })); }} /></label><button type="button" className="table-source-add" onClick={() => void addSource()}>＋ Add Source</button></section>;
  const sourceBrowser = <SourceBrowser dependencies={dependencies} projectId={projectId} workspace={workspace} onPlacePhotos={placeSourcePhotos} onOpenPhoto={setPreviewPhotoId} onAddSource={() => void addSource()} onOpenProjectDetails={() => {}} projectPanel={projectPanel} onOpenContactSheet={openContactSheet} onReconnectSource={(sourceId) => void reconnectSource(sourceId)} onPhotoError={onPhotoError} onPanelModeChange={setSourcePanelMode} />;

  return <main className="table-page page">
    {notice && <p className="table-notice" role="status">{notice}</p>}
    <TableWorkspace sidebar={sourceBrowser} sidebarMode={sourcePanelMode} storageKey={`photoflex:table-sidebar:${projectId}`}>
    <div className="table-canvas-area" aria-label="Table 工具栏">
    <TableCanvas
      ref={canvasRef}
      session={{ ...tableSession, execute }}
      photoSource={dependencies.photoSource}
      summaries={summaries}
      initialViewport={viewportRef.current}
      onViewportChange={onViewportChange}
      onOpenPhoto={setPreviewPhotoId}
      onOpenSequence={(sequenceId) => navigate({ name: "sequence", projectId, sequenceId })}
      onRequestSequence={requestSequence}
      onDropPhotos={dropSourcePhotos}
      onRemovePiles={(sequenceIds) => setDeleteConfirmation(sequenceIds)}
      onPhotoError={onPhotoError}
      missingPhotoIds={missing}
      interactionDisabled={writeSnapshot.writeState === "failed"}
      emptyAction={{
        label: firstSource ? "Open Photos" : "Add a photo folder",
        onClick: () => firstSource ? navigate({ name: "contact-sheet", projectId, sourceId: firstSource.id }) : navigate({ name: "project", projectId }),
      }}
    />
    <TableFloatingToolbar storageKey={`photoflex:table-toolbar:${projectId}`} actions={actions} canUndo={tableSession.canUndo} canRedo={tableSession.canRedo} onUndo={() => history("undo")} onRedo={() => history("redo")} onExecute={execute} />
    <TableContextToolbar draft={draft} actions={actions} canAddToSequence={Boolean(photoIds.length && summaries.length)} onExecute={execute} onRequestSequence={requestSequence} onAddToSequence={() => { setAddToSequenceId(summaries[0]?.id); setAddToSequenceOpen(true); }} onPreview={setPreviewPhotoId} onComparePhotos={setComparePhotoIds} onCompareSequences={(ids) => navigate({ name: "sequence-compare", projectId, leftSequenceId: ids[0], rightSequenceId: ids[1] })} onRemovePiles={(ids) => setDeleteConfirmation(ids)} onRemovePhotos={(ids) => execute({ type: "remove", photoIds: ids })} onClearSelection={tableSession.clearSelection} />
    <span className="table-canvas-summary">{draft.entryOrder.length} photos · {draft.groups.length} groups · {draft.pileOrder.length} piles</span>
    </div>
    {confirmation && <section className="sequence-confirmation sequence-pile-confirmation" role="dialog" aria-modal="true" aria-label="Create Sequence pile"><header><h2>Create Sequence</h2><button type="button" aria-label="Close Create Sequence" onClick={() => setConfirmation(undefined)}>×</button></header><label><span>SEQUENCE NAME</span><input autoFocus value={confirmation.name} onChange={(event) => setConfirmation({ ...confirmation, name: event.target.value })} onKeyDown={(event) => event.key === "Enter" && void createPile()} /></label><div className="sequence-confirmation-order">{confirmation.photoIds.map((id, index) => <button key={id} draggable onDragStart={() => setConfirmationDragId(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (confirmationDragId) setConfirmation({ ...confirmation, photoIds: movePhoto(confirmation.photoIds, confirmationDragId, index) }); setConfirmationDragId(undefined); }}><PhotoThumb photoSource={dependencies.photoSource} photoId={id} alt={`Order ${index + 1}`} onError={onPhotoError} /><span>{index + 1}</span></button>)}</div><div><button onClick={() => setConfirmation(undefined)}>Cancel</button><button className="button button-primary" onClick={() => void createPile()}>Create Pile</button></div></section>}
    {addToSequenceOpen && <TableSequenceAddDialog coordinator={coordinator} projectId={projectId} photoIds={photoIds} summaries={summaries} initialSequenceId={addToSequenceId} onClose={() => setAddToSequenceOpen(false)} onSummariesChange={setSummaries} onSequenceChanged={(sequenceId) => { setActiveSequenceId(sequenceId); setSequenceRefreshKey((value) => value + 1); }} onNotice={setNotice} />}
    {deleteConfirmation && <section className="delete-sequence-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-sequence-title"><h2 id="delete-sequence-title">Delete {deleteConfirmation.length > 1 ? "Sequences" : "Sequence"}?</h2><p>This will permanently delete {deleteConfirmation.map((id) => summaries.find((item) => item.id === id)?.name ?? "Missing Sequence").join(", ")} and its {deleteConfirmation.reduce((count, id) => count + (summaries.find((item) => item.id === id)?.itemCount ?? 0), 0)} photo references and versions. This cannot be undone.</p><footer><button type="button" autoFocus disabled={deleteBusy} onClick={() => setDeleteConfirmation(undefined)}>Cancel</button><button type="button" className="button-danger" disabled={deleteBusy} onClick={() => void confirmRemoveSelectedPiles(deleteConfirmation)}>{deleteBusy ? "Deleting…" : "Delete Sequence"}</button></footer></section>}
    <SequenceOrderPanel coordinator={coordinator} dependencies={dependencies} projectId={projectId} sequenceId={activeSequenceId} refreshKey={sequenceRefreshKey} navigate={navigate} onPhotoError={onPhotoError} onNotice={setNotice} onItemCountChange={(sequenceId, itemCount) => setSummaries((items) => items.map((item) => item.id === sequenceId ? { ...item, itemCount } : item))} />
    </TableWorkspace>
    {previewPhotoId && draft.placements[previewPhotoId] && <Preview photoId={previewPhotoId} filename={draft.placements[previewPhotoId].filename} photoSource={dependencies.photoSource} onClose={() => setPreviewPhotoId(undefined)} onError={onPhotoError} />}
    {comparePhotoIds && <PhotoCompare ids={comparePhotoIds} draft={draft} photoSource={dependencies.photoSource} onClose={() => setComparePhotoIds(undefined)} />}
  </main>;
}

function Preview({ photoId, filename, photoSource, onClose, onError }: { photoId: PhotoId; filename: string; photoSource: AppDependencies["photoSource"]; onClose: () => void; onError: (id: PhotoId, error: SourceError) => void }) {
  const [url, setUrl] = useState<string>();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => { let live = true, lease: { url: string; release(): void } | undefined; void photoSource.preview(photoId).then((result) => { if (!result.ok) { if (live) onError(photoId, result.error); return; } if (!live) return result.value.release(); lease = result.value; setUrl(lease.url); }); return () => { live = false; lease?.release(); }; }, [onError, photoId, photoSource]);
  useEffect(() => { closeButtonRef.current?.focus(); const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); } else if (event.key === "Tab") { event.preventDefault(); closeButtonRef.current?.focus(); } }; window.addEventListener("keydown", key); return () => { window.removeEventListener("keydown", key); previousFocusRef.current?.focus(); }; }, []);
  return <div className="table-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${filename}`} onPointerDown={onClose}><section className="table-preview-dialog" onPointerDown={(event) => event.stopPropagation()}><header><span>{filename}</span><button ref={closeButtonRef} onClick={onClose} aria-label="Close preview">×</button></header><div className="table-preview-image-wrap">{url ? <img src={url} alt={filename} /> : <div className="preview-placeholder">Preview unavailable</div>}</div></section></div>;
}
function PhotoCompare({ ids, draft, photoSource, onClose }: { ids: readonly [PhotoId, PhotoId]; draft: WorktableDraft; photoSource: AppDependencies["photoSource"]; onClose: () => void }) {
  const [order, setOrder] = useState(ids), [urls, setUrls] = useState<readonly string[]>([]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => { let live = true; const leases: Array<{ release(): void }> = []; void Promise.all(order.map((id) => photoSource.preview(id))).then((results) => { if (!live) return results.forEach((x) => x.ok && x.value.release()); leases.push(...results.flatMap((x) => x.ok ? [x.value] : [])); setUrls(results.map((x) => x.ok ? x.value.url : "")); }); return () => { live = false; leases.forEach((x) => x.release()); }; }, [order, photoSource]);
  useEffect(() => { closeButtonRef.current?.focus(); const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); } else if (event.key === "Tab") { event.preventDefault(); closeButtonRef.current?.focus(); } }; window.addEventListener("keydown", key); return () => { window.removeEventListener("keydown", key); previousFocusRef.current?.focus(); }; }, []);
  return <div className="compare-backdrop" role="dialog" aria-modal="true" aria-label="Compare two photos"><header><span>COMPARE</span><button onClick={() => setOrder([order[1], order[0]])}>Swap</button><button ref={closeButtonRef} onClick={onClose} aria-label="Close compare">×</button></header><div className="compare-images">{order.map((id, index) => <figure key={id}><span>{index ? "B" : "A"}</span>{urls[index] ? <img src={urls[index]} alt={draft.placements[id].filename} /> : <div className="preview-placeholder">Preview unavailable</div>}</figure>)}</div></div>;
}
function movePhoto(items: readonly PhotoId[], id: PhotoId, to: number) { const rest = items.filter((x) => x !== id), target = items.slice(0, to).filter((x) => x !== id).length; return [...rest.slice(0, target), id, ...rest.slice(target)]; }
function newId(prefix: string) { return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
