import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import compareIcon from "../assets/icons/table-compare.svg";
import chevronIcon from "../assets/icons/table-chevron-down.svg";
import gridIcon from "../assets/icons/table-grid.svg";
import minusIcon from "../assets/icons/table-minus.svg";
import plusIcon from "../assets/icons/table-plus.svg";
import previewIcon from "../assets/icons/table-preview.svg";
import redoIcon from "../assets/icons/table-redo.svg";
import undoIcon from "../assets/icons/table-undo.svg";
import segmentIcon from "../assets/icons/table-segment.svg";
import sequenceIcon from "../assets/icons/table-sequence.svg";
import type { PhotoId, ProjectId, ReadingUnit, ReadingUnitId, SequenceDocument, SequenceEditCommand, SequenceId, SequenceItem, SequenceItemId, SequenceSegment, SequenceSegmentId, SequenceSummary, VersionId } from "../contracts";
import { calculateSequenceStripVirtualRange, createInitialSequenceBundle, createSequenceLookup, TABLE_SEQUENCE_STRIP_ITEM_GAP, TABLE_SEQUENCE_STRIP_ITEM_WIDTH, type SequenceLookup } from "../modules/sequence";
import { openVersionAsDraft } from "../modules/versioning";
import type { AppDependencies } from "./dependencies";
import { useDialogKeyboard } from "./AppPrimitives";
import { AppHeader } from "./AppHeader";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { fitSequenceCardFrame } from "./sequenceCardGeometry";
import { useProjectWorkspaceSession } from "./useProjectWorkspace";
import { useSequenceSession } from "./sequenceSession";
import { useSequenceReorderDrag } from "./useSequenceReorderDrag";
import { SequenceReadMode, warmSequenceReadAt } from "./SequenceReadMode";
import { SequencePdfExportButton } from "./SequencePdfExportButton";

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
interface SegmentDialog { mode: "create" | "rename"; value: string; segmentId?: SequenceSegmentId }
interface SequenceDialog { value: string }

export function SequencePage({ dependencies, projectId, sequenceId, openVersionId, navigate }: { dependencies: AppDependencies; projectId: ProjectId; sequenceId: SequenceId; openVersionId?: VersionId; navigate: (route: AppRoute) => void }) {
  const [selected, setSelected] = useState<Set<SequenceItemId>>(new Set());
  const [anchor, setAnchor] = useState<SequenceItemId>();
  const [zoom, setZoom] = useState(1.25);
  const [overview, setOverview] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [collapsedSegments, setCollapsedSegments] = useState<Set<SequenceSegmentId>>(new Set());
  const [readIndex, setReadIndex] = useState<number>();
  const [segmentDialog, setSegmentDialog] = useState<SegmentDialog>();
  const [notice, setNotice] = useState<string>();
  const [missing, setMissing] = useState<Set<PhotoId>>(new Set());
  const [availableSequences, setAvailableSequences] = useState<readonly SequenceSummary[]>([]);
  const [selectedCompareSequenceIds, setSelectedCompareSequenceIds] = useState<Set<SequenceId>>(new Set());
  const [sequenceCompareDialog, setSequenceCompareDialog] = useState(false);
  const [newSequenceDialog, setNewSequenceDialog] = useState<SequenceDialog>();
  const [stripLayout, setStripLayout] = useState({ width: 0, scrollLeft: 0 });
  const [visibleStageIds, setVisibleStageIds] = useState<Set<SequenceItemId>>(new Set());
  const [baseline, setBaseline] = useState<{ readonly sequenceId: SequenceId; readonly draftKey: string }>();
  const workspaceRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLElement>(null);
  const openedVersionRef = useRef<string | undefined>(undefined);
  const photoNameCacheRef = useRef(new Map<PhotoId, string>());
  const { workspace, save: saveWorkspace, updateResumeContext, listSequences, loadVersion, createSequenceBundle, coordinator } = useProjectWorkspaceSession(dependencies, projectId);
  const sequenceSession = useSequenceSession(coordinator, projectId, sequenceId);
  const { sequence, canUndo, canRedo, saveState } = sequenceSession;
  const sequenceLookup = useMemo(() => sequence ? createSequenceLookup(sequence) : undefined, [sequence]);

  useEffect(() => {
    let live = true;
    void listSequences().then((result) => live && result.ok && setAvailableSequences(result.value));
    return () => { live = false; };
  }, [listSequences, projectId, sequenceId]);

  useEffect(() => {
    if (!sequence || !openVersionId || openedVersionRef.current === openVersionId) return;
    openedVersionRef.current = openVersionId;
    let live = true;
    void loadVersion(openVersionId).then((opened) => {
      if (!live || !opened.ok) return;
      sequenceSession.replaceDraft(openVersionAsDraft(opened.value), `Opened ${opened.value.name} as Working Draft.`);
    });
    return () => { live = false; };
  }, [loadVersion, openVersionId, sequence, sequenceSession]);

  useEffect(() => {
    if (sequence && baseline?.sequenceId !== sequence.id) {
      setBaseline({ sequenceId: sequence.id, draftKey: sequenceDraftKey(sequence) });
    }
  }, [baseline?.sequenceId, sequence]);

  const stripRange = useMemo(() => calculateSequenceStripVirtualRange({ itemCount: sequence?.items.length ?? 0, viewportWidth: stripLayout.width, scrollLeft: stripLayout.scrollLeft, itemWidth: TABLE_SEQUENCE_STRIP_ITEM_WIDTH * 0.95, itemGap: TABLE_SEQUENCE_STRIP_ITEM_GAP * 0.95 }), [sequence?.items.length, stripLayout]);

  useLayoutEffect(() => {
    const element = stripRef.current;
    if (!element || stripCollapsed) return;
    const measure = () => setStripLayout({ width: element.clientWidth || element.getBoundingClientRect().width, scrollLeft: element.scrollLeft });
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [sequence?.id, stripCollapsed]);

  useEffect(() => {
    if (!sequence || overview) return;
    const root = stageRef.current;
    if (!root) return;
    const elements = [...root.querySelectorAll<HTMLElement>("[data-item-id]")];
    if (typeof IntersectionObserver !== "function") {
      setVisibleStageIds(new Set(sequence.items.map((item) => item.id)));
      return;
    }
    const visible = new Set<SequenceItemId>();
    const observer = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.itemId as SequenceItemId | undefined;
        if (!id) continue;
        if (entry.isIntersecting && !visible.has(id)) { visible.add(id); changed = true; }
        if (!entry.isIntersecting && visible.delete(id)) changed = true;
      }
      if (changed) setVisibleStageIds(new Set(visible));
    }, { root, rootMargin: "0px 480px" });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [collapsedSegments, overview, sequence, zoom]);
  useEffect(() => {
    if (!workspace || !sequence) return;
    if (workspace.resumeContext?.page === "sequence" && workspace.resumeContext.sequenceId === sequenceId) return;
    void updateResumeContext({ page: "sequence", filter: "all", sequenceId }, true);
  }, [sequence, sequenceId, updateResumeContext, workspace]);
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

  const commit = useCallback((command: SequenceEditCommand) => {
    const result = sequenceSession.execute(command);
    if (!result.ok) { setNotice(commandErrorMessage(result.error.kind)); return false; }
    setSelected((current) => new Set([...current].filter((id) => result.value.items.some((item) => item.id === id))));
    return true;
  }, [sequenceSession]);

  const history = useCallback((direction: "undo" | "redo") => {
    if (direction === "undo") sequenceSession.undo();
    else sequenceSession.redo();
  }, [sequenceSession]);

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
  const getPhotoName = useCallback(async (photoId: PhotoId) => {
    const cached = photoNameCacheRef.current.get(photoId);
    if (cached) return cached;
    const result = await dependencies.photoSource.getPhoto(photoId);
    if (!result.ok) return undefined;
    const name = result.value.relativePath.split(/[\\/]/).at(-1) ?? result.value.relativePath;
    photoNameCacheRef.current.set(photoId, name);
    return name;
  }, [dependencies.photoSource]);

  const dragContainers = useMemo(() => ({ workspace: workspaceRef, stage: stageRef, strip: stripRef, overview: overviewRef }), []);
  const sequenceItemIds = useMemo(() => sequence?.items.map((item) => item.id) ?? [], [sequence?.items]);
  const onDragSelectionChange = useCallback((next: ReadonlySet<SequenceItemId>, nextAnchor?: SequenceItemId) => {
    setSelected(new Set(next));
    setAnchor(nextAnchor);
  }, []);
  const onDragMove = useCallback((itemIds: readonly SequenceItemId[], to: number) => {
    commit({ type: "move", itemIds, to });
  }, [commit]);
  const { dropTarget, begin: beginDrag, move: moveDrag, end: endDrag, cancel: cancelDrag } = useSequenceReorderDrag({
    itemIds: sequenceItemIds,
    selected,
    anchor,
    containers: dragContainers,
    onSelectionChange: onDragSelectionChange,
    onMove: onDragMove,
  });
  const readUnitForItem = useCallback((itemId: SequenceItemId) => sequenceLookup?.unitIndexByItemId.get(itemId) ?? -1, [sequenceLookup]);
  const warmReadAt = useCallback((index: number) => {
    if (sequence) void warmSequenceReadAt(dependencies.photoSource, sequence, index);
  }, [dependencies.photoSource, sequence]);
  const openRead = useCallback((index: number) => { warmReadAt(index); setReadIndex(index); }, [warmReadAt]);
  const openReadAtItem = useCallback((itemId: SequenceItemId) => { const index = readUnitForItem(itemId); if (index >= 0) openRead(index); }, [openRead, readUnitForItem]);
  useEffect(() => {
    if (!sequence?.readingUnits.length) return;
    const timer = window.setTimeout(() => warmReadAt(0), 300);
    return () => window.clearTimeout(timer);
  }, [sequence?.id, sequence?.readingUnits.length, warmReadAt]);
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
    if (event.key.toLowerCase() === "r" && sequence?.readingUnits.length) { event.preventDefault(); openRead(orderedSelection[0] ? readUnitForItem(orderedSelection[0].id) : 0); return; }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(1, zoom, setZoom); return; }
    if (event.key === "-") { event.preventDefault(); changeZoom(-1, zoom, setZoom); return; }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && sequence?.items.length) {
      event.preventDefault(); const current = orderedSelection.at(-1); const index = current ? sequenceLookup?.itemIndexById.get(current.id) ?? 0 : 0; const next = sequence.items[Math.max(0, Math.min(sequence.items.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))]; if (next) { setSelected(new Set([next.id])); setAnchor(next.id); window.setTimeout(() => centerItem(next.id), 0); }
    }
  }, [cancelDrag, centerItem, commit, history, openRead, orderedSelection, overview, readUnitForItem, selected.size, sequence, sequenceLookup, zoom]);

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
  const togglePin = useCallback((photoId: PhotoId) => { void saveWorkspace((current) => { const previous = current.photoStates[photoId] ?? { decision: "unreviewed" as const, pinned: false }; return { ...current, photoStates: { ...current.photoStates, [photoId]: { ...previous, pinned: !previous.pinned } }, updatedAt: new Date().toISOString() }; }); }, [saveWorkspace]);
  const onPhotoError = useCallback((photoId: PhotoId) => setMissing((current) => new Set(current).add(photoId)), []);

  const sequenceChanged = useMemo(() => Boolean(sequence && baseline?.sequenceId === sequence.id && sequenceDraftKey(sequence) !== baseline.draftKey), [baseline, sequence]);
  const requestNewSequence = useCallback(() => {
    if (!sequenceChanged || !sequence) return;
    const used = new Set(availableSequences.map((item) => item.name.toLocaleLowerCase()));
    let n = availableSequences.length + 1;
    while (used.has(`sequence ${String(n).padStart(2, "0")}`.toLocaleLowerCase())) n += 1;
    setNewSequenceDialog({ value: `Sequence ${String(n).padStart(2, "0")}` });
  }, [availableSequences, sequence, sequenceChanged]);

  const createNewSequence = useCallback(async () => {
    const current = sequence;
    const dialog = newSequenceDialog;
    if (!current || !dialog || !dialog.value.trim()) return;
    const name = dialog.value.trim();
    if (availableSequences.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setNotice("That Sequence name already exists."); return; }
    const { sequence: nextSequence, initialVersion } = createInitialSequenceBundle({
      projectId,
      name,
      content: { kind: "sequence", sequence: current },
    });
    const id = nextSequence.id;
    await sequenceSession.flush();
    const latest = coordinator.getSnapshot().workspace;
    if (!latest) { setNotice("Project data is still loading."); return; }
    const result = await createSequenceBundle({ sequence: nextSequence, initialVersion, pile: { x: 120 + latest.worktableDraft.pileOrder.length * 28, y: 120 + latest.worktableDraft.pileOrder.length * 28, width: 211, height: 142 } });
    if (!result.ok) { setNotice(result.error.kind === "sequence-name-exists" ? "That Sequence name already exists." : "Sequence could not be created."); return; }
    setAvailableSequences((values) => [...values, result.value.summary]);
    setNewSequenceDialog(undefined);
    setNotice(`Created ${name}.`);
    navigate({ name: "sequence", projectId, sequenceId: id });
  }, [availableSequences, coordinator, createSequenceBundle, navigate, newSequenceDialog, projectId, sequence, sequenceSession, sequenceSession.flush]);

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
  const context = contextActions(orderedSelection, sequenceLookup ?? createSequenceLookup(sequence)) ?? (orderedSelection.length ? { actions: [] } : undefined);
  return <>
    <AppHeader dependencies={dependencies} route={{ name: "sequence", projectId, sequenceId }} projectId={projectId} projectLabel={workspace?.name} navigate={navigate} variant="table" actions={<div className="sequence-header-actions">
      <button className="table-tool-button sequence-back-button" onClick={() => navigate({ name: "table", projectId })}><span aria-hidden="true">←</span>Back to Table</button>
      <div className="sequence-zoom"><button className="table-tool-icon-button" aria-label="Zoom out" onClick={() => changeZoom(-1, zoom, setZoom)}><img src={minusIcon} alt="" /></button><span className="table-zoom-label">{Math.round(zoom * 100)}%</span><button className="table-tool-icon-button" aria-label="Zoom in" onClick={() => changeZoom(1, zoom, setZoom)}><img src={plusIcon} alt="" /></button></div>
      <SequencePdfExportButton key={sequence.id} sequence={sequence} photoSource={dependencies.photoSource} />
    </div>} />
    <main ref={workspaceRef} className="sequence-workspace page" style={{ "--sequence-order-height": stripCollapsed ? "32.3px" : "183.35px", gridTemplateRows: `38px minmax(0, 1fr) ${stripCollapsed ? "32.3px" : "183.35px"}` } as React.CSSProperties} tabIndex={-1} onKeyDown={onKeyDown}>
    <header className="sequence-toolbar">
      <label className="sequence-name-picker"><span className="sr-only">Sequence</span><select value={sequence.id} onChange={(event) => navigate({ name: "sequence", projectId, sequenceId: event.target.value as SequenceId })}>{sequencePickerOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {saveState === "failed" && <button type="button" className="table-save-retry" onClick={() => void sequenceSession.retry()}>Changes not saved · Retry</button>}
      <nav>
        <SequenceToolButton icon={undoIcon} label="Undo" disabled={!canUndo} onClick={() => history("undo")} />
        <SequenceToolButton icon={redoIcon} label="Redo" disabled={!canRedo} onClick={() => history("redo")} />
        <SequenceToolButton icon={previewIcon} label="Read" disabled={!sequence.readingUnits.length} onPointerEnter={() => warmReadAt(orderedSelection[0] ? readUnitForItem(orderedSelection[0].id) : 0)} onFocus={() => warmReadAt(orderedSelection[0] ? readUnitForItem(orderedSelection[0].id) : 0)} onClick={() => openRead(orderedSelection[0] ? readUnitForItem(orderedSelection[0].id) : 0)} />
        <SequenceToolButton className="sequence-compare-button" icon={compareIcon} label="Compare" disabled={!workspace || tableSequences.length < 2} onClick={openSequenceCompareDialog} />
        <SequenceToolButton icon={sequenceIcon} label="Create New Sequence" disabled={!sequenceChanged || saveState === "saving"} onClick={requestNewSequence} />
      </nav>

    </header>
    {notice && <div className="sequence-inline-notice"><span>{notice}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
    {overview ? <OverviewGrid overviewElementRef={overviewRef} zoom={zoom} sequence={sequence} selected={selected} dependencies={dependencies} onWheel={onWheel} onOpen={(id) => { setOverview(false); setTimeout(() => document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center" }), 0); }} onPhotoError={onPhotoError} onPointerDown={(event, id) => beginDrag(event, id, "overview")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} /> :
      <section ref={stageRef} className="sequence-rhythm-stage" aria-label="Sequence rhythm editor" onPointerDown={(event) => { if (event.target === event.currentTarget) setSelected(new Set()); }} onWheel={onWheel}>
        <div className="sequence-rhythm-track" style={{ "--sequence-zoom": zoom } as React.CSSProperties}>
          {renderSequenceFlow(sequence, sequenceLookup ?? createSequenceLookup(sequence), collapsedSegments, (segment) => <SegmentHeader key={`header-${segment.id}`} segment={segment} collapsed={collapsedSegments.has(segment.id)} onToggle={() => setCollapsedSegments((current) => toggleSet(current, segment.id))} onRename={() => setSegmentDialog({ mode: "rename", value: segment.name, segmentId: segment.id })} onUngroup={() => commit({ type: "ungroupSegment", segmentId: segment.id })} onPointerDown={(event) => beginDrag(event, segment.itemIds[0], "stage", segment.itemIds)} />, (item, index) => <SequenceCard key={item.id} item={item} index={index} visible={visibleStageIds.has(item.id)} selected={selected.has(item.id)} dropBefore={dropTarget === index} segment={sequenceLookup?.segmentByItemId.get(item.id)} dependencies={dependencies} missing={item.kind === "photo" && missing.has(item.photoId)} onPointerDown={(event) => beginDrag(event, item.id, "stage")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onDoubleClick={() => openReadAtItem(item.id)} onPhotoError={onPhotoError} />)}
          {dropTarget === sequence.items.length && <span className="sequence-insert-line is-at-end" />}
        </div>
      </section>}
    {!overview && context && <ContextBar onSegment={openSegmentDialog} context={context} onAction={(action) => {
      if (action === "blank-before" || action === "blank-after") { const index = (sequenceLookup?.itemIndexById.get(orderedSelection[0].id) ?? 0) + (action === "blank-after" ? 1 : 0); commit({ type: "addBlank", itemId: newId("blank") as SequenceItemId, unitId: newId("unit") as ReadingUnitId, at: index }); }
      else if (action === "spread") commit({ type: "createSpread", unitId: newId("unit") as ReadingUnitId, itemIds: [orderedSelection[0].id, orderedSelection[1].id] });
      else if (action === "split" && context.unit) commit({ type: "splitSpread", unitId: context.unit.id });
      else if (action === "remove-blank") commit({ type: "removeBlank", itemId: orderedSelection[0].id });
    }} />}
    <section className={`sequence-order${stripCollapsed ? " is-collapsed" : ""}`} aria-label="Sequence Order">
      <header><button className="sequence-order-heading" aria-label={stripCollapsed ? "Expand Sequence Order" : "Collapse Sequence Order"} onClick={() => setStripCollapsed((value) => !value)}><strong>Sequence Order</strong><img className={stripCollapsed ? "is-collapsed" : ""} src={chevronIcon} alt="" /></button><span className="sequence-order-meta"><img src={sequenceIcon} alt="" />{sequence.name} · {sequence.items.filter((item) => item.kind === "photo").length} photos</span><small>Drag to reorder</small><button aria-label="Overview Grid" aria-pressed={overview} className={`sequence-order-overview${overview ? " is-active" : ""}`} onClick={() => setOverview((value) => !value)}><img src={gridIcon} alt="" /><span>Overview</span></button></header>
      {!stripCollapsed && <div ref={stripRef} className="sequence-order-track" onScroll={(event) => setStripLayout({ width: event.currentTarget.clientWidth || event.currentTarget.getBoundingClientRect().width, scrollLeft: event.currentTarget.scrollLeft })}><div className="sequence-order-virtual-inner" style={{ width: stripRange.totalWidth }}>{sequence.items.slice(stripRange.startIndex, stripRange.endIndex).map((item, offset) => { const index = stripRange.startIndex + offset; return <SequenceStripItem key={item.id} item={item} index={index} style={{ left: index * stripRange.itemStride }} selected={selected.has(item.id)} dropBefore={dropTarget === index} segment={sequenceLookup?.segmentByItemId.get(item.id)} unit={sequenceLookup?.unitByItemId.get(item.id)} dependencies={dependencies} getPhotoName={getPhotoName} onPointerDown={(event) => beginDrag(event, item.id, "strip")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onPhotoError={onPhotoError} />; })}{dropTarget === sequence.items.length && <span className="sequence-insert-line is-at-end" />}</div></div>}
    </section>
    {segmentDialog && <Dialog title={segmentDialog.mode === "create" ? "Create Segment" : "Rename Segment"} onClose={() => setSegmentDialog(undefined)}><label><span>Segment name</span><input autoFocus value={segmentDialog.value} onChange={(event) => setSegmentDialog({ ...segmentDialog, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") submitSegment(); if (event.key === "Escape") setSegmentDialog(undefined); }} /></label><footer><button onClick={() => setSegmentDialog(undefined)}>Cancel</button><button className="is-primary" disabled={!segmentDialog.value.trim()} onClick={submitSegment}>{segmentDialog.mode === "create" ? "Create" : "Save"}</button></footer></Dialog>}
    {newSequenceDialog && <Dialog title="Create New Sequence" onClose={() => setNewSequenceDialog(undefined)}><label><span>Sequence name</span><input autoFocus value={newSequenceDialog.value} onChange={(event) => setNewSequenceDialog({ value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void createNewSequence(); if (event.key === "Escape") setNewSequenceDialog(undefined); }} /></label><p className="sequence-dialog-hint">The current order will be copied into a new Sequence pile on Table.</p><footer><button onClick={() => setNewSequenceDialog(undefined)}>Cancel</button><button className="is-primary" disabled={!newSequenceDialog.value.trim()} onClick={() => void createNewSequence()}>Create New Sequence</button></footer></Dialog>}
    {sequenceCompareDialog && <Dialog title="Compare Sequences" onClose={() => setSequenceCompareDialog(false)}><div className="version-dialog-toolbar"><span>Select two Sequences on this Table</span><button className="version-compare-button" disabled={selectedCompareSequenceIds.size !== 2} onClick={compareSelectedSequences}>Compare</button></div><div className="version-list">{tableSequences.length ? tableSequences.map((item) => <div key={item.id} className={selectedCompareSequenceIds.has(item.id) ? "is-version-selected" : ""}><button type="button" className="version-select-row" onClick={() => toggleCompareSequence(item.id)}><span><strong>{item.name}</strong><small>{item.itemCount} items{item.id === sequence.id ? " · Current" : ""}</small></span></button></div>) : <p>No Sequences on this Table yet.</p>}</div><footer><button onClick={() => setSequenceCompareDialog(false)}>Close</button></footer></Dialog>}
    {readIndex !== undefined && <SequenceReadMode sequence={sequence} initialIndex={readIndex} photoSource={dependencies.photoSource} pinned={workspace?.photoStates ?? {}} onTogglePin={togglePin} onClose={() => setReadIndex(undefined)} onPhotoError={onPhotoError} />}
  </main></>;
}

function SequenceToolButton({ icon, label, className = "", ...props }: { icon: string; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button aria-label={label} title={label} className={`table-tool-button sequence-tool-button${className ? ` ${className}` : ""}`} {...props}><img src={icon} alt="" /><span>{label}</span></button>;
}

function SequenceCard({ item, index, visible, selected, dropBefore, segment, dependencies, missing, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onDoubleClick, onPhotoError }: { item: SequenceItem; index: number; visible: boolean; selected: boolean; dropBefore: boolean; segment?: SequenceSegment; dependencies: AppDependencies; missing: boolean; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void; onDoubleClick: () => void; onPhotoError: (id: PhotoId) => void }) {
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
    {item.kind === "blank" ? <div className="sequence-blank-page">BLANK</div> : !missing ? visible ? <PhotoThumb resolution="sequence" photoSource={dependencies.photoSource} photoId={item.photoId} alt={`Sequence item ${index + 1}`} onError={onPhotoError} /> : <div className="thumb-placeholder" aria-hidden="true" /> : <div className="sequence-missing-card"><b>MISSING</b></div>}
  </article>;
}

function SequenceStripItem({ item, index, style, selected, dropBefore, segment, unit, dependencies, getPhotoName, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPhotoError }: { item: SequenceItem; index: number; style?: CSSProperties; selected: boolean; dropBefore: boolean; segment?: SequenceSegment; unit?: ReadingUnit; dependencies: AppDependencies; getPhotoName: (photoId: PhotoId) => Promise<string | undefined>; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void; onPhotoError: (id: PhotoId) => void }) {
  const [filename, setFilename] = useState(item.kind === "blank" ? "Blank" : "Photo");
  useEffect(() => { if (item.kind !== "photo") return; let live = true; void getPhotoName(item.photoId).then((name) => { if (live && name) setFilename(name); }); return () => { live = false; }; }, [getPhotoName, item]);
  const orderContext = [unit?.kind === "spread" ? "SPREAD" : "", segment?.name ?? ""].filter(Boolean).join(" · ");
  return <button title={`${filename}${orderContext ? ` · ${orderContext}` : ""}`} style={style} data-sequence-index={index} data-item-id={item.id} aria-selected={selected} className={`sequence-order-item${selected ? " is-selected" : ""}${dropBefore ? " is-drop-target" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
    <span className="sequence-order-image">{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt="" onError={onPhotoError} /> : <span className="sequence-blank-page">BLANK</span>}{orderContext && <em className="sequence-order-badge">{orderContext}</em>}</span>
    <span className="sequence-order-index">{String(index + 1).padStart(2, "0")}</span>
  </button>;
}

function SegmentHeader({ segment, collapsed, onToggle, onRename, onUngroup, onPointerDown }: { segment: SequenceSegment; collapsed: boolean; onToggle: () => void; onRename: () => void; onUngroup: () => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  return <header className="sequence-segment-header" onPointerDown={onPointerDown}><button onPointerDown={(event) => event.stopPropagation()} onClick={onToggle} aria-expanded={!collapsed}>{collapsed ? "›" : "⌄"}</button><strong onDoubleClick={onRename}>{segment.name}</strong><span>{segment.itemIds.length} items</span><button onPointerDown={(event) => event.stopPropagation()} onClick={onRename}>Rename</button><button onPointerDown={(event) => event.stopPropagation()} onClick={onUngroup}>Ungroup</button></header>;
}

function OverviewGrid({ overviewElementRef, zoom, sequence, selected, dependencies, onWheel, onOpen, onPhotoError, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { overviewElementRef: React.RefObject<HTMLElement | null>; zoom: number; sequence: SequenceDocument; selected: ReadonlySet<SequenceItemId>; dependencies: AppDependencies; onWheel: (event: ReactWheelEvent<HTMLElement>) => void; onOpen: (id: SequenceItemId) => void; onPhotoError: (id: PhotoId) => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: SequenceItemId) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void }) {
  return <section ref={overviewElementRef} className="sequence-overview" style={{ "--overview-zoom": zoom } as React.CSSProperties} role="grid" aria-label="Sequence Overview" onWheel={onWheel} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}><header><strong>Overview Grid</strong><span>Select, drag to reorder, or double-click to read.</span></header><div>{sequence.items.map((item, index) => <button data-sequence-index={index} data-item-id={item.id} role="gridcell" aria-selected={selected.has(item.id)} key={item.id} className={selected.has(item.id) ? "is-selected" : ""} onPointerDown={(event) => onPointerDown(event, item.id)} onDoubleClick={() => onOpen(item.id)}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`Item ${index + 1}`} onError={onPhotoError} /> : <span className="sequence-blank-page">BLANK</span>}<b>{String(index + 1).padStart(2, "0")}</b></button>)}</div></section>;
}

function ContextBar({ context, onAction, onSegment }: { onSegment: () => void; context: Context; onAction: (action: ContextAction) => void }) {
  return <div className="sequence-context-bar table-context-toolbar" role="group" aria-label="Sequence selection actions"><SequenceToolButton icon={segmentIcon} label="Segment" onClick={onSegment} />{context.actions.map((action) => <button className="table-tool-button" key={action} onClick={() => onAction(action)}>{contextLabel(action)}</button>)}</div>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useDialogKeyboard(ref, onClose);
  return <div className="sequence-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="sequence-dialog" role="dialog" aria-modal="true" aria-label={title}><header><strong>{title}</strong><button onClick={onClose} aria-label={`Dismiss ${title}`}>×</button></header>{children}</section></div>;
}

type ContextAction = "blank-before" | "blank-after" | "spread" | "split" | "remove-blank";
interface Context { actions: readonly ContextAction[]; unit?: ReadingUnit }
function contextActions(items: readonly SequenceItem[], lookup: SequenceLookup): Context | undefined {
  if (items.length === 1 && items[0].kind === "blank") return { actions: ["remove-blank"], unit: lookup.unitByItemId.get(items[0].id) };
  if (items.length === 1 && items[0].kind === "photo") { const unit = lookup.unitByItemId.get(items[0].id); return { unit, actions: unit?.kind === "spread" ? ["split", "blank-before", "blank-after"] : ["blank-before", "blank-after"] }; }
  if (items.length === 2 && items.every((item) => item.kind === "photo")) { const indices = items.map((item) => lookup.itemIndexById.get(item.id) ?? -1).sort((a, b) => a - b); if (indices[0] >= 0 && indices[1] === indices[0] + 1) return { actions: ["spread"] }; }
  return undefined;
}
function contextLabel(action: ContextAction): string { return ({ "blank-before": "Insert Blank Before", "blank-after": "Insert Blank After", spread: "Create Spread", split: "Split to Singles", "remove-blank": "Remove Blank" })[action]; }
function renderSequenceFlow(sequence: SequenceDocument, lookup: SequenceLookup, collapsed: ReadonlySet<SequenceSegmentId>, renderHeader: (segment: SequenceSegment) => ReactNode, renderItem: (item: SequenceItem, index: number) => ReactNode): ReactNode[] {
  const byStart = new Map(sequence.segments.map((segment) => [segment.itemIds[0], segment])); const nodes: ReactNode[] = [];
  for (let index = 0; index < sequence.items.length;) { const item = sequence.items[index]; const segment = byStart.get(item.id); if (!segment) { nodes.push(renderItem(item, index)); index += 1; continue; } nodes.push(<section key={segment.id} className={`sequence-segment${collapsed.has(segment.id) ? " is-collapsed" : ""}`}>{renderHeader(segment)}{!collapsed.has(segment.id) && <div>{segment.itemIds.map((id) => { const itemIndex = lookup.itemIndexById.get(id) ?? -1; const segmentItem = lookup.itemById.get(id); return segmentItem && itemIndex >= 0 ? renderItem(segmentItem, itemIndex) : null; })}</div>}</section>); index += segment.itemIds.length; }
  return nodes;
}
function nextSegmentName(segments: readonly SequenceSegment[]): string { let n = segments.length + 1; const used = new Set(segments.map((segment) => segment.name.toLocaleLowerCase())); while (used.has(`segment ${String(n).padStart(2, "0")}`)) n += 1; return `Segment ${String(n).padStart(2, "0")}`; }
function toggleSet<T>(current: ReadonlySet<T>, value: T): Set<T> { const next = new Set(current); next.has(value) ? next.delete(value) : next.add(value); return next; }
function changeZoom(direction: -1 | 1, current: number, set: (value: number) => void) { const index = ZOOM_LEVELS.reduce((best, value, currentIndex) => Math.abs(value - current) < Math.abs(ZOOM_LEVELS[best] - current) ? currentIndex : best, 0); set(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index + direction))]); }
function isTypingTarget(target: EventTarget | null): boolean { return target instanceof HTMLElement && (target.matches("input, textarea, [contenteditable=true]") || Boolean(target.closest("input, textarea, [contenteditable=true]"))); }
function commandErrorMessage(kind: string): string { if (kind === "invalid-segment") return "Select a continuous range of complete Reading Units."; if (kind === "invalid-reading-unit") return "That Reading Unit cannot be created from the current selection."; if (kind === "sequence-limit-exceeded") return "This Sequence has reached the MVP item limit."; if (kind === "cannot-remove-last-item") return "A Sequence must keep at least one item."; return "This Sequence operation could not be completed."; }
function sequenceDraftKey(sequence: SequenceDocument | undefined): string { return sequence ? JSON.stringify({ items: sequence.items, segments: sequence.segments, readingUnits: sequence.readingUnits }) : ""; }
function newId(prefix: string): string { return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
