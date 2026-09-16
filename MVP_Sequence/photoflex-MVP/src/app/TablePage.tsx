import { startSharedScan, stopSharedScan } from "./ProjectSourceMonitor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PhotoId, PhotoRef, ProjectId, SequenceId, SequenceSummary, SourceError, SourceId, SourceRecord, VersionId, WorktableDraft, WorktableEditCommand, WorktableItemId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { createInitialSequenceBundle } from "../modules/sequence";
import { orderPhotoIdsByTablePosition } from "../modules/worktable";
import { useDialogKeyboard, worktableDisplaySize } from "./AppPrimitives";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { SourceBrowser } from "./SourceBrowser";
import { TableContextToolbar, TableFloatingToolbar } from "./TableContextToolbar";
import { TableSequenceAddDialog } from "./TableSequenceAddDialog";
import { TableCanvas, type TableCanvasHandle } from "./TableCanvas";
import { TableWorkspace } from "./TableWorkspace";
import { TablePhotoCompare, TablePhotoPreview } from "./TableMediaDialogs";
import { useTableSession, type TableSessionCommit } from "./tableSession";
import { useProjectWorkspaceSession, workspaceSaveErrorMessage } from "./useProjectWorkspace";
import { useTableWorkspaceLifecycle } from "./useTableWorkspaceLifecycle";
import { useLocale } from "./locale";
import { SequenceOverlay } from "./SequenceOverlay";
import { sequencePileCardWidth } from "./sequenceCardGeometry";

const PILE_HEIGHT = 176;
interface SequenceConfirmation { name: string; photoIds: readonly PhotoId[] }

export function TablePage({ dependencies, projectId, navigate, sequenceOverlay }: { dependencies: AppDependencies; projectId: ProjectId; navigate: (route: AppRoute) => void; sequenceOverlay?: { readonly sequenceId: SequenceId; readonly openVersionId?: VersionId } }) {
  const { t } = useLocale();
  const { workspace, save, saveWorktable, deleteSequences, createSequenceBundle, listSequences, coordinator, loading, error } = useProjectWorkspaceSession(dependencies, projectId);
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
  const [confirmationDragId, setConfirmationDragId] = useState<PhotoId>();
  const [selectedMemoId, setSelectedMemoId] = useState<string>();
  const [addingSource, setAddingSource] = useState(false);
  const [sourcePanelMode, setSourcePanelMode] = useState<"compact" | "expanded" | "closed">("compact");
  const canvasRef = useRef<TableCanvasHandle>(null);
  const createSequenceDialogRef = useRef<HTMLElement>(null);
  const deleteSequenceDialogRef = useRef<HTMLElement>(null);
  useDialogKeyboard(createSequenceDialogRef, () => setConfirmation(undefined), Boolean(confirmation));
  useDialogKeyboard(deleteSequenceDialogRef, () => { if (!deleteBusy) setDeleteConfirmation(undefined); }, Boolean(deleteConfirmation));
  const summaryById = useMemo(() => new Map(summaries.map((summary) => [summary.id, summary])), [summaries]);

  const persistTableCommit = useCallback(async ({ draft: nextDraft }: TableSessionCommit) => {
    const result = await saveWorktable(nextDraft);
    if (!result.ok) setNotice(workspaceSaveErrorMessage(result.error));
  }, [saveWorktable]);
  const tableSession = useTableSession(projectId, persistTableCommit);
  const { draft, selectedPhotoIds: photoIds, selectedPileIds: pileIds, actions } = tableSession;
  const selectedSourcePhotoIds = useMemo(
    () => photoIds.map((id) => draft.placements[id]?.photoId).filter((id): id is PhotoId => Boolean(id)),
    [draft.placements, photoIds],
  );
  const selectedPileId = pileIds.length === 1 ? pileIds[0] : undefined;
  const onTableInitialized = useCallback(({ summaries: restoredSummaries, activeSequenceId: restoredSequenceId }: { summaries: readonly SequenceSummary[]; activeSequenceId?: SequenceId }) => {
    setSummaries(restoredSummaries);
    setActiveSequenceId(restoredSequenceId);
  }, []);
  const tableLifecycle = useTableWorkspaceLifecycle({
    projectId,
    workspace,
    coordinator,
    resetCommittedDraft: tableSession.resetCommittedDraft,
    activeSequenceId,
    onInitialized: onTableInitialized,
    onError: setNotice,
  });
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
    if (!result.ok) setNotice(t("table.operationFailed"));
  }, [t, tableSession.execute]);
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
        id: crypto.randomUUID() as WorktableItemId,
        photoId: photo.id,
        ...worktableDisplaySize(photo.width, photo.height),
        filename: photo.relativePath.split(/[\\/]/).at(-1) ?? photo.id,
      })),
      { x: point.x - 120, y: point.y - 88 },
    );
    if (!result.ok) {
      setNotice(t("table.photosPlaceFailed"));
      return false;
    }
    const addedCount = Math.max(0, result.value.draft.entryOrder.length - beforeCount);
    if (addedCount) setNotice(t("table.photosPlaced", { count: addedCount }));
    return true;
  }, [draft?.entryOrder.length, t, tableSession.placePhotos]);
  const dropSourcePhotos = useCallback((photoIds: readonly PhotoId[], point: { x: number; y: number }) => {
    void Promise.all(photoIds.map((photoId) => dependencies.photoSource.getPhoto(photoId))).then((results) => {
      const photos = results.flatMap((result) => result.ok ? [result.value] : []);
      if (photos.length) void placeSourcePhotos(photos, point);
    });
  }, [dependencies.photoSource, placeSourcePhotos]);

  const dropExternalFiles = useCallback(async (handles: readonly FileSystemHandle[], point: { x: number; y: number }) => {
    if (!handles.length) { setNotice("This browser cannot keep access to dropped files."); return; }
    if (!workspace) return;
    let externalSource = workspace.sources.find((source) => source.kind === "external-files" && !source.removedAt);
    let currentSources = workspace.sources;
    if (!externalSource) {
      externalSource = {
        id: crypto.randomUUID() as SourceId,
        displayName: "External Imports",
        createdAt: new Date().toISOString(),
        kind: "external-files",
      };
      const source = externalSource;
      const saved = await save((current) => ({ ...current, sources: [...current.sources, source], updatedAt: new Date().toISOString() }));
      if (!saved.ok) { setNotice(workspaceSaveErrorMessage(saved.error)); return; }
      currentSources = saved.value.sources;
    }
    const imported = await dependencies.photoSource.ingestDroppedFiles(handles, currentSources, externalSource.id);
    if (!imported.ok) {
      setNotice(imported.error.kind === "permission-denied" ? "Permission to read the dropped files was denied." : "Dropped photos could not be imported.");
      return;
    }
    const photos = imported.value.items.map((item) => item.photo);
    if (photos.length) await placeSourcePhotos(photos, point);
    if (imported.value.skipped.length) setNotice(`${imported.value.skipped.length} unsupported item(s) skipped. Only JPEG files are supported.`);
  }, [dependencies.photoSource, placeSourcePhotos, save, workspace]);

  const requestSequence = (ids: readonly WorktableItemId[]) => {
    const ordered = draft ? orderPhotoIdsByTablePosition(draft, ids) : [];
    if (!ordered.length) return;
    const used = new Set(summaries.map((item) => item.name.toLocaleLowerCase()));
    let n = summaries.length + 1;
    while (used.has(`sequence ${String(n).padStart(2, "0")}`)) n++;
    setConfirmation({ name: `Sequence ${String(n).padStart(2, "0")}`, photoIds: ordered });
  };
  const createPile = async () => {
    if (!confirmation || !draft) return;
    const name = confirmation.name.trim();
    if (!name) { setNotice(t("table.sequenceNameRequired")); return; }
    const { sequence, initialVersion } = createInitialSequenceBundle({
      projectId,
      name,
      content: { kind: "photos", photoIds: confirmation.photoIds },
    });
    const id = sequence.id;
    const center = canvasRef.current?.getViewportCenter() ?? { x: 200, y: 160 };
    const flushed = await coordinator.flush();
    if (!flushed.ok) { setNotice(workspaceSaveErrorMessage(flushed.error)); return; }
    const pileWidth = sequencePileCardWidth(confirmation.photoIds.length);
    const result = await createSequenceBundle({ sequence, initialVersion, pile: { x: center.x - pileWidth / 2, y: center.y - PILE_HEIGHT / 2, width: pileWidth, height: PILE_HEIGHT } });
    if (!result.ok) { setNotice(result.error.kind === "sequence-name-exists" ? t("table.sequenceNameExists") : t("table.sequenceCreateFailed")); return; }
    if (result.value.worktableDraft) tableSession.resetCommittedDraft(result.value.worktableDraft, { pileIds: [id] });
    setSummaries((items) => [...items, result.value.summary]); setActiveSequenceId(id); setConfirmation(undefined); setNotice(t("table.sequenceCreated", { name }));
  };

  const confirmRemoveSelectedPiles = useCallback(async (sequenceIds: readonly SequenceId[] = pileIds) => {
    if (!draft || !sequenceIds.length) return;
    setDeleteBusy(true);
    const removed = tableSession.prepareStructuralDraft({ type: "remove-sequence-piles", sequenceIds });
    if (!removed.ok) { setNotice(t("sequence.removePileFailed")); setDeleteBusy(false); return; }
    const result = await deleteSequences(sequenceIds, removed.value);
    if (!result.ok) { setNotice(workspaceSaveErrorMessage(result.error)); setDeleteBusy(false); return; }
    // Deleting a pile also deletes its Sequence and versions. Start a new
    // history so Undo cannot resurrect a dangling pile reference.
    tableSession.resetCommittedDraft(removed.value);
    setSummaries((items) => items.filter((item) => !sequenceIds.includes(item.id)));
    if (activeSequenceId && sequenceIds.includes(activeSequenceId)) setActiveSequenceId(summaries.find((item) => !sequenceIds.includes(item.id))?.id);
    setDeleteBusy(false);
    setDeleteConfirmation(undefined);
  }, [activeSequenceId, deleteSequences, draft, pileIds, summaries, t, tableSession.prepareStructuralDraft, tableSession.resetCommittedDraft]);

  if (!tableLifecycle.ready || loading) return <main className="page centered-state"><div className="loading-mark" /><p>{t("table.loading")}</p></main>;
  if (!workspace) return <main className="page centered-state"><h1>{error ?? t("table.loadFailed")}</h1></main>;
  const writeSnapshot = coordinator.getSnapshot();
  const firstSource = workspace.sources.find((source) => !source.removedAt);
  const addSource = async () => {
    setAddingSource(true);
    try {
    const result = await dependencies.photoSource.chooseFolder(workspace.sources.map((source) => source.id));
    if (!result.ok) { if (result.error.kind !== "cancelled") setNotice(t("source.addFailed")); return; }
    const source: SourceRecord = { id: result.value.sourceId, displayName: result.value.displayName, createdAt: new Date().toISOString(), kind: "folder" };
    const saved = await save((current) => ({ ...current, sources: current.sources.some((item) => item.id === source.id) ? current.sources.map((item) => item.id === source.id ? { ...item, removedAt: undefined } : item) : [...current.sources, source], updatedAt: new Date().toISOString() }));
    if (!saved.ok) setNotice(workspaceSaveErrorMessage(saved.error));
    } finally { setAddingSource(false); }
  };
  const openContactSheet = (sourceId: SourceId) => { void coordinator.flush().then((result) => { if (result.ok) navigate({ name: "contact-sheet", projectId, sourceId }); else setNotice(workspaceSaveErrorMessage(result.error)); }); };
  const reconnectSource = async (sourceId: SourceId) => {
    const restored = await dependencies.photoSource.restoreFolder(sourceId);
    if (!restored.ok) { setNotice(t("source.reconnectFailed")); return; }
    const saved = await save((current) => ({ ...current, sources: current.sources.map((source) => source.id === sourceId ? { ...source, removedAt: undefined } : source), updatedAt: new Date().toISOString() }));
    if (!saved.ok) setNotice(workspaceSaveErrorMessage(saved.error));
    else startSharedScan(dependencies.photoSource, sourceId);
  };
  const selectedMemo = draft.memos?.find((memo) => memo.id === selectedMemoId);
  const previewPlacement = previewPhotoId
    ? draft.entryOrder.map((itemId) => draft.placements[itemId]).find((placement) => placement.photoId === previewPhotoId)
    : undefined;
  const addMemo = () => {
    const center = canvasRef.current?.getViewportCenter() ?? { x: 200, y: 160 };
    const id = crypto.randomUUID();
    execute({ type: "create-memo", memo: { id, text: "", x: center.x - 130, y: center.y - 90, width: 260, height: 180, fontSize: 16, photoIds: [] } });
    setSelectedMemoId(id);
  };
  const removeSource = async (sourceId: SourceId) => {
    const saved = await save((current) => ({ ...current, sources: current.sources.map((source) => source.id === sourceId ? { ...source, removedAt: new Date().toISOString() } : source), updatedAt: new Date().toISOString() }));
    if (!saved.ok) { setNotice(workspaceSaveErrorMessage(saved.error)); return false; }
    stopSharedScan(dependencies.photoSource, sourceId);
    return true;
  };
  const sourceBrowser = <SourceBrowser addingSource={addingSource} onRemoveSource={removeSource} dependencies={dependencies} projectId={projectId} workspace={workspace} onPlacePhotos={placeSourcePhotos} onOpenPhoto={setPreviewPhotoId} onAddSource={() => void addSource()} onOpenContactSheet={openContactSheet} onReconnectSource={(sourceId) => void reconnectSource(sourceId)} onPhotoError={onPhotoError} onPanelModeChange={setSourcePanelMode} />;

  return <main className="table-page page">
    {notice && <p className="table-notice" role="status">{notice}</p>}
    <TableWorkspace sidebar={sourceBrowser} sidebarMode={sourcePanelMode} storageKey={`photoflex:table-sidebar:${projectId}`}>
    <div className="table-canvas-area" aria-label={t("table.toolbar")}>
    <TableCanvas
      ref={canvasRef}
      session={{ ...tableSession, execute }}
      photoSource={dependencies.photoSource}
      summaries={summaries}
      initialViewport={tableLifecycle.initialViewport}
      onViewportChange={tableLifecycle.onViewportChange}
      selectedMemoId={selectedMemoId}
      onSelectMemo={setSelectedMemoId}
      onSelectPile={(id) => { setSelectedMemoId(undefined); setActiveSequenceId(id); }}
      onOpenPhoto={setPreviewPhotoId}
      onOpenSequence={(sequenceId) => navigate({ name: "sequence", projectId, sequenceId })}
      onRequestSequence={requestSequence}
      onDropPhotos={dropSourcePhotos}
      onDropExternalFiles={(handles, point) => void dropExternalFiles(handles, point)}
      onRemovePiles={(sequenceIds) => setDeleteConfirmation(sequenceIds)}
      onPhotoError={onPhotoError}
      missingPhotoIds={missing}
      interactionDisabled={writeSnapshot.writeState === "failed"}
      emptyAction={{
        label: firstSource ? t("table.openPhotos") : t("table.addFolder"),
        onClick: () => firstSource ? navigate({ name: "contact-sheet", projectId, sourceId: firstSource.id }) : navigate({ name: "project", projectId }),
      }}
    />
    <TableFloatingToolbar onAddMemo={addMemo} selectedMemo={selectedMemo} storageKey={`photoflex:table-toolbar:${projectId}`} actions={actions} canUndo={tableSession.canUndo} canRedo={tableSession.canRedo} onUndo={() => history("undo")} onRedo={() => history("redo")} onExecute={execute} canAddToSequence={Boolean(photoIds.length && summaries.length)} onAddToSequence={() => { setAddToSequenceId(summaries[0]?.id); setAddToSequenceOpen(true); }} onRequestSequence={requestSequence} />
    <TableContextToolbar draft={draft} actions={actions} canAddToSequence={Boolean(photoIds.length && summaries.length)} onExecute={execute} onRequestSequence={requestSequence} onAddToSequence={() => { setAddToSequenceId(summaries[0]?.id); setAddToSequenceOpen(true); }} onPreview={setPreviewPhotoId} onComparePhotos={setComparePhotoIds} onCompareSequences={(ids) => navigate({ name: "sequence-compare", projectId, leftSequenceId: ids[0], rightSequenceId: ids[1] })} onRemovePiles={(ids) => setDeleteConfirmation(ids)} onRemovePhotos={(ids) => execute({ type: "remove", photoIds: ids })} />
    </div>
    {confirmation && <section ref={createSequenceDialogRef} className="sequence-confirmation sequence-pile-confirmation" role="dialog" aria-modal="true" aria-label={t("sequence.createPileAria")}><header><h2>{t("table.createSequence")}</h2><button type="button" aria-label={t("common.close")} onClick={() => setConfirmation(undefined)}>×</button></header><label><span>{t("table.name")}</span><input autoFocus value={confirmation.name} onChange={(event) => setConfirmation({ ...confirmation, name: event.target.value })} onKeyDown={(event) => event.key === "Enter" && void createPile()} /></label><div className="sequence-confirmation-order">{confirmation.photoIds.map((id, index) => <button key={`${id}-${index}`} draggable onDragStart={() => setConfirmationDragId(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (confirmationDragId) setConfirmation({ ...confirmation, photoIds: movePhoto(confirmation.photoIds, confirmationDragId, index) }); setConfirmationDragId(undefined); }}><PhotoThumb photoSource={dependencies.photoSource} photoId={id} alt={t("sequence.orderItem", { index: index + 1, filename: draft.entryOrder.map((itemId) => draft.placements[itemId]).find((placement) => placement.photoId === id)?.filename ?? id })} onError={onPhotoError} /><span>{index + 1}</span></button>)}</div><div><button onClick={() => setConfirmation(undefined)}>{t("common.cancel")}</button><button className="button button-primary" onClick={() => void createPile()}>{t("table.createPile")}</button></div></section>}
    {addToSequenceOpen && <TableSequenceAddDialog persistence={coordinator} listSequences={listSequences} projectId={projectId} photoIds={selectedSourcePhotoIds} summaries={summaries} initialSequenceId={addToSequenceId} onClose={() => setAddToSequenceOpen(false)} onSummariesChange={setSummaries} onSequenceChanged={setActiveSequenceId} onNotice={setNotice} />}
    {deleteConfirmation && <section ref={deleteSequenceDialogRef} className="delete-sequence-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-sequence-title"><h2 id="delete-sequence-title">{t("table.deleteQuestion", { target: deleteConfirmation.length > 1 ? t("sequence.many") : t("sequence.one") })}</h2><p>{t("table.deleteWarning", { names: deleteConfirmation.map((id) => summaryById.get(id)?.name ?? t("status.missing")).join(", "), count: deleteConfirmation.reduce((count, id) => count + (summaryById.get(id)?.itemCount ?? 0), 0) })}</p><footer><button type="button" autoFocus disabled={deleteBusy} onClick={() => setDeleteConfirmation(undefined)}>{t("common.cancel")}</button><button type="button" className="button-danger" disabled={deleteBusy} onClick={() => void confirmRemoveSelectedPiles(deleteConfirmation)}>{deleteBusy ? t("project.deleting") : t("table.deleteSequence")}</button></footer></section>}
    </TableWorkspace>
    {previewPhotoId && previewPlacement && <TablePhotoPreview photoId={previewPhotoId} filename={previewPlacement.filename} photoSource={dependencies.photoSource} onClose={() => setPreviewPhotoId(undefined)} onError={onPhotoError} />}
    {comparePhotoIds && <TablePhotoCompare ids={comparePhotoIds} draft={draft} photoSource={dependencies.photoSource} onClose={() => setComparePhotoIds(undefined)} />}
    {sequenceOverlay && <SequenceOverlay dependencies={dependencies} persistence={coordinator} projectId={projectId} sequenceId={sequenceOverlay.sequenceId} openVersionId={sequenceOverlay.openVersionId} onClose={() => navigate({ name: "table", projectId })} onPhotoError={onPhotoError} />}
  </main>;
}

function movePhoto(items: readonly PhotoId[], id: PhotoId, to: number) { const rest = items.filter((x) => x !== id), target = items.slice(0, to).filter((x) => x !== id).length; return [...rest.slice(0, target), id, ...rest.slice(target)]; }
