import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import compareIcon from "../assets/icons/table-compare.svg";
import fitIcon from "../assets/icons/table-fit.svg";
import gridIcon from "../assets/icons/table-grid.svg";
import minusIcon from "../assets/icons/table-minus.svg";
import plusIcon from "../assets/icons/table-plus.svg";
import previewIcon from "../assets/icons/table-preview.svg";
import redoIcon from "../assets/icons/table-redo.svg";
import undoIcon from "../assets/icons/table-undo.svg";
import segmentIcon from "../assets/icons/table-segment.svg";
import sequenceIcon from "../assets/icons/table-sequence.svg";
import swapIcon from "../assets/icons/table-swap.svg";
import type { PhotoId, ProjectId, ReadingUnit, ReadingUnitId, SequenceDocument, SequenceEditCommand, SequenceEditor, SequenceId, SequenceItem, SequenceItemId, SequenceSegment, SequenceSegmentId, SequenceSummary, SequenceVersion, VersionId, VersionSummary, WorktableDraft, WorktableSequencePilePlacement } from "../contracts";
import { compareSequences, createSequenceEditor } from "../modules/sequence";
import { compareVersions } from "../modules/versioning";
import { openVersionAsDraft } from "../modules/versioning";
import { createWorktableEditor } from "../modules/worktable";
import type { AppDependencies } from "./dependencies";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { fitSequenceCardFrame } from "./sequenceCardGeometry";
import { useProjectWorkspace } from "./useProjectWorkspace";

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
type DragSource = "stage" | "strip" | "overview";
interface DragState { pointerId: number; source: DragSource; itemIds: readonly SequenceItemId[]; clickedId: SequenceItemId; collapseOnClick: boolean; startX: number; target: number; moved: boolean }
interface SegmentDialog { mode: "create" | "rename"; value: string; segmentId?: SequenceSegmentId }
interface SequenceDialog { value: string }

export function SequencePage({ dependencies, projectId, sequenceId, openVersionId, navigate }: { dependencies: AppDependencies; projectId: ProjectId; sequenceId: SequenceId; openVersionId?: VersionId; navigate: (route: AppRoute) => void }) {
  const [sequence, setSequence] = useState<SequenceDocument>();
  const [selected, setSelected] = useState<Set<SequenceItemId>>(new Set());
  const [anchor, setAnchor] = useState<SequenceItemId>();
  const [zoom, setZoom] = useState(1.25);
  const [overview, setOverview] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [collapsedSegments, setCollapsedSegments] = useState<Set<SequenceSegmentId>>(new Set());
  const [dropTarget, setDropTarget] = useState<number>();
  const [readIndex, setReadIndex] = useState<number>();
  const [segmentDialog, setSegmentDialog] = useState<SegmentDialog>();
  const [notice, setNotice] = useState<string>();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed">("idle");
  const [missing, setMissing] = useState<Set<PhotoId>>(new Set());
  const [availableSequences, setAvailableSequences] = useState<readonly SequenceSummary[]>([]);
  const [selectedCompareSequenceIds, setSelectedCompareSequenceIds] = useState<Set<SequenceId>>(new Set());
  const [sequenceCompareDialog, setSequenceCompareDialog] = useState(false);
  const [newSequenceDialog, setNewSequenceDialog] = useState<SequenceDialog>();
  const editorRef = useRef<SequenceEditor | undefined>(undefined);
  const sequenceRef = useRef<SequenceDocument | undefined>(undefined);
  const revisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveGenerationRef = useRef(0);
  const dragRef = useRef<DragState | undefined>(undefined);
  const workspaceRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLElement>(null);
  const baselineKeyRef = useRef<string | undefined>(undefined);
  const { workspace, workspaceRef: projectWorkspaceRef, setWorkspace, save: saveWorkspace } = useProjectWorkspace(dependencies, projectId);

  const load = useCallback(async () => {
    const result = await dependencies.projectStore.loadSequence(sequenceId);
    if (!result.ok) { setNotice("Sequence could not be loaded."); return; }
    const loaded = result.value;
    sequenceRef.current = loaded;
    revisionRef.current = loaded.revision;
    editorRef.current = createSequenceEditor(toDraft(loaded));
    setSequence(loaded);
    setSelected(new Set());
    setSaveState("idle");
    baselineKeyRef.current = sequenceDraftKey(loaded);
    const sequenceList = await dependencies.projectStore.listSequences(projectId);
    if (sequenceList.ok) setAvailableSequences(sequenceList.value);
    if (openVersionId) {
      const opened = await dependencies.projectStore.loadVersion(openVersionId);
      if (opened.ok) {
        const draft = openVersionAsDraft(opened.value);
        editorRef.current = createSequenceEditor(draft);
        const next = { ...loaded, items: draft.items, segments: draft.segments, readingUnits: draft.readingUnits };
        sequenceRef.current = next; setSequence(next); setNotice(`Opened ${opened.value.name} as Working Draft.`);
      }
    }
  }, [dependencies.projectStore, openVersionId, projectId, sequenceId]);

  useEffect(() => { let live = true; void load().then(() => { if (!live) return; }); return () => { live = false; saveGenerationRef.current += 1; }; }, [load]);
  useEffect(() => {
    if (!workspace || !sequence) return;
    if (workspace.resumeContext?.page === "sequence" && workspace.resumeContext.sequenceId === sequenceId) return;
    void saveWorkspace((current) => ({ ...current, lastOpenedAt: new Date().toISOString(), resumeContext: { page: "sequence", filter: "all", sequenceId } }));
  }, [saveWorkspace, sequence, sequenceId, workspace]);
  useEffect(() => {
    const targets = [stageRef.current, overviewRef.current].filter((value): value is HTMLElement => Boolean(value));
    if (!targets.length) return;
    const onNativeWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      changeZoom(event.deltaY > 0 ? -1 : 1, zoom, setZoom);
    };
    targets.forEach((target) => target.addEventListener("wheel", onNativeWheel, { passive: false }));
    return () => targets.forEach((target) => target.removeEventListener("wheel", onNativeWheel));
  }, [overview, zoom]);

  const persist = useCallback((draft: ReturnType<SequenceEditor["snapshot"]>) => {
    const current = sequenceRef.current;
    if (!current) return;
    const next: SequenceDocument = { ...current, items: draft.items, segments: draft.segments, readingUnits: draft.readingUnits, updatedAt: new Date().toISOString() };
    sequenceRef.current = next;
    setSequence(next);
    setSaveState("saving");
    const generation = saveGenerationRef.current;
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (generation !== saveGenerationRef.current) return;
      const expected = revisionRef.current as SequenceDocument["revision"];
      const result = await dependencies.projectStore.saveSequence({ ...next, revision: expected }, expected);
      if (generation !== saveGenerationRef.current) return;
      if (!result.ok) {
        setSaveState("failed");
        setNotice(result.error.kind === "sequence-conflict" ? "Sequence changed elsewhere. Reloaded the latest draft." : "Draft save failed. Your current edit remains on screen.");
        if (result.error.kind === "sequence-conflict") { saveGenerationRef.current += 1; await load(); }
        return;
      }
      revisionRef.current = result.value.revision;
      if (sequenceRef.current) sequenceRef.current = { ...sequenceRef.current, revision: result.value.revision };
      setSequence((value) => value ? { ...value, revision: result.value.revision } : value);
      setSaveState("idle");
    });
  }, [dependencies.projectStore, load]);

  const commit = useCallback((command: SequenceEditCommand) => {
    const result = editorRef.current?.execute(command);
    if (!result?.ok) { if (result) setNotice(commandErrorMessage(result.error.kind)); return false; }
    persist(result.value);
    setSelected((current) => new Set([...current].filter((id) => result.value.items.some((item) => item.id === id))));
    return true;
  }, [persist]);

  const history = useCallback((direction: "undo" | "redo") => {
    const editor = editorRef.current;
    if (!editor || (direction === "undo" ? !editor.canUndo() : !editor.canRedo())) return;
    persist(direction === "undo" ? editor.undo() : editor.redo());
  }, [persist]);

  const orderedSelection = useMemo(() => sequence?.items.filter((item) => selected.has(item.id)) ?? [], [selected, sequence]);
  const tableSequences = useMemo(() => {
    if (!workspace) return availableSequences;
    const ids = new Set(workspace.worktableDraft.pileOrder);
    return availableSequences.filter((item) => ids.has(item.id));
  }, [availableSequences, workspace]);
  const sequencePickerOptions = useMemo(() => {
    if (!sequence || availableSequences.some((item) => item.id === sequence.id)) return availableSequences;
    const current = { id: sequence.id, projectId, name: sequence.name, itemCount: sequence.items.length, photoCount: sequence.items.filter((item) => item.kind === "photo").length, previewPhotoIds: sequence.items.filter((item): item is Extract<SequenceItem, { kind: "photo" }> => item.kind === "photo").slice(0, 4).map((item) => item.photoId), updatedAt: sequence.updatedAt };
    return [current, ...availableSequences];
  }, [availableSequences, projectId, sequence]);
  const selectItem = useCallback((id: SequenceItemId, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (!sequence) return;
    if (event.shiftKey && anchor) {
      const from = sequence.items.findIndex((item) => item.id === anchor), to = sequence.items.findIndex((item) => item.id === id);
      if (from >= 0 && to >= 0) setSelected(new Set(sequence.items.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.id)));
    } else if (event.ctrlKey || event.metaKey) {
      setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
      setAnchor(id);
    } else { setSelected(new Set([id])); setAnchor(id); }
  }, [anchor, sequence]);

  const beginDrag = useCallback((event: ReactPointerEvent<HTMLElement>, id: SequenceItemId, source: DragSource, forcedIds?: readonly SequenceItemId[]) => {
    if (event.button !== 0 || !sequence) return;
    event.preventDefault(); event.stopPropagation();
    workspaceRef.current?.focus();
    const ids = forcedIds ?? (selected.has(id) ? sequence.items.filter((item) => selected.has(item.id)).map((item) => item.id) : [id]);
    if (forcedIds) { setSelected(new Set(forcedIds)); setAnchor(forcedIds[0]); }
    else if (!selected.has(id)) selectItem(id, event);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, source, itemIds: ids, clickedId: id, collapseOnClick: !forcedIds && selected.has(id) && selected.size > 1 && !event.shiftKey && !event.ctrlKey && !event.metaKey, startX: event.clientX, target: sequence.items.findIndex((item) => item.id === id), moved: false };
  }, [selectItem, selected, sequence]);

  const moveDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId || !sequence) return;
    if (Math.abs(event.clientX - drag.startX) > 4) drag.moved = true;
    const container = drag.source === "stage" ? stageRef.current : drag.source === "strip" ? stripRef.current : overviewRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    if (event.clientX < bounds.left + 48) container.scrollLeft -= 24;
    else if (event.clientX > bounds.right - 48) container.scrollLeft += 24;
    const elements = [...container.querySelectorAll<HTMLElement>("[data-sequence-index]")];
    let target = sequence.items.length;
    if (drag.source === "overview") {
      let nearest: { index: number; distance: number; rect: DOMRect } | undefined;
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
        if (!nearest || distance < nearest.distance) nearest = { index: Number(element.dataset.sequenceIndex), distance, rect };
      }
      if (nearest) target = nearest.index + (event.clientX > nearest.rect.left + nearest.rect.width / 2 ? 1 : 0);
    } else {
      for (const element of elements) { const rect = element.getBoundingClientRect(); if (event.clientX < rect.left + rect.width / 2) { target = Number(element.dataset.sequenceIndex); break; } }
    }
    drag.target = target; setDropTarget(target);
  }, [sequence]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = undefined; setDropTarget(undefined);
    if (drag.moved) commit({ type: "move", itemIds: drag.itemIds, to: drag.target });
    else if (drag.collapseOnClick) { setSelected(new Set([drag.clickedId])); setAnchor(drag.clickedId); }
  }, [commit]);

  const cancelDrag = useCallback(() => { dragRef.current = undefined; setDropTarget(undefined); }, []);
  const readUnitForItem = useCallback((itemId: SequenceItemId) => sequence?.readingUnits.findIndex((unit) => unitItemIds(unit).includes(itemId)) ?? -1, [sequence]);
  const openReadAtItem = useCallback((itemId: SequenceItemId) => { const index = readUnitForItem(itemId); if (index >= 0) setReadIndex(index); }, [readUnitForItem]);
  const centerItem = useCallback((itemId: SequenceItemId) => {
    const centerIn = (container: HTMLElement | null) => {
      if (!container) return;
      const element = [...container.querySelectorAll<HTMLElement>("[data-item-id]")].find((candidate) => candidate.dataset.itemId === itemId);
      if (!element) return;
      const itemRect = element.getBoundingClientRect();
      const viewportRect = container.getBoundingClientRect();
      const delta = itemRect.left + itemRect.width / 2 - (viewportRect.left + viewportRect.width / 2);
      if (Math.abs(delta) > 1) {
        if (typeof container.scrollBy === "function") container.scrollBy({ left: delta, behavior: "smooth" });
        else container.scrollLeft += delta;
      }
    };
    centerIn(stageRef.current);
    centerIn(stripRef.current);
  }, []);

  const openSegmentDialog = useCallback(() => {
    if (!sequence || !orderedSelection.length) return;
    const matching = sequence.segments.find((segment) => segment.itemIds.length === orderedSelection.length && segment.itemIds.every((id) => selected.has(id)));
    if (matching) setSegmentDialog({ mode: "rename", value: matching.name, segmentId: matching.id });
    else setSegmentDialog({ mode: "create", value: nextSegmentName(sequence.segments) });
  }, [orderedSelection, selected, sequence]);

  const submitSegment = useCallback(() => {
    if (!segmentDialog) return;
    const succeeded = segmentDialog.mode === "rename" && segmentDialog.segmentId
      ? commit({ type: "renameSegment", segmentId: segmentDialog.segmentId, name: segmentDialog.value })
      : commit({ type: "createSegment", segment: { id: newId("segment") as SequenceSegmentId, name: segmentDialog.value, itemIds: orderedSelection.map((item) => item.id) } });
    if (succeeded) setSegmentDialog(undefined);
  }, [commit, orderedSelection, segmentDialog]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (isTypingTarget(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "a" && sequence) { event.preventDefault(); setSelected(new Set(sequence.items.map((item) => item.id))); return; }
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); history(event.shiftKey ? "redo" : "undo"); return; }
    if (event.key === "Delete" || event.key === "Backspace") { if (selected.size) { event.preventDefault(); commit({ type: "remove", itemIds: [...selected] }); } return; }
    if (event.key === "Escape") { if (overview) setOverview(false); else if (selected.size) setSelected(new Set()); cancelDrag(); return; }
    if (event.key.toLowerCase() === "o") { event.preventDefault(); setOverview((value) => !value); return; }
    if (event.key.toLowerCase() === "r" && sequence?.readingUnits.length) { event.preventDefault(); setReadIndex(orderedSelection[0] ? readUnitForItem(orderedSelection[0].id) : 0); return; }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(1, zoom, setZoom); return; }
    if (event.key === "-") { event.preventDefault(); changeZoom(-1, zoom, setZoom); return; }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && sequence?.items.length) {
      event.preventDefault(); const current = orderedSelection.at(-1); const index = current ? sequence.items.findIndex((item) => item.id === current.id) : 0; const next = sequence.items[Math.max(0, Math.min(sequence.items.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))]; if (next) { setSelected(new Set([next.id])); setAnchor(next.id); window.setTimeout(() => centerItem(next.id), 0); }
    }
  }, [cancelDrag, centerItem, commit, history, orderedSelection, overview, readUnitForItem, selected.size, sequence, zoom]);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const stage = stageRef.current;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      changeZoom(event.deltaY > 0 ? -1 : 1, zoom, setZoom);
      return;
    }
    if (!stage) return;
    event.preventDefault();
    const distance = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
    if (distance) stage.scrollLeft += distance;
  }, [zoom]);
  const fitSequence = () => { const width = stageRef.current?.clientWidth ?? 1000; const natural = Math.max(1, (sequence?.items.length ?? 1) * 244); setZoom(clampZoom(width / natural)); };
  const togglePin = useCallback((photoId: PhotoId) => { void saveWorkspace((current) => { const previous = current.photoStates[photoId] ?? { decision: "unreviewed" as const, pinned: false }; return { ...current, photoStates: { ...current.photoStates, [photoId]: { ...previous, pinned: !previous.pinned } }, updatedAt: new Date().toISOString() }; }); }, [saveWorkspace]);
  const onPhotoError = useCallback((photoId: PhotoId) => setMissing((current) => new Set(current).add(photoId)), []);

  const sequenceChanged = sequenceDraftKey(sequence) !== baselineKeyRef.current;
  const requestNewSequence = useCallback(() => {
    if (!sequenceChanged || !sequence) return;
    const used = new Set(availableSequences.map((item) => item.name.toLocaleLowerCase()));
    let n = availableSequences.length + 1;
    while (used.has(`sequence ${String(n).padStart(2, "0")}`.toLocaleLowerCase())) n += 1;
    setNewSequenceDialog({ value: `Sequence ${String(n).padStart(2, "0")}` });
  }, [availableSequences, sequence, sequenceChanged]);

  const createNewSequence = useCallback(async () => {
    const current = sequenceRef.current;
    const dialog = newSequenceDialog;
    if (!current || !dialog || !dialog.value.trim()) return;
    const name = dialog.value.trim();
    if (availableSequences.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setNotice("That Sequence name already exists."); return; }
    const draft = editorRef.current?.snapshot();
    if (!draft) return;
    const itemIds = new Map<SequenceItemId, SequenceItemId>();
    const items = draft.items.map((item) => { const id = newId("item") as SequenceItemId; itemIds.set(item.id, id); return item.kind === "photo" ? { id, kind: "photo" as const, photoId: item.photoId } : { id, kind: "blank" as const }; });
    const units = draft.readingUnits.map((unit) => unit.kind === "spread"
      ? { ...unit, id: newId("unit") as ReadingUnitId, leftItemId: itemIds.get(unit.leftItemId)!, rightItemId: itemIds.get(unit.rightItemId)! }
      : { ...unit, id: newId("unit") as ReadingUnitId, itemId: itemIds.get(unit.itemId)! });
    const segments = draft.segments.map((segment) => ({ ...segment, id: newId("segment") as SequenceSegmentId, itemIds: segment.itemIds.map((id) => itemIds.get(id)!).filter(Boolean) }));
    const now = new Date().toISOString();
    const id = newId("sequence") as SequenceId;
    const currentVersionId = newId("version") as VersionId;
    const nextSequence: SequenceDocument = { id, projectId, name, items, segments, readingUnits: units, currentVersionId, revision: 0 as SequenceDocument["revision"], createdAt: now, updatedAt: now };
    const initialVersion: SequenceVersion = { id: currentVersionId, projectId, sequenceId: id, name: `Initial · ${name}`, itemCount: items.length, items, segments, readingUnits: units, createdAt: now };
    await saveQueueRef.current;
    await saveWorkspace((value) => value);
    const latest = projectWorkspaceRef.current;
    if (!latest) { setNotice("Project data is still loading."); return; }
    const worktableEditor = createWorktableEditor(latest.worktableDraft);
    const placement: WorktableSequencePilePlacement = { sequenceId: id, x: 120 + latest.worktableDraft.pileOrder.length * 28, y: 120 + latest.worktableDraft.pileOrder.length * 28, z: maximumWorktableZ(latest.worktableDraft) + 1, width: 211, height: 142 };
    const placed = worktableEditor.execute({ type: "place-sequence-pile", placement });
    if (!placed.ok) { setNotice("Sequence pile could not be created."); return; }
    const result = await dependencies.projectStore.createSequence(projectId, latest.revision, nextSequence, initialVersion, placed.value);
    if (!result.ok) { setNotice(result.error.kind === "sequence-name-exists" ? "That Sequence name already exists." : "Sequence could not be created."); return; }
    const savedWorkspace = { ...latest, worktableDraft: placed.value, sequenceIds: [...latest.sequenceIds, id], versionIds: [...latest.versionIds, currentVersionId], revision: result.value.revision, updatedAt: now };
    projectWorkspaceRef.current = savedWorkspace;
    setWorkspace(savedWorkspace);
    setAvailableSequences((values) => [...values, result.value.summary]);
    setNewSequenceDialog(undefined);
    setNotice(`Created ${name}.`);
    navigate({ name: "sequence", projectId, sequenceId: id });
  }, [availableSequences, dependencies.projectStore, navigate, newSequenceDialog, projectId, projectWorkspaceRef, saveWorkspace, setWorkspace]);

  const openSequenceCompareDialog = useCallback(() => { setSelectedCompareSequenceIds(new Set()); setSequenceCompareDialog(true); }, []);
  const toggleCompareSequence = useCallback((id: SequenceId) => {
    setSelectedCompareSequenceIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else if (next.size < 2) next.add(id); return next; });
  }, []);
  const compareSelectedSequences = useCallback(() => {
    if (selectedCompareSequenceIds.size !== 2) return;
    const [leftSequenceId, rightSequenceId] = [...selectedCompareSequenceIds];
    setSequenceCompareDialog(false);
    navigate({ name: "sequence-compare", projectId, leftSequenceId, rightSequenceId });
  }, [navigate, projectId, selectedCompareSequenceIds]);

  if (!sequence) return <main className="page centered-state">{notice ? <h1>{notice}</h1> : <><div className="loading-mark" /><p>Loading Sequence…</p></>}</main>;
  const context = contextActions(sequence, orderedSelection);
  return <main ref={workspaceRef} className="sequence-workspace page" style={{ "--sequence-order-height": stripCollapsed ? "35px" : "151px", gridTemplateRows: `38px minmax(0, 1fr) ${stripCollapsed ? "35px" : "151px"}` } as React.CSSProperties} tabIndex={-1} onKeyDown={onKeyDown}>
    <header className="sequence-toolbar">
      <label className="sequence-name-picker"><span className="sr-only">Sequence</span><select value={sequence.id} onChange={(event) => navigate({ name: "sequence", projectId, sequenceId: event.target.value as SequenceId })}>{sequencePickerOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <span className={`sequence-save-state is-${saveState}`}>{saveState === "saving" ? "Draft saving…" : saveState === "failed" ? "Save failed" : "Working Draft"}</span>
      <nav>
        <SequenceToolButton icon={undoIcon} label="Undo" disabled={!editorRef.current?.canUndo()} onClick={() => history("undo")} />
        <SequenceToolButton icon={redoIcon} label="Redo" disabled={!editorRef.current?.canRedo()} onClick={() => history("redo")} />
        <SequenceToolButton icon={segmentIcon} label="Segment" disabled={!orderedSelection.length} onClick={openSegmentDialog} />
        <SequenceToolButton icon={previewIcon} label="Read" disabled={!sequence.readingUnits.length} onClick={() => setReadIndex(orderedSelection[0] ? readUnitForItem(orderedSelection[0].id) : 0)} />
        <SequenceToolButton icon={fitIcon} label="Fit Sequence" onClick={fitSequence} />
        <SequenceToolButton icon={sequenceIcon} label="Create New Sequence" disabled={!sequenceChanged || saveState === "saving"} onClick={requestNewSequence} />
        <SequenceToolButton className="sequence-compare-button" icon={compareIcon} label="Compare" disabled={!workspace || tableSequences.length < 2} onClick={openSequenceCompareDialog} />
      </nav>
      <div className="sequence-zoom"><button aria-label="Zoom out" onClick={() => changeZoom(-1, zoom, setZoom)}><img src={minusIcon} alt="" /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => changeZoom(1, zoom, setZoom)}><img src={plusIcon} alt="" /></button></div>
    </header>
    {notice && <div className="sequence-inline-notice"><span>{notice}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
    {overview ? <OverviewGrid overviewElementRef={overviewRef} zoom={zoom} sequence={sequence} selected={selected} dependencies={dependencies} onWheel={onWheel} onOpen={(id) => { setOverview(false); setTimeout(() => document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center" }), 0); }} onPhotoError={onPhotoError} onPointerDown={(event, id) => beginDrag(event, id, "overview")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} /> :
      <section ref={stageRef} className="sequence-rhythm-stage" aria-label="Sequence rhythm editor" onPointerDown={(event) => { if (event.target === event.currentTarget) setSelected(new Set()); }} onWheel={onWheel}>
        <div className="sequence-rhythm-track" style={{ "--sequence-zoom": zoom } as React.CSSProperties}>
          {renderSequenceFlow(sequence, collapsedSegments, (segment) => <SegmentHeader key={`header-${segment.id}`} segment={segment} collapsed={collapsedSegments.has(segment.id)} onToggle={() => setCollapsedSegments((current) => toggleSet(current, segment.id))} onRename={() => setSegmentDialog({ mode: "rename", value: segment.name, segmentId: segment.id })} onUngroup={() => commit({ type: "ungroupSegment", segmentId: segment.id })} onPointerDown={(event) => beginDrag(event, segment.itemIds[0], "stage", segment.itemIds)} />, (item, index) => <SequenceCard key={item.id} item={item} index={index} selected={selected.has(item.id)} dropBefore={dropTarget === index} segment={sequence.segments.find((value) => value.itemIds.includes(item.id))} dependencies={dependencies} missing={item.kind === "photo" && missing.has(item.photoId)} onPointerDown={(event) => beginDrag(event, item.id, "stage")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onDoubleClick={() => openReadAtItem(item.id)} onPhotoError={onPhotoError} />)}
          {dropTarget === sequence.items.length && <span className="sequence-insert-line is-at-end" />}
        </div>
      </section>}
    {!overview && context && <ContextBar context={context} onAction={(action) => {
      if (action === "blank-before" || action === "blank-after") { const index = sequence.items.findIndex((item) => item.id === orderedSelection[0].id) + (action === "blank-after" ? 1 : 0); commit({ type: "addBlank", itemId: newId("blank") as SequenceItemId, unitId: newId("unit") as ReadingUnitId, at: index }); }
      else if (action === "spread") commit({ type: "createSpread", unitId: newId("unit") as ReadingUnitId, itemIds: [orderedSelection[0].id, orderedSelection[1].id] });
      else if (action === "split" && context.unit) commit({ type: "splitSpread", unitId: context.unit.id });
      else if (action === "remove-blank") commit({ type: "removeBlank", itemId: orderedSelection[0].id });
    }} />}
    <section className={`sequence-order${stripCollapsed ? " is-collapsed" : ""}`} aria-label="Sequence Order">
      <header><strong>Sequence Order</strong><button aria-label="Overview Grid" className={overview ? "is-active" : ""} onClick={() => setOverview((value) => !value)}><img src={gridIcon} alt="" /></button><span>{sequence.items.length} items</span><button className="sequence-order-collapse" onClick={() => setStripCollapsed((value) => !value)}>{stripCollapsed ? "↑" : "↓"}</button></header>
      {!stripCollapsed && <div ref={stripRef} className="sequence-order-track">{sequence.items.map((item, index) => <SequenceStripItem key={item.id} item={item} index={index} selected={selected.has(item.id)} dropBefore={dropTarget === index} segment={sequence.segments.find((value) => value.itemIds.includes(item.id))} unit={sequence.readingUnits.find((value) => unitItemIds(value).includes(item.id))} dependencies={dependencies} onPointerDown={(event) => beginDrag(event, item.id, "strip")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onPhotoError={onPhotoError} />)}{dropTarget === sequence.items.length && <span className="sequence-insert-line is-at-end" />}</div>}
    </section>
    {segmentDialog && <Dialog title={segmentDialog.mode === "create" ? "Create Segment" : "Rename Segment"} onClose={() => setSegmentDialog(undefined)}><label><span>Segment name</span><input autoFocus value={segmentDialog.value} onChange={(event) => setSegmentDialog({ ...segmentDialog, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") submitSegment(); if (event.key === "Escape") setSegmentDialog(undefined); }} /></label><footer><button onClick={() => setSegmentDialog(undefined)}>Cancel</button><button className="is-primary" disabled={!segmentDialog.value.trim()} onClick={submitSegment}>{segmentDialog.mode === "create" ? "Create" : "Save"}</button></footer></Dialog>}
    {newSequenceDialog && <Dialog title="Create New Sequence" onClose={() => setNewSequenceDialog(undefined)}><label><span>Sequence name</span><input autoFocus value={newSequenceDialog.value} onChange={(event) => setNewSequenceDialog({ value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void createNewSequence(); if (event.key === "Escape") setNewSequenceDialog(undefined); }} /></label><p className="sequence-dialog-hint">The current order will be copied into a new Sequence pile on Table.</p><footer><button onClick={() => setNewSequenceDialog(undefined)}>Cancel</button><button className="is-primary" disabled={!newSequenceDialog.value.trim()} onClick={() => void createNewSequence()}>Create New Sequence</button></footer></Dialog>}
    {sequenceCompareDialog && <Dialog title="Compare Sequences" onClose={() => setSequenceCompareDialog(false)}><div className="version-dialog-toolbar"><span>Select two Sequences on this Table</span><button className="version-compare-button" disabled={selectedCompareSequenceIds.size !== 2} onClick={compareSelectedSequences}>Compare</button></div><div className="version-list">{tableSequences.length ? tableSequences.map((item) => <div key={item.id} className={selectedCompareSequenceIds.has(item.id) ? "is-version-selected" : ""}><button type="button" className="version-select-row" onClick={() => toggleCompareSequence(item.id)}><span><strong>{item.name}</strong><small>{item.itemCount} items{item.id === sequence.id ? " · Current" : ""}</small></span></button></div>) : <p>No Sequences on this Table yet.</p>}</div><footer><button onClick={() => setSequenceCompareDialog(false)}>Close</button></footer></Dialog>}
    {readIndex !== undefined && <ReadOverlay sequence={sequence} initialIndex={readIndex} dependencies={dependencies} pinned={workspace?.photoStates ?? {}} onTogglePin={togglePin} onClose={() => setReadIndex(undefined)} onPhotoError={onPhotoError} />}
  </main>;
}

function SequenceToolButton({ icon, label, className = "", ...props }: { icon: string; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button className={`sequence-tool-button${className ? ` ${className}` : ""}`} {...props}><img src={icon} alt="" /><span>{label}</span></button>;
}

export function SequenceComparePage({ dependencies, projectId, leftSequenceId, rightSequenceId, navigate }: { dependencies: AppDependencies; projectId: ProjectId; leftSequenceId: SequenceId; rightSequenceId: SequenceId; navigate: (route: AppRoute) => void }) {
  const [left, setLeft] = useState<SequenceDocument>(); const [right, setRight] = useState<SequenceDocument>(); const [availableSequences, setAvailableSequences] = useState<readonly SequenceSummary[]>([]); const [error, setError] = useState<string>();
  useEffect(() => { let live = true; void Promise.all([dependencies.projectStore.loadSequence(leftSequenceId), dependencies.projectStore.loadSequence(rightSequenceId), dependencies.projectStore.listSequences(projectId)]).then(([a, b, all]) => { if (!live) return; if (!a.ok || !b.ok) return setError("Sequences could not be compared."); setLeft(a.value); setRight(b.value); if (all.ok) setAvailableSequences(all.value); }); return () => { live = false; }; }, [dependencies.projectStore, leftSequenceId, projectId, rightSequenceId]);
  const diff = useMemo(() => left && right ? compareSequences(left, right) : undefined, [left, right]);
  if (!left || !right || !diff) return <main className="page centered-state">{error ? <h1>{error}</h1> : <><div className="loading-mark" /><p>Comparing Sequences…</p></>}</main>;
  const leftOnly = new Set(diff.leftOnly), rightOnly = new Set(diff.rightOnly), moved = new Set(diff.shared.filter((item) => item.moved).map((item) => item.photoId));
  const choose = (side: "left" | "right", id: string) => navigate({ name: "sequence-compare", projectId, leftSequenceId: (side === "left" ? id : left.id) as SequenceId, rightSequenceId: (side === "right" ? id : right.id) as SequenceId });
  return <main className="sequence-compare-page page"><header><button onClick={() => navigate({ name: "table", projectId })}>← Table</button><strong>SEQUENCE COMPARE</strong><div className="version-compare-pickers"><label>A <select value={left.id} onChange={(event) => choose("left", event.target.value)}>{availableSequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></label><label>B <select value={right.id} onChange={(event) => choose("right", event.target.value)}>{availableSequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></label></div><div className="version-compare-actions"><CompareToolButton icon={swapIcon} label="Swap Sides" onClick={() => navigate({ name: "sequence-compare", projectId, leftSequenceId: right.id, rightSequenceId: left.id })} /><CompareToolButton icon={previewIcon} label="Read A" onClick={() => navigate({ name: "sequence", projectId, sequenceId: left.id })} /><CompareToolButton icon={previewIcon} label="Read B" onClick={() => navigate({ name: "sequence", projectId, sequenceId: right.id })} /></div><span>Read-only · {diff.leftOnly.length} only A · {diff.rightOnly.length} only B · {moved.size} moved</span></header><div className="sequence-compare-lanes"><SequenceLane label="A" sequence={left} only={leftOnly} moved={moved} dependencies={dependencies} /><SequenceLane label="B" sequence={right} only={rightOnly} moved={moved} dependencies={dependencies} /></div></main>;
}

export function VersionComparePage({ dependencies, projectId, leftVersionId, rightVersionId, navigate }: { dependencies: AppDependencies; projectId: ProjectId; leftVersionId: VersionId; rightVersionId: VersionId; navigate: (route: AppRoute) => void }) {
  const [left, setLeft] = useState<SequenceVersion>();
  const [right, setRight] = useState<SequenceVersion>();
  const [availableVersions, setAvailableVersions] = useState<readonly VersionSummary[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => { let live = true; void Promise.all([dependencies.projectStore.loadVersion(leftVersionId), dependencies.projectStore.loadVersion(rightVersionId), dependencies.projectStore.listVersions(projectId)]).then(([a, b, all]) => { if (!live) return; if (!a.ok || !b.ok) { setError("Versions could not be compared."); return; } setLeft(a.value); setRight(b.value); if (all.ok) setAvailableVersions(all.value); }); return () => { live = false; }; }, [dependencies.projectStore, leftVersionId, projectId, rightVersionId]);
  const diff = useMemo(() => left && right ? compareVersions(left, right) : undefined, [left, right]);
  if (!left || !right || !diff?.ok) return <main className="page centered-state">{error ? <h1>{error}</h1> : <><div className="loading-mark" /><p>Comparing versions…</p></>}</main>;
  const moved = new Set(diff.value.moved.map((item) => item.itemId));
  const added = new Set(diff.value.added), removed = new Set(diff.value.removed);
  const choose = (side: "left" | "right", id: string) => navigate({ name: "version-compare", projectId, leftVersionId: (side === "left" ? id : left.id) as VersionId, rightVersionId: (side === "right" ? id : right.id) as VersionId });
  return <main className="sequence-compare-page page"><header><button onClick={() => navigate({ name: "table", projectId })}>← Table</button><strong>VERSION COMPARE</strong><div className="version-compare-pickers"><label>A <select value={left.id} onChange={(event) => choose("left", event.target.value)}>{availableVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label><label>B <select value={right.id} onChange={(event) => choose("right", event.target.value)}>{availableVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label></div><div className="version-compare-actions"><CompareToolButton icon={swapIcon} label="Swap Sides" onClick={() => navigate({ name: "version-compare", projectId, leftVersionId: right.id, rightVersionId: left.id })} /><CompareToolButton icon={previewIcon} label="Read A" onClick={() => navigate({ name: "sequence", projectId, sequenceId: left.sequenceId, openVersionId: left.id })} /><CompareToolButton icon={previewIcon} label="Read B" onClick={() => navigate({ name: "sequence", projectId, sequenceId: right.sequenceId, openVersionId: right.id })} /></div><span>{diff.value.added.length} added · {diff.value.removed.length} removed · {diff.value.moved.length} moved · {diff.value.readingUnitChanged.length} unit · {diff.value.segmentChanged.length} segment</span></header><div className="sequence-compare-lanes"><VersionLane label="A" version={left} added={new Set()} removed={removed} moved={moved} dependencies={dependencies} /><VersionLane label="B" version={right} added={added} removed={new Set()} moved={moved} dependencies={dependencies} /></div></main>;
}

function CompareToolButton({ icon, label, className = "", ...props }: { icon: string; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button className={`compare-tool-button${className ? ` ${className}` : ""}`} {...props}><img src={icon} alt="" /><span>{label}</span></button>;
}

function VersionLane({ label, version, added, removed, moved, dependencies }: { label: string; version: SequenceVersion; added: ReadonlySet<SequenceItemId>; removed: ReadonlySet<SequenceItemId>; moved: ReadonlySet<SequenceItemId>; dependencies: AppDependencies }) {
  return <section className="sequence-compare-lane"><header><b>{label}</b><strong>{version.name}</strong><span>{version.items.length} items</span></header><div>{version.items.map((item, index) => <article key={item.id} className={added.has(item.id) ? "is-only" : removed.has(item.id) ? "is-only" : moved.has(item.id) ? "is-moved" : "is-shared"}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`${version.name} ${index + 1}`} /> : <div className="sequence-blank-page">BLANK</div>}<span>{index + 1}</span><small>{added.has(item.id) ? "ADDED" : removed.has(item.id) ? "REMOVED" : moved.has(item.id) ? "MOVED" : "UNCHANGED"}</small></article>)}</div></section>;
}

function SequenceLane({ label, sequence, only, moved, dependencies }: { label: string; sequence: SequenceDocument; only: ReadonlySet<PhotoId>; moved: ReadonlySet<PhotoId>; dependencies: AppDependencies }) {
  return <section className="sequence-compare-lane"><header><b>{label}</b><strong>{sequence.name}</strong><span>{sequence.items.length} items</span></header><div>{sequence.items.map((item, index) => <article key={item.id} className={item.kind === "blank" ? "is-blank" : only.has(item.photoId) ? "is-only" : moved.has(item.photoId) ? "is-moved" : "is-shared"}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`${sequence.name} ${index + 1}`} /> : <div className="sequence-blank-page">BLANK</div>}<span>{index + 1}</span><small>{item.kind === "blank" ? "BLANK" : only.has(item.photoId) ? `ONLY ${label}` : moved.has(item.photoId) ? "MOVED" : "SHARED"}</small></article>)}</div></section>;
}

function SequenceCard({ item, index, selected, dropBefore, segment, dependencies, missing, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onDoubleClick, onPhotoError }: { item: SequenceItem; index: number; selected: boolean; dropBefore: boolean; segment?: SequenceSegment; dependencies: AppDependencies; missing: boolean; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void; onDoubleClick: () => void; onPhotoError: (id: PhotoId) => void }) {
  const [frame, setFrame] = useState(() => item.kind === "blank" ? { width: 280, height: 400 } : fitSequenceCardFrame(0, 0));
  useEffect(() => {
    if (item.kind !== "photo") { setFrame({ width: 280, height: 400 }); return; }
    let live = true;
    void dependencies.photoSource.getPhoto(item.photoId).then((result) => {
      if (live && result.ok) setFrame(fitSequenceCardFrame(result.value.width, result.value.height));
    });
    return () => { live = false; };
  }, [dependencies.photoSource, item]);
  const frameStyle = { "--sequence-card-width": `${frame.width}px`, "--sequence-card-height": `${frame.height}px` } as React.CSSProperties;
  return <article style={frameStyle} data-sequence-index={index} data-item-id={item.id} aria-selected={selected} className={`sequence-card${selected ? " is-selected" : ""}${dropBefore ? " is-drop-target" : ""}${segment ? " is-in-segment" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDoubleClick={onDoubleClick}>
    <span className="sequence-card-number">{String(index + 1).padStart(2, "0")}</span>
    {item.kind === "photo" && !missing ? <PhotoThumb resolution="full" eager photoSource={dependencies.photoSource} photoId={item.photoId} alt={`Sequence item ${index + 1}`} onError={onPhotoError} /> : <div className="sequence-missing-card"><b>{item.kind === "blank" ? "BLANK" : "MISSING"}</b></div>}
  </article>;
}

function SequenceStripItem({ item, index, selected, dropBefore, segment, unit, dependencies, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPhotoError }: { item: SequenceItem; index: number; selected: boolean; dropBefore: boolean; segment?: SequenceSegment; unit?: ReadingUnit; dependencies: AppDependencies; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void; onPhotoError: (id: PhotoId) => void }) {
  const [filename, setFilename] = useState(item.kind === "blank" ? "Blank" : "Photo");
  useEffect(() => { if (item.kind !== "photo") return; let live = true; void dependencies.photoSource.getPhoto(item.photoId).then((result) => { if (live && result.ok) setFilename(result.value.relativePath.split(/[\\/]/).at(-1) ?? result.value.relativePath); }); return () => { live = false; }; }, [dependencies.photoSource, item]);
  return <button data-sequence-index={index} data-item-id={item.id} aria-selected={selected} className={`sequence-order-item${selected ? " is-selected" : ""}${dropBefore ? " is-drop-target" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
    <span className="sequence-order-image">{item.kind === "photo" ? <PhotoThumb resolution="sequence" eager photoSource={dependencies.photoSource} photoId={item.photoId} alt="" onError={onPhotoError} /> : <span className="sequence-blank-page">BLANK</span>}<b>{String(index + 1).padStart(2, "0")}</b></span>
    <small>{filename}</small><em>{unit?.kind.toUpperCase()}{segment ? ` · ${segment.name}` : ""}</em>
  </button>;
}

function SegmentHeader({ segment, collapsed, onToggle, onRename, onUngroup, onPointerDown }: { segment: SequenceSegment; collapsed: boolean; onToggle: () => void; onRename: () => void; onUngroup: () => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  return <header className="sequence-segment-header" onPointerDown={onPointerDown}><button onPointerDown={(event) => event.stopPropagation()} onClick={onToggle} aria-expanded={!collapsed}>{collapsed ? "›" : "⌄"}</button><strong onDoubleClick={onRename}>{segment.name}</strong><span>{segment.itemIds.length} items</span><button onPointerDown={(event) => event.stopPropagation()} onClick={onRename}>Rename</button><button onPointerDown={(event) => event.stopPropagation()} onClick={onUngroup}>Ungroup</button></header>;
}

function OverviewGrid({ overviewElementRef, zoom, sequence, selected, dependencies, onWheel, onOpen, onPhotoError, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { overviewElementRef: React.RefObject<HTMLElement | null>; zoom: number; sequence: SequenceDocument; selected: ReadonlySet<SequenceItemId>; dependencies: AppDependencies; onWheel: (event: ReactWheelEvent<HTMLElement>) => void; onOpen: (id: SequenceItemId) => void; onPhotoError: (id: PhotoId) => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: SequenceItemId) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void }) {
  return <section ref={overviewElementRef} className="sequence-overview" style={{ "--overview-zoom": zoom } as React.CSSProperties} role="grid" aria-label="Sequence Overview" onWheel={onWheel} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}><header><strong>Overview Grid</strong><span>Select, drag to reorder, or double-click to read.</span></header><div>{sequence.items.map((item, index) => <button data-sequence-index={index} data-item-id={item.id} role="gridcell" aria-selected={selected.has(item.id)} key={item.id} className={selected.has(item.id) ? "is-selected" : ""} onPointerDown={(event) => onPointerDown(event, item.id)} onDoubleClick={() => onOpen(item.id)}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`Item ${index + 1}`} onError={onPhotoError} /> : <span className="sequence-blank-page">BLANK</span>}<b>{String(index + 1).padStart(2, "0")}</b></button>)}</div></section>;
}

function ContextBar({ context, onAction }: { context: Context; onAction: (action: ContextAction) => void }) {
  return <div className="sequence-context-bar">{context.actions.map((action) => <button key={action} onClick={() => onAction(action)}>{contextLabel(action)}</button>)}</div>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="sequence-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sequence-dialog" role="dialog" aria-modal="true" aria-label={title}><header><strong>{title}</strong><button onClick={onClose}>×</button></header>{children}</section></div>; }

function ReadOverlay({ sequence, initialIndex, dependencies, pinned, onTogglePin, onClose, onPhotoError }: { sequence: SequenceDocument; initialIndex: number; dependencies: AppDependencies; pinned: Readonly<Partial<Record<PhotoId, { decision: string; pinned: boolean }>>>; onTogglePin: (id: PhotoId) => void; onClose: () => void; onPhotoError: (id: PhotoId) => void }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(sequence.readingUnits.length - 1, initialIndex)));
  const [background, setBackground] = useState<"dark" | "light">("dark");
  const [controls, setControls] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const reveal = useCallback(() => { setControls(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setControls(false), 2000); }, []);
  useEffect(() => { reveal(); return () => window.clearTimeout(timer.current); }, [reveal]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { reveal(); if (event.key === "Escape") onClose(); else if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1)); else if (event.key === "ArrowRight") setIndex((value) => Math.min(sequence.readingUnits.length - 1, value + 1)); else if (event.key === "Home") setIndex(0); else if (event.key === "End") setIndex(sequence.readingUnits.length - 1); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose, reveal, sequence.readingUnits.length]);
  const unit = sequence.readingUnits[index];
  const itemMap = new Map(sequence.items.map((item) => [item.id, item]));
  const items = unitItemIds(unit).map((id) => itemMap.get(id)).filter((item): item is SequenceItem => Boolean(item));
  return <section className={`sequence-read is-${background}${controls ? " has-controls" : ""}`} onMouseMove={reveal}>
    <div className="sequence-read-pages">{items.map((item) => <article key={item.id} className="sequence-read-page">{item.kind === "photo" ? <PhotoThumb resolution="full" eager photoSource={dependencies.photoSource} photoId={item.photoId} alt="Sequence reading photograph" onError={onPhotoError} /> : null}{controls && item.kind === "photo" && <button className="sequence-read-pin" onClick={() => onTogglePin(item.photoId)}>{pinned[item.photoId]?.pinned ? "Unpin" : "Pin"}</button>}</article>)}</div>
    <button className="sequence-read-zone is-left" disabled={index === 0} aria-label="Previous Reading Unit" onClick={() => setIndex((value) => Math.max(0, value - 1))} />
    <button className="sequence-read-zone is-right" disabled={index === sequence.readingUnits.length - 1} aria-label="Next Reading Unit" onClick={() => setIndex((value) => Math.min(sequence.readingUnits.length - 1, value + 1))} />
    <header><button onClick={onClose}>Close</button><strong>{sequence.name}</strong><button onClick={() => setBackground((value) => value === "dark" ? "light" : "dark")}>{background === "dark" ? "White background" : "Dark background"}</button></header>
    <footer>{pageLabel(sequence, unit)} · {index + 1} / {sequence.readingUnits.length}</footer>
  </section>;
}

type ContextAction = "blank-before" | "blank-after" | "spread" | "split" | "remove-blank";
interface Context { actions: readonly ContextAction[]; unit?: ReadingUnit }
function contextActions(sequence: SequenceDocument, items: readonly SequenceItem[]): Context | undefined {
  if (items.length === 1 && items[0].kind === "blank") return { actions: ["remove-blank"], unit: sequence.readingUnits.find((unit) => unitItemIds(unit).includes(items[0].id)) };
  if (items.length === 1 && items[0].kind === "photo") { const unit = sequence.readingUnits.find((value) => unitItemIds(value).includes(items[0].id)); return { unit, actions: unit?.kind === "spread" ? ["split", "blank-before", "blank-after"] : ["blank-before", "blank-after"] }; }
  if (items.length === 2 && items.every((item) => item.kind === "photo")) { const indices = items.map((item) => sequence.items.findIndex((value) => value.id === item.id)).sort((a, b) => a - b); if (indices[1] === indices[0] + 1) return { actions: ["spread"] }; }
  return undefined;
}
function contextLabel(action: ContextAction): string { return ({ "blank-before": "Insert Blank Before", "blank-after": "Insert Blank After", spread: "Create Spread", split: "Split to Singles", "remove-blank": "Remove Blank" })[action]; }
function renderSequenceFlow(sequence: SequenceDocument, collapsed: ReadonlySet<SequenceSegmentId>, renderHeader: (segment: SequenceSegment) => ReactNode, renderItem: (item: SequenceItem, index: number) => ReactNode): ReactNode[] {
  const byStart = new Map(sequence.segments.map((segment) => [segment.itemIds[0], segment])); const nodes: ReactNode[] = [];
  for (let index = 0; index < sequence.items.length;) { const item = sequence.items[index]; const segment = byStart.get(item.id); if (!segment) { nodes.push(renderItem(item, index)); index += 1; continue; } nodes.push(<section key={segment.id} className={`sequence-segment${collapsed.has(segment.id) ? " is-collapsed" : ""}`}>{renderHeader(segment)}{!collapsed.has(segment.id) && <div>{segment.itemIds.map((id) => { const itemIndex = sequence.items.findIndex((value) => value.id === id); return renderItem(sequence.items[itemIndex], itemIndex); })}</div>}</section>); index += segment.itemIds.length; }
  return nodes;
}
function unitItemIds(unit: ReadingUnit): readonly SequenceItemId[] { return unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId]; }
function toDraft(sequence: SequenceDocument) { return { projectId: sequence.projectId, baseVersionId: sequence.currentVersionId, items: sequence.items, segments: sequence.segments, readingUnits: sequence.readingUnits }; }
function nextSegmentName(segments: readonly SequenceSegment[]): string { let n = segments.length + 1; const used = new Set(segments.map((segment) => segment.name.toLocaleLowerCase())); while (used.has(`segment ${String(n).padStart(2, "0")}`)) n += 1; return `Segment ${String(n).padStart(2, "0")}`; }
function pageLabel(sequence: SequenceDocument, unit: ReadingUnit): string { const indices = unitItemIds(unit).map((id) => sequence.items.findIndex((item) => item.id === id) + 1); return indices.length === 2 ? `${String(indices[0]).padStart(2, "0")}–${String(indices[1]).padStart(2, "0")} / ${sequence.items.length}` : `${String(indices[0]).padStart(2, "0")} / ${sequence.items.length}`; }
function toggleSet<T>(current: ReadonlySet<T>, value: T): Set<T> { const next = new Set(current); next.has(value) ? next.delete(value) : next.add(value); return next; }
function changeZoom(direction: -1 | 1, current: number, set: (value: number) => void) { const index = ZOOM_LEVELS.reduce((best, value, currentIndex) => Math.abs(value - current) < Math.abs(ZOOM_LEVELS[best] - current) ? currentIndex : best, 0); set(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index + direction))]); }
function clampZoom(value: number): number { return Math.max(0.25, Math.min(2, value)); }
function isTypingTarget(target: EventTarget | null): boolean { return target instanceof HTMLElement && (target.matches("input, textarea, [contenteditable=true]") || Boolean(target.closest("input, textarea, [contenteditable=true]"))); }
function commandErrorMessage(kind: string): string { if (kind === "invalid-segment") return "Select a continuous range of complete Reading Units."; if (kind === "invalid-reading-unit") return "That Reading Unit cannot be created from the current selection."; if (kind === "sequence-limit-exceeded") return "This Sequence has reached the MVP item limit."; return "This Sequence operation could not be completed."; }
function sequenceDraftKey(sequence: SequenceDocument | undefined): string { return sequence ? JSON.stringify({ items: sequence.items, segments: sequence.segments, readingUnits: sequence.readingUnits }) : ""; }
function maximumWorktableZ(draft: WorktableDraft): number { return Math.max(-1, ...Object.values(draft.placements).map((item) => item.z), ...Object.values(draft.pilePlacements).map((item) => item.z)); }
function newId(prefix: string): string { return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
