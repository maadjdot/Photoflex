import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import addToGroupIcon from "../assets/icons/table-add-to-group.svg";
import addToSequenceIcon from "../assets/icons/table-add-to-sequence.svg";
import alignIcon from "../assets/icons/table-align.svg";
import chevronDownIcon from "../assets/icons/table-chevron-down.svg";
import compareIcon from "../assets/icons/table-compare.svg";
import fitIcon from "../assets/icons/table-fit.svg";
import frontIcon from "../assets/icons/table-front.svg";
import gridIcon from "../assets/icons/table-grid.svg";
import groupIcon from "../assets/icons/table-group.svg";
import leaveGroupIcon from "../assets/icons/table-leave-group.svg";
import linkIcon from "../assets/icons/table-link.svg";
import minusIcon from "../assets/icons/table-minus.svg";
import plusIcon from "../assets/icons/table-plus.svg";
import previewIcon from "../assets/icons/table-preview.svg";
import redoIcon from "../assets/icons/table-redo.svg";
import removeIcon from "../assets/icons/table-remove.svg";
import rowIcon from "../assets/icons/table-row.svg";
import sequenceIcon from "../assets/icons/table-sequence.svg";
import undoIcon from "../assets/icons/table-undo.svg";
import type { DerivedPreviewMaxEdge, PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, SequenceRevision, SequenceSummary, SequenceVersion, SequenceWriteError, SourceError, VersionId, WorktableAlignment, WorktableDraft, WorktableEditCommand, WorktableEditor, WorktablePoint, WorktableViewport } from "../contracts";
import { isPhotoSequenceItem } from "../contracts";
import { calculateSequenceStripVirtualRange, createSequenceEditor } from "../modules/sequence";
import { clampWorktableZoom, createWorktableEditor, screenToWorld, visibleWorktablePhotoIds, zoomAroundScreenPoint } from "../modules/worktable";
import type { AppDependencies } from "./dependencies";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { useProjectWorkspace, workspaceSaveErrorMessage } from "./useProjectWorkspace";

const DEFAULT_VIEWPORT: WorktableViewport = { originX: 48, originY: 38, zoom: 1 };
const PILE_WIDTH = 211;
const PILE_HEIGHT = 142;
const TABLE_IMAGE_RETENTION_MS = 20_000;
const TABLE_RETAINED_IMAGE_LIMIT = 72;
type Gesture =
  | { kind: "photo"; pointerId: number; start: WorktablePoint; ids: readonly PhotoId[] }
  | { kind: "pile"; pointerId: number; start: WorktablePoint; ids: readonly SequenceId[] }
  | { kind: "pan"; pointerId: number; start: WorktablePoint; viewport: WorktableViewport }
  | { kind: "marquee"; pointerId: number; start: WorktablePoint; additive: boolean }
  | { kind: "resize"; pointerId: number; start: WorktablePoint; photoId: PhotoId; width: number }
  | { kind: "resize-pile"; pointerId: number; start: WorktablePoint; sequenceId: SequenceId; width: number };
interface Marquee { left: number; top: number; width: number; height: number }
interface SequenceConfirmation { name: string; photoIds: readonly PhotoId[] }

export function TablePage({ dependencies, projectId, navigate }: { dependencies: AppDependencies; projectId: ProjectId; navigate: (route: AppRoute) => void }) {
  const { workspace, workspaceRef, setWorkspace, save, saveWorktable, deleteSequences, loading, error } = useProjectWorkspace(dependencies, projectId);
  const [draft, setDraft] = useState<WorktableDraft>();
  const [summaries, setSummaries] = useState<readonly SequenceSummary[]>([]);
  const [activeSequence, setActiveSequence] = useState<SequenceDocument>();
  const [selected, setSelected] = useState<Set<PhotoId>>(new Set());
  const [selectedPiles, setSelectedPiles] = useState<Set<SequenceId>>(new Set());
  const [viewport, setViewportState] = useState(DEFAULT_VIEWPORT);
  const [dragDelta, setDragDelta] = useState<WorktablePoint>({ x: 0, y: 0 });
  const [resizeScale, setResizeScale] = useState(1);
  const [pileResizeScale, setPileResizeScale] = useState(1);
  const [marquee, setMarquee] = useState<Marquee>();
  const [missing, setMissing] = useState<Set<PhotoId>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [previewPhotoId, setPreviewPhotoId] = useState<PhotoId>();
  const [comparePhotoIds, setComparePhotoIds] = useState<readonly [PhotoId, PhotoId]>();
  const [confirmation, setConfirmation] = useState<SequenceConfirmation>();
  const [addToSequenceOpen, setAddToSequenceOpen] = useState(false);
  const [addToSequenceId, setAddToSequenceId] = useState<SequenceId>();
  const [confirmationDragId, setConfirmationDragId] = useState<PhotoId>();
  const [sequenceCollapsed, setSequenceCollapsed] = useState(false);
  const [sequenceDragId, setSequenceDragId] = useState<SequenceItemId>();
  const [alignment, setAlignment] = useState<WorktableAlignment | "">("");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [stripSize, setStripSize] = useState({ width: 0, scrollLeft: 0 });
  const [retainedPhotoIds, setRetainedPhotoIds] = useState<ReadonlySet<PhotoId>>(new Set());
  const stageRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<WorktableEditor | undefined>(undefined);
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const deltaRef = useRef<WorktablePoint>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const viewportRef = useRef(viewport);
  const initializedRef = useRef<ProjectId | undefined>(undefined);
  const stripRefs = useRef(new Map<SequenceItemId, HTMLButtonElement>());
  const stripPositions = useRef(new Map<SequenceItemId, { left: number; top: number }>());
  const stripViewportRef = useRef<HTMLDivElement>(null);
  const dragFrameRef = useRef<number | undefined>(undefined);
  const pendingDragDeltaRef = useRef<WorktablePoint>({ x: 0, y: 0 });
  const sequenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeSequenceRef = useRef<SequenceDocument | undefined>(undefined);
  const photoRetentionRef = useRef(new Map<PhotoId, number>());
  const photoRetentionTimerRef = useRef<number | undefined>(undefined);
  viewportRef.current = viewport;
  activeSequenceRef.current = activeSequence;

  const visiblePhotoIds = useMemo(() => draft ? visibleWorktablePhotoIds(draft, viewport, stageSize) : new Set<PhotoId>(), [draft, stageSize, viewport]);
  const mountedPhotoIds = useMemo(() => new Set<PhotoId>([...retainedPhotoIds, ...visiblePhotoIds]), [retainedPhotoIds, visiblePhotoIds]);
  const stripRange = useMemo(() => calculateSequenceStripVirtualRange({ itemCount: activeSequence?.items.length ?? 0, viewportWidth: stripSize.width, scrollLeft: stripSize.scrollLeft }), [activeSequence?.items.length, stripSize]);

  useEffect(() => {
    const retention = photoRetentionRef.current;
    const now = Date.now();
    visiblePhotoIds.forEach((id) => retention.set(id, now));
    if (photoRetentionTimerRef.current !== undefined) window.clearTimeout(photoRetentionTimerRef.current);
    const prune = () => {
      const cutoff = Date.now() - TABLE_IMAGE_RETENTION_MS;
      const valid = [...retention.entries()]
        .filter(([id, lastSeen]) => Boolean(draft?.placements[id]) && (visiblePhotoIds.has(id) || lastSeen >= cutoff))
        .sort((left, right) => right[1] - left[1]);
      const visible = valid.filter(([id]) => visiblePhotoIds.has(id));
      const nearby = valid.filter(([id]) => !visiblePhotoIds.has(id)).slice(0, Math.max(0, TABLE_RETAINED_IMAGE_LIMIT - visible.length));
      const next = new Set([...visible, ...nearby].map(([id]) => id));
      retention.forEach((_lastSeen, id) => { if (!next.has(id) && !visiblePhotoIds.has(id)) retention.delete(id); });
      setRetainedPhotoIds((current) => setsEqual(current, next) ? current : next);
      const nextExpiry = valid.filter(([id, lastSeen]) => !visiblePhotoIds.has(id) && lastSeen >= cutoff).sort((left, right) => left[1] - right[1])[0];
      if (nextExpiry) photoRetentionTimerRef.current = window.setTimeout(prune, Math.max(250, nextExpiry[1] + TABLE_IMAGE_RETENTION_MS - Date.now() + 25));
    };
    prune();
    return () => {
      if (photoRetentionTimerRef.current !== undefined) window.clearTimeout(photoRetentionTimerRef.current);
      photoRetentionTimerRef.current = undefined;
    };
  }, [draft?.placements, visiblePhotoIds]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({ width: stage.clientWidth || rect.width, height: stage.clientHeight || rect.height });
    };
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(stage);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [draft?.projectId]);

  useEffect(() => () => {
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
  }, []);

  useLayoutEffect(() => {
    const next = new Map<SequenceItemId, { left: number; top: number }>();
    stripRefs.current.forEach((element, id) => {
      const rect = element.getBoundingClientRect();
      const old = stripPositions.current.get(id);
      if (old && typeof element.animate === "function") element.animate([{ transform: `translate3d(${old.left - rect.left}px,${old.top - rect.top}px,0)` }, { transform: "translate3d(0,0,0)" }], { duration: 220, easing: "cubic-bezier(.2,.75,.25,1)" });
      next.set(id, { left: rect.left, top: rect.top });
    });
    stripPositions.current = next;
  }, [activeSequence?.items]);

  useLayoutEffect(() => {
    const element = stripViewportRef.current;
    if (!element) return;
    const measure = () => setStripSize({ width: element.clientWidth || element.getBoundingClientRect().width, scrollLeft: element.scrollLeft });
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeSequence?.id, sequenceCollapsed]);

  const setViewport = useCallback((next: WorktableViewport) => { viewportRef.current = next; setViewportState(next); }, []);
  useEffect(() => {
    if (!workspace || initializedRef.current === projectId) return;
    initializedRef.current = projectId;
    const editor = createWorktableEditor(workspace.worktableDraft);
    editorRef.current = editor;
    setDraft(editor.snapshot());
    const restored = workspace.resumeContext?.page === "table" ? workspace.resumeContext.tableViewport : undefined;
    setViewport(restored ?? DEFAULT_VIEWPORT);
    void dependencies.projectStore.listSequences(projectId).then((result) => result.ok ? setSummaries(result.value) : setNotice("Sequences could not be loaded."));
    void save((current) => ({ ...current, lastOpenedAt: new Date().toISOString(), resumeContext: { page: "table", filter: "all", tableViewport: restored ?? DEFAULT_VIEWPORT, sequenceId: current.resumeContext?.sequenceId } })).then((result) => {
      if (!result.ok) setNotice(workspaceSaveErrorMessage(result.error));
    });
  }, [dependencies.projectStore, projectId, save, setViewport, workspace]);
  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => void save((current) => ({ ...current, resumeContext: { page: "table", filter: "all", tableViewport: viewportRef.current, sequenceId: current.resumeContext?.sequenceId } })), 500);
    return () => window.clearTimeout(timer);
  }, [draft?.projectId, save, viewport]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const id = selectedPiles.size === 1 ? [...selectedPiles][0] : undefined;
    if (!id) { setActiveSequence(undefined); return; }
    let live = true;
    void dependencies.projectStore.loadSequence(id).then((result) => live && setActiveSequence(result.ok ? result.value : undefined));
    return () => { live = false; };
  }, [dependencies.projectStore, selectedPiles]);

  const persist = useCallback(async (next: WorktableDraft) => {
    const result = await saveWorktable(next);
    if (!result.ok) setNotice(workspaceSaveErrorMessage(result.error));
  }, [saveWorktable]);
  const execute = useCallback((command: WorktableEditCommand) => {
    const result = editorRef.current?.execute(command);
    if (!result?.ok) { if (result) setNotice("This Table operation could not be completed."); return; }
    setDraft(result.value); void persist(result.value);
  }, [persist]);
  const history = useCallback((direction: "undo" | "redo") => {
    const editor = editorRef.current;
    if (!editor || (direction === "undo" ? !editor.canUndo() : !editor.canRedo())) return;
    const next = direction === "undo" ? editor.undo() : editor.redo();
    setDraft(next);
    setSelected((current) => new Set([...current].filter((id) => next.placements[id])));
    setSelectedPiles((current) => new Set([...current].filter((id) => next.pilePlacements[id])));
    void persist(next);
  }, [persist]);

  const photoIds = useMemo(() => draft?.entryOrder.filter((id) => selected.has(id)) ?? [], [draft, selected]);
  const pileIds = useMemo(() => draft?.pileOrder.filter((id) => selectedPiles.has(id)) ?? [], [draft, selectedPiles]);
  const onPhotoError = useCallback((id: PhotoId, sourceError: SourceError) => {
    if (sourceError.kind === "photo-not-found" || sourceError.kind === "preview-unavailable") setMissing((current) => new Set([...current, id]));
  }, []);

  const requestSequence = (ids: readonly PhotoId[]) => {
    const ordered = draft?.entryOrder.filter((id) => ids.includes(id)) ?? [];
    if (!ordered.length) return;
    const used = new Set(summaries.map((item) => item.name.toLocaleLowerCase()));
    let n = summaries.length + 1;
    while (used.has(`sequence ${String(n).padStart(2, "0")}`)) n++;
    setConfirmation({ name: `Sequence ${String(n).padStart(2, "0")}`, photoIds: ordered });
  };
  const createPile = async () => {
    if (!confirmation || !draft || !workspaceRef.current) return;
    const name = confirmation.name.trim();
    if (!name) { setNotice("Give the Sequence a name."); return; }
    const id = newId("sequence") as SequenceId;
    const now = new Date().toISOString();
    const items = confirmation.photoIds.map((photoId) => ({ id: newId("item") as SequenceItemId, kind: "photo" as const, photoId }));
    const currentVersionId = newId("version") as VersionId;
    const sequence: SequenceDocument = { id, projectId, name, items, segments: [], readingUnits: items.map((item) => ({ id: newId("unit") as ReadingUnitId, kind: "single", itemId: item.id })), currentVersionId, revision: 0 as SequenceRevision, createdAt: now, updatedAt: now };
    const initialVersion: SequenceVersion = { id: currentVersionId, projectId, sequenceId: id, name: `Initial · ${name}`, itemCount: items.length, items, segments: [], readingUnits: sequence.readingUnits, createdAt: now };
    const rect = stageRef.current?.getBoundingClientRect();
    const center = rect ? screenToWorld({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, viewportRef.current) : { x: 200, y: 160 };
    const editor = createWorktableEditor(draft);
    const placed = editor.execute({ type: "place-sequence-pile", placement: { sequenceId: id, x: center.x - PILE_WIDTH / 2, y: center.y - PILE_HEIGHT / 2, z: maximumZ(draft) + 1, width: PILE_WIDTH, height: PILE_HEIGHT } });
    if (!placed.ok) return;
    // Drain queued viewport/worktable CAS writes before the atomic sequence
    // creation so the project revision used below is current.
    const drained = await save((current) => current);
    if (!drained.ok) {
      setNotice(workspaceSaveErrorMessage(drained.error));
      return;
    }
    const current = workspaceRef.current;
    if (!current) return;
    const result = await dependencies.projectStore.createSequence(projectId, current.revision, sequence, initialVersion, placed.value);
    if (!result.ok) { setNotice(result.error.kind === "sequence-name-exists" ? "That Sequence name already exists." : "Sequence could not be created."); return; }
    const next = { ...current, worktableDraft: placed.value, sequenceIds: [...current.sequenceIds, id], versionIds: [...current.versionIds, currentVersionId], revision: result.value.revision, updatedAt: now };
    workspaceRef.current = next; setWorkspace(next); editorRef.current = editor; setDraft(placed.value);
    setSummaries((items) => [...items, result.value.summary]); setSelected(new Set()); setSelectedPiles(new Set([id])); setActiveSequence(sequence); setConfirmation(undefined); setNotice(`Created ${name}.`);
  };
  const reorderSequence = async (itemId: SequenceItemId, to: number) => {
    const targetId = activeSequenceRef.current?.id;
    if (!targetId) return;
    const run = async () => {
      const loaded = await dependencies.projectStore.loadSequence(targetId);
      if (!loaded.ok) { setNotice("Sequence could not be loaded."); return; }
      const current = loaded.value;
      const editor = createSequenceEditor({ projectId, baseVersionId: current.currentVersionId, items: current.items, segments: current.segments, readingUnits: current.readingUnits });
      const moved = editor.execute({ type: "move", itemIds: [itemId], to });
      if (!moved.ok) return;
      const next = { ...current, items: moved.value.items, segments: moved.value.segments, readingUnits: moved.value.readingUnits, updatedAt: new Date().toISOString() };
      const result = await dependencies.projectStore.saveSequence(next, current.revision);
      if (!result.ok) { setNotice(sequenceSaveErrorMessage(result.error.kind)); return; }
      const saved = { ...next, revision: result.value.revision };
      if (activeSequenceRef.current?.id === targetId) { activeSequenceRef.current = saved; setActiveSequence(saved); }
      setSummaries((items) => items.map((item) => item.id === saved.id ? result.value.summary : item));
    };
    sequenceQueueRef.current = sequenceQueueRef.current.then(run, run).catch(() => { setNotice("Sequence 当前无法保存，请稍后重试。"); });
    await sequenceQueueRef.current;
  };
  const addPhotosToSequence = async () => {
    if (!addToSequenceId || !photoIds.length) return;
    const targetId = addToSequenceId;
    const photoIdsToAdd = [...photoIds];
    const run = async () => {
      const loaded = await dependencies.projectStore.loadSequence(targetId);
      if (!loaded.ok) { setNotice("Sequence could not be loaded."); return; }
      const additions = photoIdsToAdd.map((photoId) => ({ id: newId("item") as SequenceItemId, kind: "photo" as const, photoId }));
      const editor = createSequenceEditor({ projectId, baseVersionId: loaded.value.currentVersionId, items: loaded.value.items, segments: loaded.value.segments, readingUnits: loaded.value.readingUnits });
      const added = editor.execute({ type: "add", items: additions });
      if (!added.ok) { setNotice("Photos could not be added to Sequence."); return; }
      const next = { ...loaded.value, items: added.value.items, segments: added.value.segments, readingUnits: added.value.readingUnits, updatedAt: new Date().toISOString() };
      const result = await dependencies.projectStore.saveSequence(next, loaded.value.revision);
      if (!result.ok) { setNotice(sequenceSaveErrorMessage(result.error.kind)); return; }
      const saved = { ...next, revision: result.value.revision };
      activeSequenceRef.current = activeSequenceRef.current?.id === saved.id ? saved : activeSequenceRef.current;
      if (activeSequenceRef.current?.id === saved.id) setActiveSequence(saved);
      setSummaries((items) => items.map((item) => item.id === saved.id ? result.value.summary : item));
      setAddToSequenceOpen(false); setNotice(`Added ${additions.length} photo${additions.length === 1 ? "" : "s"} to ${saved.name}.`);
    };
    sequenceQueueRef.current = sequenceQueueRef.current.then(run, run).catch(() => { setNotice("Sequence 当前无法保存，请稍后重试。"); });
    await sequenceQueueRef.current;
  };

  const startPan = (event: ReactPointerEvent<HTMLElement>) => {
    const stage = stageRef.current; if (!stage) return;
    stage.focus(); stage.setPointerCapture(event.pointerId);
    gestureRef.current = { kind: "pan", pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, viewport: viewportRef.current };
  };
  const beginDrag = (event: ReactPointerEvent<HTMLElement>, gesture: Gesture) => {
    const stage = stageRef.current; if (!stage) return;
    stage.focus(); stage.setPointerCapture(event.pointerId); gestureRef.current = gesture; deltaRef.current = { x: 0, y: 0 }; setDragDelta({ x: 0, y: 0 });
  };
  const onPhotoDown = (event: ReactPointerEvent<HTMLElement>, id: PhotoId) => {
    event.preventDefault(); event.stopPropagation(); if (event.button === 2) return startPan(event); if (event.button !== 0 || !stageRef.current) return;
    const toggle = event.shiftKey || event.ctrlKey || event.metaKey; let ids: readonly PhotoId[];
    if (toggle) { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); setSelectedPiles(new Set()); if (!next.has(id)) return; ids = [...next]; }
    else if (selected.has(id)) ids = [...selected]; else { setSelected(new Set([id])); setSelectedPiles(new Set()); ids = [id]; }
    beginDrag(event, { kind: "photo", pointerId: event.pointerId, start: screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current.getBoundingClientRect(), viewportRef.current), ids });
  };
  const onPileDown = (event: ReactPointerEvent<HTMLElement>, id: SequenceId) => {
    event.preventDefault(); event.stopPropagation(); if (event.button === 2) return startPan(event); if (event.button !== 0 || !stageRef.current) return;
    const toggle = event.shiftKey || event.ctrlKey || event.metaKey; let ids: readonly SequenceId[];
    if (toggle) { const next = new Set(selectedPiles); next.has(id) ? next.delete(id) : next.add(id); setSelectedPiles(next); setSelected(new Set()); if (!next.has(id)) return; ids = [...next]; }
    else if (selectedPiles.has(id)) ids = [...selectedPiles]; else { setSelectedPiles(new Set([id])); setSelected(new Set()); ids = [id]; }
    beginDrag(event, { kind: "pile", pointerId: event.pointerId, start: screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current.getBoundingClientRect(), viewportRef.current), ids });
  };
  const onResizeDown = (event: ReactPointerEvent<HTMLButtonElement>, id: PhotoId) => {
    const stage = stageRef.current, item = draft?.placements[id]; if (event.button !== 0 || !stage || !item) return;
    event.preventDefault(); event.stopPropagation(); stage.setPointerCapture(event.pointerId);
    gestureRef.current = { kind: "resize", pointerId: event.pointerId, start: screenToWorld({ x: event.clientX, y: event.clientY }, stage.getBoundingClientRect(), viewportRef.current), photoId: id, width: item.width }; scaleRef.current = 1;
  };
  const onPileResizeDown = (event: ReactPointerEvent<HTMLButtonElement>, id: SequenceId) => {
    const stage = stageRef.current, pile = draft?.pilePlacements[id]; if (event.button !== 0 || !stage || !pile) return;
    event.preventDefault(); event.stopPropagation(); stage.setPointerCapture(event.pointerId);
    gestureRef.current = { kind: "resize-pile", pointerId: event.pointerId, start: screenToWorld({ x: event.clientX, y: event.clientY }, stage.getBoundingClientRect(), viewportRef.current), sequenceId: id, width: pile.width }; scaleRef.current = 1; setPileResizeScale(1);
  };
  const onStageDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !stageRef.current) return; if (event.button === 2) return startPan(event); if (event.button !== 0) return;
    stageRef.current.focus(); stageRef.current.setPointerCapture(event.pointerId); const rect = stageRef.current.getBoundingClientRect(); const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    gestureRef.current = { kind: "marquee", pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, additive }; setMarquee({ left: event.clientX - rect.left, top: event.clientY - rect.top, width: 0, height: 0 });
    if (!additive) { setSelected(new Set()); setSelectedPiles(new Set()); }
  };
  const onStageMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current, stage = stageRef.current; if (!gesture || gesture.pointerId !== event.pointerId || !stage) return; const rect = stage.getBoundingClientRect();
    if (gesture.kind === "pan") { setViewport({ ...gesture.viewport, originX: gesture.viewport.originX + event.clientX - gesture.start.x, originY: gesture.viewport.originY + event.clientY - gesture.start.y }); return; }
    if (gesture.kind === "marquee") { setMarquee({ left: Math.min(gesture.start.x, event.clientX) - rect.left, top: Math.min(gesture.start.y, event.clientY) - rect.top, width: Math.abs(event.clientX - gesture.start.x), height: Math.abs(event.clientY - gesture.start.y) }); return; }
    if (gesture.kind === "resize") { const item = draft?.placements[gesture.photoId]; if (!item) return; const world = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current); scaleRef.current = Math.max(.25, Math.min(4, (world.x - item.x) / gesture.width)); setResizeScale(scaleRef.current); return; }
    if (gesture.kind === "resize-pile") { const pile = draft?.pilePlacements[gesture.sequenceId]; if (!pile) return; const world = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current); scaleRef.current = Math.max(.5, Math.min(2.5, (world.x - pile.x) / gesture.width)); setPileResizeScale(scaleRef.current); return; }
    const world = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
    const delta = { x: world.x - gesture.start.x, y: world.y - gesture.start.y };
    deltaRef.current = delta;
    pendingDragDeltaRef.current = delta;
    if (dragFrameRef.current === undefined) {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = undefined;
        setDragDelta(pendingDragDeltaRef.current);
      });
    }
  };
  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = gestureRef.current, stage = stageRef.current; if (!gesture || gesture.pointerId !== event.pointerId || !stage) return; if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId); gestureRef.current = undefined;
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    const delta = deltaRef.current, moved = Math.abs(delta.x) > .25 || Math.abs(delta.y) > .25;
    if (!cancelled && moved && gesture.kind === "photo") execute({ type: "move", photoIds: gesture.ids, by: delta });
    if (!cancelled && moved && gesture.kind === "pile") execute({ type: "move-sequence-piles", sequenceIds: gesture.ids, by: delta });
    if (!cancelled && gesture.kind === "resize" && Math.abs(scaleRef.current - 1) > .01) execute({ type: "resize", photoIds: [gesture.photoId], scale: scaleRef.current });
    if (!cancelled && gesture.kind === "resize-pile" && Math.abs(scaleRef.current - 1) > .01) execute({ type: "resize-sequence-pile", sequenceId: gesture.sequenceId, scale: scaleRef.current });
    if (!cancelled && gesture.kind === "marquee" && draft) {
      const rect = stage.getBoundingClientRect(), a = screenToWorld(gesture.start, rect, viewportRef.current), b = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current); const box = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
      const hits = draft.entryOrder.filter((id) => { const item = draft.placements[id]; const w = Math.max(0, Math.min(box.right, item.x + item.width) - Math.max(box.left, item.x)); const h = Math.max(0, Math.min(box.bottom, item.y + item.height) - Math.max(box.top, item.y)); return w * h / (item.width * item.height) >= .3; });
      setSelected((current) => gesture.additive ? new Set([...current, ...hits]) : new Set(hits));
    }
    deltaRef.current = { x: 0, y: 0 }; scaleRef.current = 1; setDragDelta({ x: 0, y: 0 }); setResizeScale(1); setMarquee(undefined);
  };

  const fit = () => {
    const stage = stageRef.current; if (!stage || !draft) return; const cards = [...draft.entryOrder.map((id) => draft.placements[id]), ...draft.pileOrder.map((id) => draft.pilePlacements[id])]; if (!cards.length) return setViewport(DEFAULT_VIEWPORT);
    const minX = Math.min(...cards.map((x) => x.x)), minY = Math.min(...cards.map((x) => x.y)), maxX = Math.max(...cards.map((x) => x.x + x.width)), maxY = Math.max(...cards.map((x) => x.y + x.height)); const zoom = clampWorktableZoom(Math.min((stage.clientWidth - 128) / (maxX - minX), (stage.clientHeight - 128) / (maxY - minY)));
    setViewport({ zoom, originX: (stage.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom, originY: (stage.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom });
  };
  const zoom = (value: number) => { const stage = stageRef.current; if (!stage) return; const rect = stage.getBoundingClientRect(); setViewport(zoomAroundScreenPoint(viewportRef.current, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, value)); };
  const removeSelectedPiles = useCallback(async () => {
    if (!draft || !pileIds.length) return;
    const editor = createWorktableEditor(draft);
    const removed = editor.execute({ type: "remove-sequence-piles", sequenceIds: pileIds });
    if (!removed.ok) { setNotice("This Sequence pile could not be removed."); return; }
    const result = await deleteSequences(pileIds, removed.value);
    if (!result.ok) { setNotice(workspaceSaveErrorMessage(result.error)); return; }
    editorRef.current = editor;
    setDraft(removed.value);
    setSelectedPiles(new Set());
    setSummaries((items) => items.filter((item) => !pileIds.includes(item.id)));
  }, [deleteSequences, draft, pileIds]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setViewport(zoomAroundScreenPoint(viewportRef.current, { x: event.clientX, y: event.clientY }, stage.getBoundingClientRect(), viewportRef.current.zoom * Math.exp(-event.deltaY * .002)));
        return;
      }
      setViewport({ ...viewportRef.current, originX: viewportRef.current.originX - event.deltaX, originY: viewportRef.current.originY - event.deltaY });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [draft?.projectId, setViewport]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelected(new Set(draft?.entryOrder ?? [])); setSelectedPiles(new Set()); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); history(event.shiftKey ? "redo" : "undo"); }
    if (event.key === "Escape") { setSelected(new Set()); setSelectedPiles(new Set()); }
    if (event.key.toLowerCase() === "s" && photoIds.length) requestSequence(photoIds);
    if (event.key === "Delete" || event.key === "Backspace") { if (pileIds.length) { void removeSelectedPiles(); } else if (photoIds.length) { execute({ type: "remove", photoIds }); setSelected(new Set()); } }
  };

  if (loading || !draft) return <main className="page centered-state"><div className="loading-mark" /><p>Loading Table…</p></main>;
  if (!workspace) return <main className="page centered-state"><h1>{error ?? "Table could not be loaded."}</h1></main>;
  const group = draft.groups.find((g) => g.photoIds.length === photoIds.length && g.photoIds.every((id) => selected.has(id)));
  const memberGroup = photoIds.length === 1 ? draft.groups.find((g) => g.photoIds.includes(photoIds[0])) : undefined;
  const canGroup = photoIds.length > 1 && photoIds.every((id) => !draft.groups.some((g) => g.photoIds.includes(id)));
  const canJoin = photoIds.length === 1 && !memberGroup && draft.groups.length > 0;
  const selectedLink = photoIds.length > 1 ? draft.links.find((link) => link.photoIds.length === photoIds.length && photoIds.every((id) => link.photoIds.includes(id))) : undefined;
  const firstSource = workspace.sources.find((source) => !source.removedAt);
  const arrange = (layout: WorktableEditCommand) => photoIds.length > 1 && execute(layout);

  return <main className="table-page page">
    <div className="table-toolbar" aria-label="Table 工具栏">
      <span className="table-project-name" title={workspace.name}>{workspace.name}</span>
      <span className="table-toolbar-divider" />
      <div className="table-toolbar-group">
        <TableToolButton icon={undoIcon} label="Undo" disabled={!editorRef.current?.canUndo()} onClick={() => history("undo")} />
        <TableToolButton icon={redoIcon} label="Redo" disabled={!editorRef.current?.canRedo()} onClick={() => history("redo")} />
      </div>
      <span className="table-toolbar-divider" />
      <div className="table-toolbar-group">
        <TableToolButton icon={sequenceIcon} label="Sequence" disabled={!photoIds.length} onClick={() => requestSequence(photoIds)} />
        <TableToolButton icon={addToSequenceIcon} label="Add to Sequence" disabled={!photoIds.length || !summaries.length} onClick={() => { setAddToSequenceId(summaries[0]?.id); setAddToSequenceOpen(true); }} />
      </div>
      <span className="table-toolbar-divider" />
      <div className="table-toolbar-group">
        <TableToolButton icon={groupIcon} label={group ? "Ungroup" : "Group"} disabled={!group && !canGroup} onClick={() => group ? execute({ type: "remove-group", groupId: group.id }) : execute({ type: "create-group", photoIds })} />
        <TableToolButton icon={leaveGroupIcon} label="Leave" disabled={!memberGroup} onClick={() => memberGroup && execute({ type: "remove-from-group", photoId: photoIds[0] })} />
        <label className="table-tool-select"><img src={addToGroupIcon} alt="" /><select aria-label="Add to Group" value="" disabled={!canJoin} onChange={(event) => event.target.value && execute({ type: "add-to-group", groupId: event.target.value, photoId: photoIds[0] })}><option value="">Add to Group</option>{draft.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select><img className="table-tool-chevron" src={chevronDownIcon} alt="" /></label>
      </div>
      <span className="table-toolbar-divider" />
      <div className="table-toolbar-group">
        <TableToolButton icon={linkIcon} label={selectedLink ? "Unlink" : "Link"} disabled={selectedLink ? false : photoIds.length < 2 || photoIds.length > 6} onClick={() => selectedLink ? execute({ type: "remove-link", linkId: selectedLink.id }) : execute({ type: "create-link", photoIds })} />
        <TableToolButton icon={compareIcon} label="Compare" disabled={photoIds.length !== 2 && pileIds.length !== 2} onClick={() => pileIds.length === 2 ? navigate({ name: "sequence-compare", projectId, leftSequenceId: pileIds[0], rightSequenceId: pileIds[1] }) : setComparePhotoIds([photoIds[0], photoIds[1]])} />
      </div>
      <span className="table-toolbar-divider" />
      <div className="table-toolbar-group">
        <TableToolButton icon={previewIcon} label="Preview" disabled={photoIds.length !== 1} onClick={() => setPreviewPhotoId(photoIds[0])} />
        <TableToolButton icon={gridIcon} label="Grid" disabled={photoIds.length < 2} onClick={() => arrange({ type: "arrange", photoIds, layout: { type: "grid" } })} />
        <TableToolButton icon={rowIcon} label="Row" disabled={photoIds.length < 2} onClick={() => arrange({ type: "arrange", photoIds, layout: { type: "row" } })} />
        <label className="table-tool-select"><img src={alignIcon} alt="" /><select aria-label="Align selection" value={alignment} disabled={photoIds.length < 2} onChange={(event) => { const edge = event.target.value as WorktableAlignment; arrange({ type: "arrange", photoIds, layout: { type: "align", edge } }); setAlignment(""); }}><option value="">Align</option><option value="left">Left</option><option value="center-x">Center</option><option value="right">Right</option><option value="top">Top</option><option value="center-y">Middle</option><option value="bottom">Bottom</option></select><img className="table-tool-chevron" src={chevronDownIcon} alt="" /></label>
      </div>
      <span className="table-toolbar-divider" />
      <div className="table-toolbar-group">
        <TableToolButton icon={frontIcon} label="Front" disabled={!photoIds.length && !pileIds.length} onClick={() => pileIds.length ? execute({ type: "bring-sequence-piles-to-front", sequenceIds: pileIds }) : execute({ type: "bring-to-front", photoIds })} />
        <TableToolButton className="is-danger" icon={removeIcon} label="Remove" disabled={!photoIds.length && !pileIds.length} onClick={() => { if (pileIds.length) void removeSelectedPiles(); else { execute({ type: "remove", photoIds }); setSelected(new Set()); } }} />
      </div>
      <span className="table-toolbar-spacer" />
      <div className="table-toolbar-status">
        <span>{pileIds.length ? `${pileIds.length} piles selected` : photoIds.length ? `${photoIds.length} selected` : `${draft.entryOrder.length} photos · ${draft.pileOrder.length} piles`}</span>
        <span className="table-toolbar-divider" />
        <TableToolButton icon={fitIcon} label="Fit" onClick={fit} />
        <button className="table-tool-icon-button" aria-label="Zoom out" onClick={() => zoom(viewport.zoom - .25)}><img src={minusIcon} alt="" /></button>
        <span className="table-zoom-label">{Math.round(viewport.zoom * 100)}%</span>
        <button className="table-tool-icon-button" aria-label="Zoom in" onClick={() => zoom(viewport.zoom + .25)}><img src={plusIcon} alt="" /></button>
      </div>
    </div>
    {notice && <p className="table-notice" role="status">{notice}</p>}
    <div ref={stageRef} className="worktable-stage" tabIndex={0} aria-label="Photo worktable" onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onContextMenu={(event) => event.preventDefault()} onKeyDown={onKeyDown}>
      <div className="worktable-world" style={{ transform: `translate3d(${viewport.originX}px,${viewport.originY}px,0) scale(${viewport.zoom})` }}>
        <svg className="worktable-links">{draft.links.flatMap((link) => link.photoIds.slice(1).map((id, i) => { const a = draft.placements[link.photoIds[i]], b = draft.placements[id]; return <line key={`${link.id}-${id}`} x1={a.x + a.width / 2} y1={a.y + a.height / 2} x2={b.x + b.width / 2} y2={b.y + b.height / 2} />; }))}</svg>
        {draft.groups.map((g) => { const box = groupBounds(draft, g.photoIds); return <div key={g.id} className="worktable-group-frame" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}><span>{g.name} · {g.photoIds.length}</span></div>; })}
        {draft.entryOrder.map((id) => { const item = draft.placements[id], chosen = selected.has(id), delta = chosen && gestureRef.current?.kind === "photo" ? dragDelta : { x: 0, y: 0 }, scale = gestureRef.current?.kind === "resize" && gestureRef.current.photoId === id ? resizeScale : 1; return <article key={id} aria-label={item.filename} className={`worktable-card${chosen ? " is-selected" : ""}${missing.has(id) ? " is-missing" : ""}`} style={{ width: item.width * scale, height: item.height * scale, zIndex: item.z, transform: `translate3d(${item.x + delta.x}px,${item.y + delta.y}px,0)` }} onPointerDown={(event) => onPhotoDown(event, id)} onDoubleClick={() => setPreviewPhotoId(id)}><div className="worktable-photo" style={{ height: item.height * scale }}>{mountedPhotoIds.has(id) ? <PhotoThumb photoSource={dependencies.photoSource} photoId={id} alt={item.filename} onError={onPhotoError} resolution="table" progressiveTo={visiblePhotoIds.has(id) ? tablePreviewEdge(viewport.zoom, chosen) : 768} /> : <div className="thumb-placeholder" aria-hidden="true" />}{missing.has(id) && <span className="worktable-missing">MISSING</span>}</div>{chosen && photoIds.length === 1 && <button aria-label="Resize photo" className="worktable-resize-handle" onPointerDown={(event) => onResizeDown(event, id)} />}</article>; })}
        {draft.pileOrder.map((id) => { const pile = draft.pilePlacements[id], summary = summaries.find((x) => x.id === id), chosen = selectedPiles.has(id), delta = chosen && gestureRef.current?.kind === "pile" ? dragDelta : { x: 0, y: 0 }, scale = gestureRef.current?.kind === "resize-pile" && gestureRef.current.sequenceId === id ? pileResizeScale : 1; return <article key={id} aria-label={`Sequence pile ${summary?.name ?? "Missing Sequence"}`} className={`sequence-pile${chosen ? " is-selected" : ""}`} style={{ width: pile.width * scale, height: pile.height * scale, zIndex: pile.z, transform: `translate3d(${pile.x + delta.x - (pile.width * (scale - 1)) / 2}px,${pile.y + delta.y - (pile.height * (scale - 1)) / 2}px,0)` }} onPointerDown={(event) => onPileDown(event, id)} onDoubleClick={(event) => { event.stopPropagation(); navigate({ name: "sequence", projectId, sequenceId: id }); }}><header><strong>{summary?.name ?? "Missing Sequence"}</strong><span>{summary?.itemCount ?? 0}</span></header><div className="sequence-pile-thumbs">{summary?.previewPhotoIds.map((photoId, index) => <span key={`${photoId}-${index}`}><PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt="" onError={onPhotoError} /></span>)}</div><small>Double-click to open</small>{chosen && <button aria-label="Resize sequence pile" className="worktable-resize-handle sequence-pile-resize-handle" onPointerDown={(event) => onPileResizeDown(event, id)} />}</article>; })}
      </div>
      {marquee && <div className="worktable-marquee" style={marquee} />}
      {!draft.entryOrder.length && !draft.pileOrder.length && <section className="worktable-empty"><span>EMPTY TABLE</span><h1>Bring photographs here to think with them.</h1><p>Select photographs in Photos, then choose Place on Table.</p><button className="button button-primary" onClick={() => firstSource ? navigate({ name: "contact-sheet", projectId, sourceId: firstSource.id }) : navigate({ name: "project", projectId })}>{firstSource ? "Open Photos" : "Add a photo folder"}</button></section>}
    </div>
    {confirmation && <section className="sequence-confirmation sequence-pile-confirmation" role="dialog" aria-label="Create Sequence pile"><label><span>SEQUENCE NAME</span><input autoFocus value={confirmation.name} onChange={(event) => setConfirmation({ ...confirmation, name: event.target.value })} onKeyDown={(event) => event.key === "Enter" && void createPile()} /></label><div className="sequence-confirmation-order">{confirmation.photoIds.map((id, index) => <button key={id} draggable onDragStart={() => setConfirmationDragId(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (confirmationDragId) setConfirmation({ ...confirmation, photoIds: movePhoto(confirmation.photoIds, confirmationDragId, index) }); setConfirmationDragId(undefined); }}><PhotoThumb photoSource={dependencies.photoSource} photoId={id} alt={`Order ${index + 1}`} onError={onPhotoError} /><span>{index + 1}</span></button>)}</div><div><button onClick={() => setConfirmation(undefined)}>Cancel</button><button className="button button-primary" onClick={() => void createPile()}>Create Pile</button></div></section>}
    {addToSequenceOpen && <section className="sequence-add-dialog" role="dialog" aria-label="Add photos to Sequence"><header><strong>ADD TO SEQUENCE</strong><button onClick={() => setAddToSequenceOpen(false)} aria-label="Close">×</button></header><p>{photoIds.length} selected photo{photoIds.length === 1 ? "" : "s"}</p><label><span>DESTINATION SEQUENCE</span><select autoFocus value={addToSequenceId ?? ""} onChange={(event) => setAddToSequenceId(event.target.value as SequenceId)}>{summaries.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.itemCount} photos</option>)}</select></label><footer><button onClick={() => setAddToSequenceOpen(false)}>Cancel</button><button className="button button-primary" disabled={!addToSequenceId} onClick={() => void addPhotosToSequence()}>Add photos</button></footer></section>}
    <section className={`sequence-strip${sequenceCollapsed ? " is-collapsed" : ""}${activeSequence ? "" : " is-empty"}`} aria-label="Sequence Order"><header><button onClick={() => setSequenceCollapsed((x) => !x)}>{sequenceCollapsed ? "↑" : "↓"}</button><strong>SEQUENCE ORDER</strong><span>{activeSequence ? `${activeSequence.name} · ${activeSequence.items.filter(isPhotoSequenceItem).length} photos` : "Select one Sequence Pile"}</span>{activeSequence && <><small>drag to reorder</small><button className="sequence-strip-open" onClick={() => navigate({ name: "sequence", projectId, sequenceId: activeSequence.id })}>Open Sequence</button></>}</header>{!sequenceCollapsed && activeSequence && <div ref={stripViewportRef} className="sequence-strip-items" onScroll={(event) => setStripSize({ width: event.currentTarget.clientWidth, scrollLeft: event.currentTarget.scrollLeft })}><div className="sequence-strip-track" style={{ width: stripRange.totalWidth }}>{activeSequence.items.slice(stripRange.startIndex, stripRange.endIndex).map((item, offset) => { const index = stripRange.startIndex + offset; return <button key={item.id} ref={(element) => { if (element) stripRefs.current.set(item.id, element); else stripRefs.current.delete(item.id); }} style={{ left: index * stripRange.itemStride }} className={`sequence-strip-item${sequenceDragId === item.id ? " is-dragging" : ""}`} draggable onDragStart={() => setSequenceDragId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (sequenceDragId) void reorderSequence(sequenceDragId, index); setSequenceDragId(undefined); }} onDragEnd={() => setSequenceDragId(undefined)}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`Sequence ${index + 1}`} onError={onPhotoError} /> : <span className="sequence-blank-thumb">BLANK</span>}<span>{String(index + 1).padStart(2, "0")}</span></button>; })}</div></div>}</section>
    {previewPhotoId && draft.placements[previewPhotoId] && <Preview photoId={previewPhotoId} filename={draft.placements[previewPhotoId].filename} photoSource={dependencies.photoSource} onClose={() => setPreviewPhotoId(undefined)} onError={onPhotoError} />}
    {comparePhotoIds && <PhotoCompare ids={comparePhotoIds} draft={draft} photoSource={dependencies.photoSource} onClose={() => setComparePhotoIds(undefined)} />}
  </main>;
}

function TableToolButton({ icon, label, className = "", ...props }: { icon: string; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button className={`table-tool-button${className ? ` ${className}` : ""}`} {...props}><img src={icon} alt="" /><span>{label}</span></button>;
}

function Preview({ photoId, filename, photoSource, onClose, onError }: { photoId: PhotoId; filename: string; photoSource: AppDependencies["photoSource"]; onClose: () => void; onError: (id: PhotoId, error: SourceError) => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { let live = true, lease: { url: string; release(): void } | undefined; void photoSource.preview(photoId).then((result) => { if (!result.ok) { if (live) onError(photoId, result.error); return; } if (!live) return result.value.release(); lease = result.value; setUrl(lease.url); }); return () => { live = false; lease?.release(); }; }, [onError, photoId, photoSource]);
  useEffect(() => { const key = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose(); window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  return <div className="table-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${filename}`} onPointerDown={onClose}><section className="table-preview-dialog" onPointerDown={(event) => event.stopPropagation()}><header><span>{filename}</span><button autoFocus onClick={onClose} aria-label="Close preview">×</button></header><div className="table-preview-image-wrap">{url ? <img src={url} alt={filename} /> : <div className="preview-placeholder">Preview unavailable</div>}</div></section></div>;
}
function PhotoCompare({ ids, draft, photoSource, onClose }: { ids: readonly [PhotoId, PhotoId]; draft: WorktableDraft; photoSource: AppDependencies["photoSource"]; onClose: () => void }) {
  const [order, setOrder] = useState(ids), [urls, setUrls] = useState<readonly string[]>([]);
  useEffect(() => { let live = true; const leases: Array<{ release(): void }> = []; void Promise.all(order.map((id) => photoSource.preview(id))).then((results) => { if (!live) return results.forEach((x) => x.ok && x.value.release()); leases.push(...results.flatMap((x) => x.ok ? [x.value] : [])); setUrls(results.map((x) => x.ok ? x.value.url : "")); }); return () => { live = false; leases.forEach((x) => x.release()); }; }, [order, photoSource]);
  return <div className="compare-backdrop" role="dialog" aria-modal="true" aria-label="Compare two photos"><header><span>COMPARE</span><button onClick={() => setOrder([order[1], order[0]])}>Swap</button><button onClick={onClose}>×</button></header><div className="compare-images">{order.map((id, index) => <figure key={id}><span>{index ? "B" : "A"}</span>{urls[index] ? <img src={urls[index]} alt={draft.placements[id].filename} /> : <div className="preview-placeholder">Preview unavailable</div>}</figure>)}</div></div>;
}
function groupBounds(draft: WorktableDraft, ids: readonly PhotoId[]) { const x = ids.map((id) => draft.placements[id]), p = 24, left = Math.min(...x.map((v) => v.x)) - p, top = Math.min(...x.map((v) => v.y)) - p, right = Math.max(...x.map((v) => v.x + v.width)) + p, bottom = Math.max(...x.map((v) => v.y + v.height)) + p; return { left, top, width: right - left, height: bottom - top }; }
function maximumZ(draft: WorktableDraft) { return Math.max(-1, ...Object.values(draft.placements).map((x) => x.z), ...Object.values(draft.pilePlacements).map((x) => x.z)); }
function movePhoto(items: readonly PhotoId[], id: PhotoId, to: number) { const rest = items.filter((x) => x !== id), target = items.slice(0, to).filter((x) => x !== id).length; return [...rest.slice(0, target), id, ...rest.slice(target)]; }
function newId(prefix: string) { return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function setsEqual(left: ReadonlySet<PhotoId>, right: ReadonlySet<PhotoId>) { return left.size === right.size && [...left].every((id) => right.has(id)); }
function tablePreviewEdge(zoom: number, selected: boolean): DerivedPreviewMaxEdge {
  if (zoom >= 4) return 2048;
  if (selected || zoom >= 2) return 1536;
  return 768;
}
function sequenceSaveErrorMessage(kind: SequenceWriteError["kind"]): string {
  if (kind === "sequence-conflict") return "Sequence 已在其他标签页更新，请重新载入。";
  if (kind === "not-found") return "Sequence 已不存在。";
  if (kind === "quota-exceeded") return "浏览器存储空间不足，Sequence 未保存。";
  return "Sequence 当前无法保存，请稍后重试。";
}
