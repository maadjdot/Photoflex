import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  PhotoId,
  ProjectId,
  SequenceDraft,
  SequenceItem,
  SequenceItemId,
  SourceError,
  WorktableAlignment,
  WorktableDraft,
  WorktableEditCommand,
  WorktableEditor,
  WorktablePoint,
  WorktableViewport,
} from "../contracts";
import {
  clampWorktableZoom,
  createWorktableEditor,
  screenToWorld,
  zoomAroundScreenPoint,
} from "../modules/worktable";
import { createSequenceEditor } from "../modules/sequence";
import type { AppDependencies } from "./dependencies";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { useProjectWorkspace } from "./useProjectWorkspace";

const DEFAULT_VIEWPORT: WorktableViewport = { originX: 48, originY: 38, zoom: 1 };
const MARQUEE_OVERLAP = .3;

type Gesture =
  | {
      readonly kind: "drag";
      readonly pointerId: number;
      readonly startWorld: WorktablePoint;
      readonly photoIds: readonly PhotoId[];
    }
  | {
      readonly kind: "pan";
      readonly pointerId: number;
      readonly startScreen: WorktablePoint;
      readonly startViewport: WorktableViewport;
    }
  | {
      readonly kind: "marquee";
      readonly pointerId: number;
      readonly startScreen: WorktablePoint;
      readonly additive: boolean;
    }
  | {
      readonly kind: "resize";
      readonly pointerId: number;
      readonly photoId: PhotoId;
      readonly startWorld: WorktablePoint;
      readonly startWidth: number;
    };

interface MarqueeRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function TablePage({
  dependencies,
  projectId,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { workspace, save, loading, error } = useProjectWorkspace(dependencies, projectId);
  const [draft, setDraft] = useState<WorktableDraft>();
  const [sequenceDraft, setSequenceDraft] = useState<SequenceDraft>();
  const [selected, setSelected] = useState<Set<PhotoId>>(new Set());
  const [viewport, setViewportState] = useState<WorktableViewport>(DEFAULT_VIEWPORT);
  const [dragDelta, setDragDelta] = useState<WorktablePoint>({ x: 0, y: 0 });
  const [resizeScale, setResizeScale] = useState(1);
  const [marquee, setMarquee] = useState<MarqueeRect>();
  const [missing, setMissing] = useState<Set<PhotoId>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [previewPhotoId, setPreviewPhotoId] = useState<PhotoId>();
  const [comparePhotoIds, setComparePhotoIds] = useState<readonly [PhotoId, PhotoId]>();
  const [sequenceConfirmation, setSequenceConfirmation] = useState<readonly PhotoId[]>();
  const [sequenceCollapsed, setSequenceCollapsed] = useState(false);
  const [sequenceDragId, setSequenceDragId] = useState<SequenceItemId>();
  const [alignment, setAlignment] = useState<WorktableAlignment | "">("");
  const stageRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<WorktableEditor | undefined>(undefined);
  const sequenceItemRefs = useRef(new Map<SequenceItemId, HTMLButtonElement>());
  const sequenceItemPositionsRef = useRef(new Map<SequenceItemId, { readonly left: number; readonly top: number }>());
  const initializedProjectRef = useRef<ProjectId | undefined>(undefined);
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const dragDeltaRef = useRef<WorktablePoint>({ x: 0, y: 0 });
  const resizeScaleRef = useRef(1);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // FLIP animation: after Sequence order changes, each persistent DOM card
  // animates from its old screen position to its new position.
  useLayoutEffect(() => {
    const nextPositions = new Map<SequenceItemId, { readonly left: number; readonly top: number }>();
    for (const [itemId, element] of sequenceItemRefs.current) {
      const next = element.getBoundingClientRect();
      const previous = sequenceItemPositionsRef.current.get(itemId);
      const deltaX = previous ? previous.left - next.left : 0;
      const deltaY = previous ? previous.top - next.top : 0;
      if ((deltaX || deltaY) && typeof element.animate === "function") {
        element.animate([
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ], { duration: 220, easing: "cubic-bezier(.2,.75,.25,1)" });
      }
      nextPositions.set(itemId, { left: next.left, top: next.top });
    }
    sequenceItemPositionsRef.current = nextPositions;
  }, [sequenceDraft?.items]);

  const setViewport = useCallback((next: WorktableViewport) => {
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  useEffect(() => {
    if (!workspace || initializedProjectRef.current === projectId) return;
    initializedProjectRef.current = projectId;
    const editor = createWorktableEditor(workspace.worktableDraft);
    editorRef.current = editor;
    setDraft(editor.snapshot());
    setSequenceDraft(workspace.sequenceDraft);
    const restored = workspace.resumeContext?.page === "table"
      ? workspace.resumeContext.tableViewport
      : undefined;
    setViewport(restored ?? DEFAULT_VIEWPORT);
    void save((current) => ({
      ...current,
      lastOpenedAt: new Date().toISOString(),
      resumeContext: {
        page: "table",
        filter: "all",
        tableViewport: restored ?? DEFAULT_VIEWPORT,
      },
    }));
  }, [projectId, save, setViewport, workspace]);

  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => {
      void save((current) => ({
        ...current,
        resumeContext: { page: "table", filter: "all", tableViewport: viewportRef.current },
      }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft?.projectId, save, viewport]);

  const persistDraft = useCallback(async (next: WorktableDraft) => {
    const saved = await save((current) => ({
      ...current,
      worktableDraft: next,
      updatedAt: new Date().toISOString(),
    }));
    setNotice(saved ? undefined : "桌面状态未能保存，请刷新后重试。");
  }, [save]);

  const execute = useCallback((command: WorktableEditCommand) => {
    const result = editorRef.current?.execute(command);
    if (!result) return;
    if (!result.ok) {
      setNotice("该桌面操作无法完成，照片状态可能已经变化。");
      return;
    }
    setDraft(result.value);
    void persistDraft(result.value);
  }, [persistDraft]);

  const history = useCallback((direction: "undo" | "redo") => {
    const editor = editorRef.current;
    if (!editor) return;
    if (direction === "undo" && !editor.canUndo()) return;
    if (direction === "redo" && !editor.canRedo()) return;
    const next = direction === "undo" ? editor.undo() : editor.redo();
    setDraft(next);
    setSelected((current) => new Set([...current].filter((photoId) => next.placements[photoId])));
    void persistDraft(next);
  }, [persistDraft]);

  const commitToSequence = useCallback(async (photoIds: readonly PhotoId[]) => {
    if (!photoIds.length) return;
    let nextDraft: SequenceDraft | undefined;
    const saved = await save((current) => {
      const existingPhotoIds = new Set(current.sequenceDraft.items.map((item) => item.photoId));
      const additions: SequenceItem[] = photoIds
        .filter((photoId) => !existingPhotoIds.has(photoId))
        .map((photoId) => ({ id: sequenceItemId() as SequenceItemId, photoId }));
      const editor = createSequenceEditor(current.sequenceDraft);
      const result = editor.execute({ type: "add", items: additions });
      if (!result.ok) return current;
      nextDraft = result.value;
      return { ...current, sequenceDraft: result.value, updatedAt: new Date().toISOString() };
    });
    if (!saved || !nextDraft) {
      setNotice("无法加入 Sequence，请重试。");
      return;
    }
    setSequenceDraft(nextDraft);
    setSequenceConfirmation(undefined);
    setNotice("照片已加入 Sequence。");
  }, [save]);

  const requestSequence = (photoIds: readonly PhotoId[]) => {
    const ordered = draft?.entryOrder.filter((photoId) => photoIds.includes(photoId)) ?? [];
    if (ordered.length === 1) {
      void commitToSequence(ordered);
      return;
    }
    if (ordered.length > 1) setSequenceConfirmation(ordered);
  };

  const reorderSequence = async (itemId: SequenceItemId, to: number) => {
    let nextDraft: SequenceDraft | undefined;
    const saved = await save((current) => {
      const editor = createSequenceEditor(current.sequenceDraft);
      const result = editor.execute({ type: "move", itemIds: [itemId], to });
      if (!result.ok) return current;
      nextDraft = result.value;
      return { ...current, sequenceDraft: result.value, updatedAt: new Date().toISOString() };
    });
    if (saved && nextDraft) setSequenceDraft(nextDraft);
  };

  const selectedIds = useMemo(
    () => draft?.entryOrder.filter((photoId) => selected.has(photoId)) ?? [],
    [draft, selected],
  );

  const onPhotoError = useCallback((photoId: PhotoId, photoError: SourceError) => {
    if (photoError.kind === "photo-not-found" || photoError.kind === "preview-unavailable") {
      setMissing((current) => current.has(photoId) ? current : new Set([...current, photoId]));
    }
  }, []);

  const startPan = (event: ReactPointerEvent<HTMLElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.focus();
    stage.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startScreen: { x: event.clientX, y: event.clientY },
      startViewport: viewportRef.current,
    };
  };

  const onCardPointerDown = (event: ReactPointerEvent<HTMLElement>, photoId: PhotoId) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 2) {
      startPan(event);
      return;
    }
    if (event.button !== 0 || !stageRef.current) return;
    stageRef.current.focus();
    const toggle = event.shiftKey || event.metaKey || event.ctrlKey;
    let dragIds: readonly PhotoId[];
    if (toggle) {
      const next = new Set(selected);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      setSelected(next);
      if (!next.has(photoId)) return;
      dragIds = [...next];
    } else if (selected.has(photoId)) {
      dragIds = [...selected];
    } else {
      setSelected(new Set([photoId]));
      dragIds = [photoId];
    }
    const rect = stageRef.current.getBoundingClientRect();
    stageRef.current.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind: "drag",
      pointerId: event.pointerId,
      startWorld: screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current),
      photoIds: dragIds,
    };
    dragDeltaRef.current = { x: 0, y: 0 };
    setDragDelta({ x: 0, y: 0 });
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, photoId: PhotoId) => {
    const stage = stageRef.current;
    const item = draft?.placements[photoId];
    if (event.button !== 0 || !stage || !item) return;
    event.preventDefault();
    event.stopPropagation();
    stage.focus();
    stage.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind: "resize",
      pointerId: event.pointerId,
      photoId,
      startWorld: screenToWorld({ x: event.clientX, y: event.clientY }, stage.getBoundingClientRect(), viewportRef.current),
      startWidth: item.width,
    };
    resizeScaleRef.current = 1;
    setResizeScale(1);
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !stageRef.current) return;
    if (event.button === 2) {
      startPan(event);
      return;
    }
    if (event.button !== 0) return;
    stageRef.current.focus();
    stageRef.current.setPointerCapture(event.pointerId);
    const rect = stageRef.current.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    gestureRef.current = {
      kind: "marquee",
      pointerId: event.pointerId,
      startScreen: start,
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
    };
    setMarquee({ left: start.x - rect.left, top: start.y - rect.top, width: 0, height: 0 });
    if (!(event.shiftKey || event.metaKey || event.ctrlKey)) setSelected(new Set());
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const stage = stageRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (gesture.kind === "pan") {
      setViewport({
        ...gesture.startViewport,
        originX: gesture.startViewport.originX + event.clientX - gesture.startScreen.x,
        originY: gesture.startViewport.originY + event.clientY - gesture.startScreen.y,
      });
      return;
    }
    if (gesture.kind === "marquee") {
      const left = Math.min(gesture.startScreen.x, event.clientX);
      const top = Math.min(gesture.startScreen.y, event.clientY);
      setMarquee({
        left: left - rect.left,
        top: top - rect.top,
        width: Math.abs(event.clientX - gesture.startScreen.x),
        height: Math.abs(event.clientY - gesture.startScreen.y),
      });
      return;
    }
    if (gesture.kind === "resize") {
      const item = draft?.placements[gesture.photoId];
      if (!item) return;
      const current = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
      const nextScale = Math.max(.25, Math.min(4, (current.x - item.x) / gesture.startWidth));
      resizeScaleRef.current = nextScale;
      setResizeScale(nextScale);
      return;
    }

    let nextViewport = viewportRef.current;
    const edge = 36;
    const panStep = 10;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const panX = localX < edge ? panStep : localX > rect.width - edge ? -panStep : 0;
    const panY = localY < edge ? panStep : localY > rect.height - edge ? -panStep : 0;
    if (panX || panY) {
      nextViewport = {
        ...nextViewport,
        originX: nextViewport.originX + panX,
        originY: nextViewport.originY + panY,
      };
      setViewport(nextViewport);
    }
    const current = screenToWorld({ x: event.clientX, y: event.clientY }, rect, nextViewport);
    const delta = {
      x: current.x - gesture.startWorld.x,
      y: current.y - gesture.startWorld.y,
    };
    dragDeltaRef.current = delta;
    setDragDelta(delta);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = gestureRef.current;
    const stage = stageRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !stage) return;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    gestureRef.current = undefined;

    if (!cancelled && gesture.kind === "drag") {
      const delta = dragDeltaRef.current;
      if (Math.abs(delta.x) > .25 || Math.abs(delta.y) > .25) {
        execute({ type: "move", photoIds: gesture.photoIds, by: delta });
      }
    }
    if (!cancelled && gesture.kind === "resize" && Math.abs(resizeScaleRef.current - 1) > .01) {
      execute({ type: "resize", photoIds: [gesture.photoId], scale: resizeScaleRef.current });
    }
    if (!cancelled && gesture.kind === "marquee" && draft) {
      const rect = stage.getBoundingClientRect();
      const start = screenToWorld(gesture.startScreen, rect, viewportRef.current);
      const end = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
      const bounds = {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        right: Math.max(start.x, end.x),
        bottom: Math.max(start.y, end.y),
      };
      const hits = draft.entryOrder.filter((photoId) => {
        const item = draft.placements[photoId];
        const overlapWidth = Math.max(0, Math.min(bounds.right, item.x + item.width) - Math.max(bounds.left, item.x));
        const overlapHeight = Math.max(0, Math.min(bounds.bottom, item.y + item.height) - Math.max(bounds.top, item.y));
        return overlapWidth * overlapHeight / (item.width * item.height) >= MARQUEE_OVERLAP;
      });
      setSelected((current) => gesture.additive ? new Set([...current, ...hits]) : new Set(hits));
    }
    dragDeltaRef.current = { x: 0, y: 0 };
    setDragDelta({ x: 0, y: 0 });
    resizeScaleRef.current = 1;
    setResizeScale(1);
    setMarquee(undefined);
  };

  const zoomAtCenter = (nextZoom: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    setViewport(zoomAroundScreenPoint(
      viewportRef.current,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      rect,
      nextZoom,
    ));
  };

  const fitTable = () => {
    const stage = stageRef.current;
    if (!stage || !draft?.entryOrder.length) {
      setViewport(DEFAULT_VIEWPORT);
      return;
    }
    const cards = draft.entryOrder.map((photoId) => draft.placements[photoId]);
    const minX = Math.min(...cards.map((item) => item.x));
    const minY = Math.min(...cards.map((item) => item.y));
    const maxX = Math.max(...cards.map((item) => item.x + item.width));
    const maxY = Math.max(...cards.map((item) => item.y + item.height));
    const padding = 64;
    const zoom = clampWorktableZoom(Math.min(
      (stage.clientWidth - padding * 2) / Math.max(1, maxX - minX),
      (stage.clientHeight - padding * 2) / Math.max(1, maxY - minY),
    ));
    setViewport({
      zoom,
      originX: (stage.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom,
      originY: (stage.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom,
    });
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onNativeWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      // React's wheel listener may be passive. Cancel natively so this gesture
      // belongs to the Table instead of changing the browser page zoom.
      event.preventDefault();
      event.stopPropagation();
      setViewport(zoomAroundScreenPoint(
        viewportRef.current,
        { x: event.clientX, y: event.clientY },
        stage.getBoundingClientRect(),
        viewportRef.current.zoom * Math.exp(-event.deltaY * .002),
      ));
    };
    stage.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onNativeWheel);
  }, [draft?.projectId, setViewport]);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    setViewport({
      ...viewportRef.current,
      originX: viewportRef.current.originX - event.deltaX,
      originY: viewportRef.current.originY - event.deltaY,
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelected(new Set(draft?.entryOrder ?? []));
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      history(event.shiftKey ? "redo" : "undo");
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      history("redo");
    }
    if (event.key === "Escape") setSelected(new Set());
    if (event.key.toLowerCase() === "g" && selectedIds.length > 1) execute({ type: "create-group", photoIds: selectedIds });
    if (event.key.toLowerCase() === "l" && selectedIds.length >= 2 && selectedIds.length <= 6) execute({ type: "create-link", photoIds: selectedIds });
    if (event.key.toLowerCase() === "j" && selectedIds.length === 2) setComparePhotoIds([selectedIds[0], selectedIds[1]]);
    if (event.key.toLowerCase() === "s" && selectedIds.length) requestSequence(selectedIds);
    if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length) {
      event.preventDefault();
      execute({ type: "remove", photoIds: selectedIds });
      setSelected(new Set());
    }
  };

  if (loading || !draft) return <main className="page centered-state"><div className="loading-mark" /><p>Loading table…</p></main>;
  if (!workspace) return <main className="page centered-state"><h1>{error ?? "Table 无法读取。"}</h1></main>;

  const arrange = (command: WorktableEditCommand) => selectedIds.length > 1 && execute(command);
  const firstSource = workspace.sources.find((source) => !source.removedAt);
  const selectedGroup = draft.groups.find((group) => group.photoIds.length === selectedIds.length && group.photoIds.every((photoId) => selected.has(photoId)));
  const singleSelectedGroup = selectedIds.length === 1 ? draft.groups.find((group) => group.photoIds.includes(selectedIds[0])) : undefined;
  const canCreateGroup = selectedIds.length > 1 && selectedIds.every((photoId) => !draft.groups.some((group) => group.photoIds.includes(photoId)));
  const canJoinGroup = selectedIds.length === 1 && !singleSelectedGroup && draft.groups.length > 0;
  const activeSequence = sequenceDraft ?? workspace.sequenceDraft;

  return (
    <main className="table-page page">
      <div className="table-toolbar" aria-label="Table 工具栏">
        <strong>TABLE</strong>
        <span className="table-toolbar-divider" />
        <span className="table-project-name" title={workspace.name}>{workspace.name}</span>
        <span className="table-toolbar-divider" />
        <button disabled={!editorRef.current?.canUndo()} onClick={() => history("undo")}>Undo</button>
        <button disabled={!editorRef.current?.canRedo()} onClick={() => history("redo")}>Redo</button>
        <button disabled={!selectedIds.length} onClick={() => requestSequence(selectedIds)}>Sequence</button>
        <button disabled={!selectedGroup && !canCreateGroup} onClick={() => selectedGroup ? execute({ type: "remove-group", groupId: selectedGroup.id }) : execute({ type: "create-group", photoIds: selectedIds })}>{selectedGroup ? "Ungroup" : "Group"}</button>
        <button aria-label="Remove selected photo" title="Leave Group" disabled={!singleSelectedGroup} onClick={() => singleSelectedGroup && execute({ type: "remove-from-group", photoId: selectedIds[0] })}>Leave</button>
        <label className="table-align-control">
          <span className="sr-only">Add selected photo to group</span>
          <select value="" disabled={!canJoinGroup} onChange={(event) => {
            if (event.target.value && selectedIds[0]) execute({ type: "add-to-group", groupId: event.target.value, photoId: selectedIds[0] });
          }}>
            <option value="" disabled>Add to Group</option>
            {draft.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <button disabled={selectedIds.length < 2 || selectedIds.length > 6} onClick={() => execute({ type: "create-link", photoIds: selectedIds })}>Link</button>
        <button disabled={selectedIds.length !== 2} onClick={() => setComparePhotoIds([selectedIds[0], selectedIds[1]])}>Compare</button>
        <button disabled={selectedIds.length !== 1} onClick={() => selectedIds[0] && setPreviewPhotoId(selectedIds[0])}>Preview</button>
        <button disabled={selectedIds.length < 2} onClick={() => arrange({ type: "arrange", photoIds: selectedIds, layout: { type: "grid" } })}>Grid</button>
        <button disabled={selectedIds.length < 2} onClick={() => arrange({ type: "arrange", photoIds: selectedIds, layout: { type: "row" } })}>Row</button>
        <label className="table-align-control">
          <span className="sr-only">Align selection</span>
          <select value={alignment} disabled={selectedIds.length < 2} onChange={(event) => {
            const edge = event.target.value as WorktableAlignment;
            arrange({ type: "arrange", photoIds: selectedIds, layout: { type: "align", edge } });
            setAlignment("");
          }}>
            <option value="" disabled>Align</option>
            <option value="left">Align left</option>
            <option value="center-x">Align center</option>
            <option value="right">Align right</option>
            <option value="top">Align top</option>
            <option value="center-y">Align middle</option>
            <option value="bottom">Align bottom</option>
          </select>
        </label>
        <button disabled={!selectedIds.length} onClick={() => execute({ type: "bring-to-front", photoIds: selectedIds })}>Front</button>
        <button disabled={!selectedIds.length} onClick={() => { execute({ type: "remove", photoIds: selectedIds }); setSelected(new Set()); }}>Remove</button>
        <span className="table-toolbar-spacer" />
        <span>{selectedIds.length ? `${selectedIds.length} selected` : `${draft.entryOrder.length} photos`}</span>
        <button onClick={fitTable}>Fit</button>
        <button onClick={() => zoomAtCenter(viewport.zoom - .25)} disabled={viewport.zoom <= .25} aria-label="缩小桌面">−</button>
        <span className="table-zoom-label">{Math.round(viewport.zoom * 100)}%</span>
        <button onClick={() => zoomAtCenter(viewport.zoom + .25)} disabled={viewport.zoom >= 3} aria-label="放大桌面">＋</button>
      </div>
      {notice && <p className="table-notice" role="status">{notice}</p>}
      <div
        ref={stageRef}
        className="worktable-stage"
        tabIndex={0}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={(event) => finishPointer(event)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onWheel={onWheel}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        aria-label="Photo worktable"
      >
        <div
          className="worktable-world"
          style={{ transform: `translate3d(${viewport.originX}px, ${viewport.originY}px, 0) scale(${viewport.zoom})` }}
        >
          <svg className="worktable-links" aria-hidden="true">
            {draft.links.flatMap((link) => link.photoIds.slice(1).map((photoId, index) => {
              const from = draft.placements[link.photoIds[index]];
              const to = draft.placements[photoId];
              return <line key={`${link.id}-${photoId}`} x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} />;
            }))}
          </svg>
          {draft.groups.map((group) => {
            const bounds = groupBounds(draft, group.photoIds);
            return <div key={group.id} className="worktable-group-frame" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}><span>{group.name} · {group.photoIds.length}</span></div>;
          })}
          {draft.entryOrder.map((photoId) => {
            const item = draft.placements[photoId];
            const isSelected = selected.has(photoId);
            const preview = isSelected && gestureRef.current?.kind === "drag" ? dragDelta : { x: 0, y: 0 };
            const visualScale = gestureRef.current?.kind === "resize" && gestureRef.current.photoId === photoId ? resizeScale : 1;
            const sequenceIndex = activeSequence.items.findIndex((item) => item.photoId === photoId);
            return (
              <article
                key={photoId}
                className={`worktable-card${isSelected ? " is-selected" : ""}${missing.has(photoId) ? " is-missing" : ""}`}
                style={{
                  width: item.width * visualScale,
                  height: item.height * visualScale,
                  zIndex: item.z,
                  transform: `translate3d(${item.x + preview.x}px, ${item.y + preview.y}px, 0)`,
                }}
                onPointerDown={(event) => onCardPointerDown(event, photoId)}
                onDoubleClick={(event) => { event.stopPropagation(); setPreviewPhotoId(photoId); }}
                aria-label={`${item.filename}${isSelected ? "，已选择" : ""}`}
              >
                <div className="worktable-photo" style={{ height: item.height * visualScale }}>
                  <PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt={item.filename} onError={onPhotoError} eager resolution="full" />
                  {missing.has(photoId) && <span className="worktable-missing">MISSING</span>}
                  {sequenceIndex >= 0 && <span className="worktable-sequence-number">S{String(sequenceIndex + 1).padStart(2, "0")}</span>}
                </div>
                {isSelected && selectedIds.length === 1 && (
                  <button className="worktable-resize-handle" onPointerDown={(event) => onResizePointerDown(event, photoId)} aria-label="Resize photo" />
                )}
              </article>
            );
          })}
        </div>
        {marquee && <div className="worktable-marquee" style={marquee} />}
        {!draft.entryOrder.length && (
          <section className="worktable-empty">
            <span>EMPTY TABLE</span>
            <h1>Bring photographs here to think with them.</h1>
            <p>Select photographs in Contact Sheet, then choose Place on Table.</p>
            <button className="button button-primary" onClick={() => firstSource
              ? navigate({ name: "contact-sheet", projectId, sourceId: firstSource.id })
              : navigate({ name: "project", projectId })}
            >{firstSource ? "Open Contact Sheet" : "Add a photo folder"}</button>
          </section>
        )}
      </div>
      {sequenceConfirmation && (
        <section className="sequence-confirmation" role="dialog" aria-label="Confirm Sequence order">
          <span>Add {sequenceConfirmation.length} photos in Table entry order?</span>
          <div><button onClick={() => setSequenceConfirmation(undefined)}>Cancel</button><button className="button button-primary" onClick={() => void commitToSequence(sequenceConfirmation)}>Add to Sequence</button></div>
        </section>
      )}
      <section className={`sequence-strip${sequenceCollapsed ? " is-collapsed" : ""}`} aria-label="Sequence Order">
        <header>
          <button onClick={() => setSequenceCollapsed((value) => !value)} aria-label={sequenceCollapsed ? "Expand Sequence Order" : "Collapse Sequence Order"}>{sequenceCollapsed ? "↑" : "↓"}</button>
          <strong>SEQUENCE ORDER</strong><span>{activeSequence.items.length} photos</span><small>drag to reorder</small>
        </header>
        {!sequenceCollapsed && <div className="sequence-strip-items">
          {activeSequence.items.map((item, index) => {
            const placement = draft.placements[item.photoId];
            return <button
              key={item.id}
              ref={(element) => {
                if (element) sequenceItemRefs.current.set(item.id, element);
                else sequenceItemRefs.current.delete(item.id);
              }}
              className={`sequence-strip-item${sequenceDragId === item.id ? " is-dragging" : ""}`}
              draggable
              onDragStart={() => setSequenceDragId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); if (sequenceDragId) void reorderSequence(sequenceDragId, index); setSequenceDragId(undefined); }}
              onDragEnd={() => setSequenceDragId(undefined)}
              onClick={() => setSelected(new Set([item.photoId]))}
              aria-label={`Sequence ${index + 1}`}
            ><PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={placement?.filename ?? `Sequence ${index + 1}`} onError={onPhotoError} /><span>{String(index + 1).padStart(2, "0")}</span></button>;
          })}
        </div>}
      </section>
      {previewPhotoId && draft.placements[previewPhotoId] && (
        <TablePreviewOverlay
          photoId={previewPhotoId}
          filename={draft.placements[previewPhotoId].filename}
          photoSource={dependencies.photoSource}
          onClose={() => setPreviewPhotoId(undefined)}
          onPhotoSourceError={onPhotoError}
        />
      )}
      {comparePhotoIds && <CompareOverlay photoIds={comparePhotoIds} draft={draft} photoSource={dependencies.photoSource} onClose={() => setComparePhotoIds(undefined)} />}
    </main>
  );
}

function TablePreviewOverlay({
  photoId,
  filename,
  photoSource,
  onClose,
  onPhotoSourceError,
}: {
  readonly photoId: PhotoId;
  readonly filename: string;
  readonly photoSource: AppDependencies["photoSource"];
  readonly onClose: () => void;
  readonly onPhotoSourceError: (photoId: PhotoId, error: SourceError) => void;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let lease: { readonly url: string; release(): void } | undefined;
    void photoSource.preview(photoId).then((result) => {
      if (!result.ok) {
        if (active) onPhotoSourceError(photoId, result.error);
        return;
      }
      if (!active) {
        result.value.release();
        return;
      }
      lease = result.value;
      setUrl(lease.url);
    });
    return () => { active = false; lease?.release(); };
  }, [onPhotoSourceError, photoId, photoSource]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="table-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${filename}`} onPointerDown={onClose}>
      <section className="table-preview-dialog" onPointerDown={(event) => event.stopPropagation()}>
        <header><span>{filename}</span><button autoFocus onClick={onClose} aria-label="Close preview">×</button></header>
        <div className="table-preview-image-wrap">
          {url ? <img src={url} alt={filename} /> : <div className="preview-placeholder">Preview unavailable</div>}
        </div>
      </section>
    </div>
  );
}

function CompareOverlay({
  photoIds,
  draft,
  photoSource,
  onClose,
}: {
  readonly photoIds: readonly [PhotoId, PhotoId];
  readonly draft: WorktableDraft;
  readonly photoSource: AppDependencies["photoSource"];
  readonly onClose: () => void;
}) {
  const [order, setOrder] = useState(photoIds);
  const [urls, setUrls] = useState<readonly string[]>([]);
  useEffect(() => {
    let active = true;
    const leases: Array<{ release(): void }> = [];
    void Promise.all(order.map((photoId) => photoSource.preview(photoId))).then((results) => {
      if (!active) {
        results.forEach((result) => { if (result.ok) result.value.release(); });
        return;
      }
      const loaded = results.flatMap((result) => result.ok ? [result.value] : []);
      leases.push(...loaded);
      setUrls(results.map((result) => result.ok ? result.value.url : ""));
    });
    return () => { active = false; leases.forEach((lease) => lease.release()); };
  }, [order, photoSource]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="compare-backdrop" role="dialog" aria-modal="true" aria-label="Compare two photos">
    <header><span>COMPARE</span><button onClick={() => setOrder([order[1], order[0]])}>Swap</button><button onClick={onClose} aria-label="Close compare">×</button></header>
    <div className="compare-images">{order.map((photoId, index) => <figure key={photoId}><span>{index === 0 ? "A" : "B"}</span>{urls[index] ? <img src={urls[index]} alt={draft.placements[photoId].filename} /> : <div className="preview-placeholder">Preview unavailable</div>}</figure>)}</div>
  </div>;
}

function groupBounds(draft: WorktableDraft, photoIds: readonly PhotoId[]) {
  const placements = photoIds.map((photoId) => draft.placements[photoId]);
  const padding = 24;
  const left = Math.min(...placements.map((item) => item.x)) - padding;
  const top = Math.min(...placements.map((item) => item.y)) - padding;
  const right = Math.max(...placements.map((item) => item.x + item.width)) + padding;
  const bottom = Math.max(...placements.map((item) => item.y + item.height)) + padding;
  return { left, top, width: right - left, height: bottom - top };
}

function sequenceItemId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sequence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
