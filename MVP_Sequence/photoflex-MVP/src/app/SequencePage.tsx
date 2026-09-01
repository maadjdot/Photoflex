import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import type { PhotoId, ProjectId, ReadingUnit, ReadingUnitId, SequenceDocument, SequenceEditCommand, SequenceEditor, SequenceId, SequenceItem, SequenceItemId, SequenceSegment, SequenceSegmentId } from "../contracts";
import { compareSequences, createSequenceEditor } from "../modules/sequence";
import type { AppDependencies } from "./dependencies";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { useProjectWorkspace } from "./useProjectWorkspace";

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
type DragSource = "stage" | "strip" | "overview";
interface DragState { pointerId: number; source: DragSource; itemIds: readonly SequenceItemId[]; clickedId: SequenceItemId; collapseOnClick: boolean; startX: number; target: number; moved: boolean }
interface SegmentDialog { mode: "create" | "rename"; value: string; segmentId?: SequenceSegmentId }

export function SequencePage({ dependencies, projectId, sequenceId, navigate }: { dependencies: AppDependencies; projectId: ProjectId; sequenceId: SequenceId; navigate: (route: AppRoute) => void }) {
  const [sequence, setSequence] = useState<SequenceDocument>();
  const [selected, setSelected] = useState<Set<SequenceItemId>>(new Set());
  const [anchor, setAnchor] = useState<SequenceItemId>();
  const [zoom, setZoom] = useState(0.75);
  const [overview, setOverview] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [collapsedSegments, setCollapsedSegments] = useState<Set<SequenceSegmentId>>(new Set());
  const [dropTarget, setDropTarget] = useState<number>();
  const [readIndex, setReadIndex] = useState<number>();
  const [segmentDialog, setSegmentDialog] = useState<SegmentDialog>();
  const [notice, setNotice] = useState<string>();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed">("idle");
  const [missing, setMissing] = useState<Set<PhotoId>>(new Set());
  const editorRef = useRef<SequenceEditor | undefined>(undefined);
  const sequenceRef = useRef<SequenceDocument | undefined>(undefined);
  const revisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveGenerationRef = useRef(0);
  const dragRef = useRef<DragState | undefined>(undefined);
  const dragFrameRef = useRef<number | undefined>(undefined);
  const pendingDropTargetRef = useRef<number | undefined>(undefined);
  const workspaceRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLElement>(null);
  const { workspace, save: saveWorkspace } = useProjectWorkspace(dependencies, projectId);

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
  }, [dependencies.projectStore, sequenceId]);

  useEffect(() => { let live = true; void load().then(() => { if (!live) return; }); return () => { live = false; saveGenerationRef.current += 1; if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current); }; }, [load]);
  useEffect(() => {
    if (!workspace || !sequence) return;
    if (workspace.resumeContext?.page === "sequence" && workspace.resumeContext.sequenceId === sequenceId) return;
    void saveWorkspace((current) => ({ ...current, lastOpenedAt: new Date().toISOString(), resumeContext: { page: "sequence", filter: "all", sequenceId } }));
  }, [saveWorkspace, sequence, sequenceId, workspace]);

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
    drag.target = target;
    pendingDropTargetRef.current = target;
    if (dragFrameRef.current === undefined) dragFrameRef.current = requestAnimationFrame(() => { dragFrameRef.current = undefined; const next = pendingDropTargetRef.current; if (next !== undefined) setDropTarget(next); });
  }, [sequence]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (dragFrameRef.current !== undefined) { cancelAnimationFrame(dragFrameRef.current); dragFrameRef.current = undefined; }
    setDropTarget(undefined);
    if (drag.moved) commit({ type: "move", itemIds: drag.itemIds, to: drag.target });
    else if (drag.collapseOnClick) { setSelected(new Set([drag.clickedId])); setAnchor(drag.clickedId); }
  }, [commit]);

  const cancelDrag = useCallback(() => { dragRef.current = undefined; if (dragFrameRef.current !== undefined) { cancelAnimationFrame(dragFrameRef.current); dragFrameRef.current = undefined; } setDropTarget(undefined); }, []);
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

  if (!sequence) return <main className="page centered-state">{notice ? <h1>{notice}</h1> : <><div className="loading-mark" /><p>Loading Sequence…</p></>}</main>;
  const context = contextActions(sequence, orderedSelection);
  return <main ref={workspaceRef} className="sequence-workspace page" style={{ "--sequence-order-height": stripCollapsed ? "35px" : "151px", gridTemplateRows: `48px minmax(0, 1fr) ${stripCollapsed ? "35px" : "151px"}` } as React.CSSProperties} tabIndex={-1} onKeyDown={onKeyDown}>
    <header className="sequence-toolbar">
      <strong title={sequence.name}>{sequence.name}</strong>
      <span className={`sequence-save-state is-${saveState}`}>{saveState === "saving" ? "Draft saving…" : saveState === "failed" ? "Save failed" : "Working Draft"}</span>
      <nav>
        <button disabled={!editorRef.current?.canUndo()} onClick={() => history("undo")}>Undo</button>
        <button disabled={!editorRef.current?.canRedo()} onClick={() => history("redo")}>Redo</button>
        <button disabled={!orderedSelection.length} onClick={openSegmentDialog}>Segment</button>
        <button disabled={!sequence.readingUnits.length} onClick={() => setReadIndex(orderedSelection[0] ? readUnitForItem(orderedSelection[0].id) : 0)}>Read</button>
        <button onClick={fitSequence}>Fit Sequence</button>
      </nav>
      <div className="sequence-zoom"><button onClick={() => changeZoom(-1, zoom, setZoom)}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => changeZoom(1, zoom, setZoom)}>+</button></div>
    </header>
    {notice && <div className="sequence-inline-notice"><span>{notice}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
    {overview ? <OverviewGrid overviewElementRef={overviewRef} sequence={sequence} selected={selected} dependencies={dependencies} onOpen={(id) => { setOverview(false); setTimeout(() => document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center" }), 0); }} onPhotoError={onPhotoError} onPointerDown={(event, id) => beginDrag(event, id, "overview")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} /> :
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
      <header><strong>Sequence Order</strong><button aria-label="Overview Grid" className={overview ? "is-active" : ""} onClick={() => setOverview((value) => !value)}>▦</button><span>{sequence.items.length} items</span><button className="sequence-order-collapse" onClick={() => setStripCollapsed((value) => !value)}>{stripCollapsed ? "↑" : "↓"}</button></header>
      {!stripCollapsed && <div ref={stripRef} className="sequence-order-track">{sequence.items.map((item, index) => <SequenceStripItem key={item.id} item={item} index={index} selected={selected.has(item.id)} dropBefore={dropTarget === index} segment={sequence.segments.find((value) => value.itemIds.includes(item.id))} unit={sequence.readingUnits.find((value) => unitItemIds(value).includes(item.id))} dependencies={dependencies} onPointerDown={(event) => beginDrag(event, item.id, "strip")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onPhotoError={onPhotoError} />)}{dropTarget === sequence.items.length && <span className="sequence-insert-line is-at-end" />}</div>}
    </section>
    {segmentDialog && <Dialog title={segmentDialog.mode === "create" ? "Create Segment" : "Rename Segment"} onClose={() => setSegmentDialog(undefined)}><label><span>Segment name</span><input autoFocus value={segmentDialog.value} onChange={(event) => setSegmentDialog({ ...segmentDialog, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") submitSegment(); if (event.key === "Escape") setSegmentDialog(undefined); }} /></label><footer><button onClick={() => setSegmentDialog(undefined)}>Cancel</button><button className="is-primary" disabled={!segmentDialog.value.trim()} onClick={submitSegment}>{segmentDialog.mode === "create" ? "Create" : "Save"}</button></footer></Dialog>}
    {readIndex !== undefined && <ReadOverlay sequence={sequence} initialIndex={readIndex} dependencies={dependencies} pinned={workspace?.photoStates ?? {}} onTogglePin={togglePin} onClose={() => setReadIndex(undefined)} onPhotoError={onPhotoError} />}
  </main>;
}

export function SequenceComparePage({ dependencies, projectId, leftSequenceId, rightSequenceId, navigate }: { dependencies: AppDependencies; projectId: ProjectId; leftSequenceId: SequenceId; rightSequenceId: SequenceId; navigate: (route: AppRoute) => void }) {
  const [left, setLeft] = useState<SequenceDocument>(); const [right, setRight] = useState<SequenceDocument>(); const [error, setError] = useState<string>();
  useEffect(() => { let live = true; void Promise.all([dependencies.projectStore.loadSequence(leftSequenceId), dependencies.projectStore.loadSequence(rightSequenceId)]).then(([a, b]) => { if (!live) return; if (!a.ok || !b.ok) return setError("Sequences could not be compared."); setLeft(a.value); setRight(b.value); }); return () => { live = false; }; }, [dependencies.projectStore, leftSequenceId, rightSequenceId]);
  const diff = useMemo(() => left && right ? compareSequences(left, right) : undefined, [left, right]);
  if (!left || !right || !diff) return <main className="page centered-state">{error ? <h1>{error}</h1> : <><div className="loading-mark" /><p>Comparing Sequences…</p></>}</main>;
  const leftOnly = new Set(diff.leftOnly), rightOnly = new Set(diff.rightOnly), moved = new Set(diff.shared.filter((item) => item.moved).map((item) => item.photoId));
  return <main className="sequence-compare-page page"><header><button onClick={() => navigate({ name: "table", projectId })}>← Table</button><strong>PILE COMPARE</strong><span>Read-only · {diff.leftOnly.length} only A · {diff.rightOnly.length} only B · {moved.size} moved</span></header><div className="sequence-compare-lanes"><SequenceLane label="A" sequence={left} only={leftOnly} moved={moved} dependencies={dependencies} /><SequenceLane label="B" sequence={right} only={rightOnly} moved={moved} dependencies={dependencies} /></div></main>;
}

function SequenceLane({ label, sequence, only, moved, dependencies }: { label: string; sequence: SequenceDocument; only: ReadonlySet<PhotoId>; moved: ReadonlySet<PhotoId>; dependencies: AppDependencies }) {
  return <section className="sequence-compare-lane"><header><b>{label}</b><strong>{sequence.name}</strong><span>{sequence.items.length} items</span></header><div>{sequence.items.map((item, index) => <article key={item.id} className={item.kind === "blank" ? "is-blank" : only.has(item.photoId) ? "is-only" : moved.has(item.photoId) ? "is-moved" : "is-shared"}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`${sequence.name} ${index + 1}`} /> : <div className="sequence-blank-page">BLANK</div>}<span>{index + 1}</span><small>{item.kind === "blank" ? "BLANK" : only.has(item.photoId) ? `ONLY ${label}` : moved.has(item.photoId) ? "MOVED" : "SHARED"}</small></article>)}</div></section>;
}

function SequenceCard({ item, index, selected, dropBefore, segment, dependencies, missing, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onDoubleClick, onPhotoError }: { item: SequenceItem; index: number; selected: boolean; dropBefore: boolean; segment?: SequenceSegment; dependencies: AppDependencies; missing: boolean; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void; onDoubleClick: () => void; onPhotoError: (id: PhotoId) => void }) {
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver !== "function") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), { root: null, rootMargin: "600px 600px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <article ref={cardRef} data-sequence-index={index} data-item-id={item.id} aria-selected={selected} className={`sequence-card${selected ? " is-selected" : ""}${dropBefore ? " is-drop-target" : ""}${segment ? " is-in-segment" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDoubleClick={onDoubleClick}>
    <span className="sequence-card-number">{String(index + 1).padStart(2, "0")}</span>
    {item.kind === "photo" && !missing ? visible ? <PhotoThumb resolution="sequence" photoSource={dependencies.photoSource} photoId={item.photoId} alt={`Sequence item ${index + 1}`} onError={onPhotoError} /> : <div className="thumb-placeholder" aria-hidden="true" /> : <div className="sequence-missing-card"><b>{item.kind === "blank" ? "BLANK" : "MISSING"}</b></div>}
  </article>;
}

function SequenceStripItem({ item, index, selected, dropBefore, segment, unit, dependencies, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPhotoError }: { item: SequenceItem; index: number; selected: boolean; dropBefore: boolean; segment?: SequenceSegment; unit?: ReadingUnit; dependencies: AppDependencies; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void; onPhotoError: (id: PhotoId) => void }) {
  const [filename, setFilename] = useState(item.kind === "blank" ? "Blank" : "Photo");
  const [visible, setVisible] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = itemRef.current;
    if (!element || typeof IntersectionObserver !== "function") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), { root: null, rootMargin: "320px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (item.kind !== "photo") return; let live = true; void dependencies.photoSource.getPhoto(item.photoId).then((result) => { if (live && result.ok) setFilename(result.value.relativePath.split(/[\\/]/).at(-1) ?? result.value.relativePath); }); return () => { live = false; }; }, [dependencies.photoSource, item]);
  return <button ref={itemRef} data-sequence-index={index} data-item-id={item.id} aria-selected={selected} className={`sequence-order-item${selected ? " is-selected" : ""}${dropBefore ? " is-drop-target" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
    <span className="sequence-order-image">{item.kind === "photo" ? visible ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt="" onError={onPhotoError} /> : <div className="thumb-placeholder" aria-hidden="true" /> : <span className="sequence-blank-page">BLANK</span>}<b>{String(index + 1).padStart(2, "0")}</b></span>
    <small>{filename}</small><em>{unit?.kind.toUpperCase()}{segment ? ` · ${segment.name}` : ""}</em>
  </button>;
}

function SegmentHeader({ segment, collapsed, onToggle, onRename, onUngroup, onPointerDown }: { segment: SequenceSegment; collapsed: boolean; onToggle: () => void; onRename: () => void; onUngroup: () => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  return <header className="sequence-segment-header" onPointerDown={onPointerDown}><button onPointerDown={(event) => event.stopPropagation()} onClick={onToggle} aria-expanded={!collapsed}>{collapsed ? "›" : "⌄"}</button><strong onDoubleClick={onRename}>{segment.name}</strong><span>{segment.itemIds.length} items</span><button onPointerDown={(event) => event.stopPropagation()} onClick={onRename}>Rename</button><button onPointerDown={(event) => event.stopPropagation()} onClick={onUngroup}>Ungroup</button></header>;
}

function OverviewGrid({ overviewElementRef, sequence, selected, dependencies, onOpen, onPhotoError, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { overviewElementRef: React.RefObject<HTMLElement | null>; sequence: SequenceDocument; selected: ReadonlySet<SequenceItemId>; dependencies: AppDependencies; onOpen: (id: SequenceItemId) => void; onPhotoError: (id: PhotoId) => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: SequenceItemId) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void; onPointerCancel: () => void }) {
  return <section ref={overviewElementRef} className="sequence-overview" role="grid" aria-label="Sequence Overview" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}><header><strong>Overview Grid</strong><span>Select, drag to reorder, or double-click to read.</span></header><div>{sequence.items.map((item, index) => <OverviewItem key={item.id} item={item} index={index} selected={selected.has(item.id)} dependencies={dependencies} onOpen={onOpen} onPhotoError={onPhotoError} onPointerDown={onPointerDown} />)}</div></section>;
}

function OverviewItem({ item, index, selected, dependencies, onOpen, onPhotoError, onPointerDown }: { item: SequenceItem; index: number; selected: boolean; dependencies: AppDependencies; onOpen: (id: SequenceItemId) => void; onPhotoError: (id: PhotoId) => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: SequenceItemId) => void }) {
  const [visible, setVisible] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = itemRef.current;
    if (!element || typeof IntersectionObserver !== "function") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), { root: null, rootMargin: "320px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <button ref={itemRef} data-sequence-index={index} data-item-id={item.id} role="gridcell" aria-selected={selected} className={selected ? "is-selected" : ""} onPointerDown={(event) => onPointerDown(event, item.id)} onDoubleClick={() => onOpen(item.id)}>{item.kind === "photo" ? visible ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`Item ${index + 1}`} onError={onPhotoError} /> : <div className="thumb-placeholder" aria-hidden="true" /> : <span className="sequence-blank-page">BLANK</span>}<b>{String(index + 1).padStart(2, "0")}</b></button>;
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
function newId(prefix: string): string { return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
