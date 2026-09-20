import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type {
  SequenceId,
  WorktableDraft,
  WorktableEditCommand,
  WorktablePoint,
  WorktableViewport,
  WorktableItemId,
} from "../contracts";
import { screenToWorld } from "../modules/worktable";
import { sequenceStripInsertionIndex } from "../modules/sequence";

type Gesture =
  | { kind: "photo"; pointerId: number; start: WorktablePoint; ids: readonly WorktableItemId[]; startClient: WorktablePoint; moved: boolean }
  | { kind: "pile"; pointerId: number; start: WorktablePoint; ids: readonly SequenceId[]; openOnClick?: SequenceId; moved: boolean; startClient: WorktablePoint }
  | { kind: "pan"; pointerId: number; start: WorktablePoint; viewport: WorktableViewport }
  | { kind: "marquee"; pointerId: number; start: WorktablePoint; additive: boolean }
  | { kind: "resize"; pointerId: number; start: WorktablePoint; photoId: WorktableItemId; width: number }
  | { kind: "resize-pile"; pointerId: number; start: WorktablePoint; sequenceId: SequenceId; width: number; height: number };

const EDGE_PAN_MARGIN = 64;
const EDGE_PAN_MAX_STEP = 18;

export interface TableMarquee {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface TableGestureOptions {
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly draft: WorktableDraft;
  readonly viewport: WorktableViewport;
  readonly setViewport: (viewport: WorktableViewport) => void;
  readonly execute: (command: WorktableEditCommand) => void;
  readonly selectPhoto: (photoId: WorktableItemId, toggle: boolean) => readonly WorktableItemId[] | undefined;
  readonly selectPile: (sequenceId: SequenceId, toggle: boolean) => readonly SequenceId[] | undefined;
  readonly selectPhotos: (photoIds: readonly WorktableItemId[], additive?: boolean) => unknown;
  readonly clearSelection: () => unknown;
  readonly onOpenSequence?: (sequenceId: SequenceId) => void;
  readonly onDropPhotosOnSequence: (photoIds: readonly WorktableItemId[], sequenceId: SequenceId, at?: number) => void;
  readonly disabled?: boolean;
}

export interface TableGesturePreview {
  readonly kind?: Gesture["kind"];
  readonly photoId?: WorktableItemId;
  readonly sequenceId?: SequenceId;
  readonly dragDelta: WorktablePoint;
  readonly resizeScale: number;
  readonly pileResizeScale: number;
  readonly marquee?: TableMarquee;
  readonly targetSequenceId?: SequenceId;
  readonly insertIndex?: number;
}

export function useTableGestures(options: TableGestureOptions) {
  const { stageRef, draft, viewport, setViewport, execute, selectPhoto, selectPile, selectPhotos, clearSelection, onOpenSequence, onDropPhotosOnSequence, disabled = false } = options;
  const [dragDelta, setDragDelta] = useState<WorktablePoint>({ x: 0, y: 0 });
  const [resizeScale, setResizeScale] = useState(1);
  const [pileResizeScale, setPileResizeScale] = useState(1);
  const [marquee, setMarquee] = useState<TableMarquee>();
  const [gestureIdentity, setGestureIdentity] = useState<Pick<TableGesturePreview, "kind" | "photoId" | "sequenceId">>({});
  const [targetSequenceId, setTargetSequenceId] = useState<SequenceId>();
  const [insertIndex, setInsertIndex] = useState<number>();
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const deltaRef = useRef<WorktablePoint>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const viewportRef = useRef(viewport);
  const dragFrameRef = useRef<number | undefined>(undefined);
  const edgePanFrameRef = useRef<number | undefined>(undefined);
  const edgePanPointRef = useRef<{ readonly x: number; readonly y: number } | undefined>(undefined);
  const pendingDragDeltaRef = useRef<WorktablePoint>({ x: 0, y: 0 });
  viewportRef.current = viewport;

  useEffect(() => () => {
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    if (edgePanFrameRef.current !== undefined) cancelAnimationFrame(edgePanFrameRef.current);
  }, []);

  const identify = (gesture?: Gesture) => {
    setGestureIdentity(gesture
      ? {
          kind: gesture.kind,
          photoId: gesture.kind === "resize" ? gesture.photoId : undefined,
          sequenceId: gesture.kind === "resize-pile" ? gesture.sequenceId : undefined,
        }
      : {});
  };

  const startPan = (event: ReactPointerEvent<HTMLElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.focus();
    stage.setPointerCapture(event.pointerId);
    const gesture: Gesture = { kind: "pan", pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, viewport: viewportRef.current };
    gestureRef.current = gesture;
    identify(gesture);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, gesture: Gesture) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.focus();
    stage.setPointerCapture(event.pointerId);
    gestureRef.current = gesture;
    deltaRef.current = { x: 0, y: 0 };
    setDragDelta({ x: 0, y: 0 });
    identify(gesture);
  };

  const onPhotoPointerDown = (event: ReactPointerEvent<HTMLElement>, id: WorktableItemId) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 1 || event.button === 2) return startPan(event);
    if (event.button !== 0 || !stageRef.current) return;
    const ids = selectPhoto(id, event.shiftKey || event.ctrlKey || event.metaKey);
    if (!ids?.length) return;
    beginDrag(event, {
      kind: "photo",
      pointerId: event.pointerId,
      start: screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current.getBoundingClientRect(), viewportRef.current),
      ids,
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    });
  };

  const onGroupPointerDown = (event: ReactPointerEvent<HTMLElement>, ids: readonly WorktableItemId[]) => {
    const movableIds = ids.filter((id) => !draft.placements[id]?.locked);
    if (disabled || event.button !== 0 || !stageRef.current || !movableIds.length) return;
    event.preventDefault();
    event.stopPropagation();
    selectPhotos(movableIds);
    beginDrag(event, {
      kind: "photo",
      pointerId: event.pointerId,
      start: screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current.getBoundingClientRect(), viewportRef.current),
      ids: movableIds,
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    });
  };

  const onPilePointerDown = (event: ReactPointerEvent<HTMLElement>, id: SequenceId) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 1 || event.button === 2) return startPan(event);
    if (event.button !== 0 || !stageRef.current) return;
    const modified = event.shiftKey || event.ctrlKey || event.metaKey;
    const ids = selectPile(id, modified);
    if (!ids?.length) return;
    beginDrag(event, {
      kind: "pile",
      pointerId: event.pointerId,
      start: screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current.getBoundingClientRect(), viewportRef.current),
      ids,
      openOnClick: modified ? undefined : id,
      moved: false,
      startClient: { x: event.clientX, y: event.clientY },
    });
  };

  const onPhotoResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: WorktableItemId) => {
    if (disabled) return;
    const stage = stageRef.current;
    const item = draft.placements[id];
    if (event.button !== 0 || !stage || !item) return;
    event.preventDefault();
    event.stopPropagation();
    stage.setPointerCapture(event.pointerId);
    const gesture: Gesture = {
      kind: "resize",
      pointerId: event.pointerId,
      start: screenToWorld({ x: event.clientX, y: event.clientY }, stage.getBoundingClientRect(), viewportRef.current),
      photoId: id,
      width: item.width,
    };
    gestureRef.current = gesture;
    scaleRef.current = 1;
    identify(gesture);
  };

  const onPileResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: SequenceId,
    renderedSize?: { readonly width: number; readonly height: number },
  ) => {
    if (disabled) return;
    const stage = stageRef.current;
    const pile = draft.pilePlacements[id];
    if (event.button !== 0 || !stage || !pile) return;
    event.preventDefault();
    event.stopPropagation();
    stage.setPointerCapture(event.pointerId);
    const gesture: Gesture = {
      kind: "resize-pile",
      pointerId: event.pointerId,
      start: screenToWorld({ x: event.clientX, y: event.clientY }, stage.getBoundingClientRect(), viewportRef.current),
      sequenceId: id,
      width: renderedSize?.width ?? pile.width,
      height: renderedSize?.height ?? pile.height,
    };
    gestureRef.current = gesture;
    scaleRef.current = 1;
    setPileResizeScale(1);
    identify(gesture);
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.target !== event.currentTarget || !stageRef.current) return;
    if (event.button === 1 || event.button === 2) return startPan(event);
    if (event.button !== 0) return;
    stageRef.current.focus();
    stageRef.current.setPointerCapture(event.pointerId);
    const rect = stageRef.current.getBoundingClientRect();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const gesture: Gesture = { kind: "marquee", pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, additive };
    gestureRef.current = gesture;
    setMarquee({ left: event.clientX - rect.left, top: event.clientY - rect.top, width: 0, height: 0 });
    if (!additive) clearSelection();
    identify(gesture);
  };

  const scheduleEdgePan = () => {
    if (edgePanFrameRef.current !== undefined) return;
    const tick = () => {
      edgePanFrameRef.current = undefined;
      const gesture = gestureRef.current;
      const point = edgePanPointRef.current;
      const stage = stageRef.current;
      if (!gesture || !point || !stage || (gesture.kind !== "photo" && gesture.kind !== "pile")) return;
      const rect = stage.getBoundingClientRect();
      const panX = edgePanStep(point.x, rect.left, rect.right);
      const panY = edgePanStep(point.y, rect.top, rect.bottom);
      if (!panX && !panY) return;
      setViewport({
        ...viewportRef.current,
        originX: viewportRef.current.originX + panX,
        originY: viewportRef.current.originY + panY,
      });
      const world = screenToWorld(point, rect, viewportRef.current);
      const delta = { x: world.x - gesture.start.x, y: world.y - gesture.start.y };
      deltaRef.current = delta;
      pendingDragDeltaRef.current = delta;
      if (dragFrameRef.current === undefined) {
        dragFrameRef.current = requestAnimationFrame(() => {
          dragFrameRef.current = undefined;
          setDragDelta(pendingDragDeltaRef.current);
        });
      }
      edgePanFrameRef.current = requestAnimationFrame(tick);
    };
    edgePanFrameRef.current = requestAnimationFrame(tick);
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const stage = stageRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (gesture.kind === "pan") {
      setViewport({
        ...gesture.viewport,
        originX: gesture.viewport.originX + event.clientX - gesture.start.x,
        originY: gesture.viewport.originY + event.clientY - gesture.start.y,
      });
      return;
    }
    if (gesture.kind === "marquee") {
      setMarquee({
        left: Math.min(gesture.start.x, event.clientX) - rect.left,
        top: Math.min(gesture.start.y, event.clientY) - rect.top,
        width: Math.abs(event.clientX - gesture.start.x),
        height: Math.abs(event.clientY - gesture.start.y),
      });
      return;
    }
    if (gesture.kind === "resize") {
      const item = draft.placements[gesture.photoId];
      if (!item) return;
      const world = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
      scaleRef.current = Math.max(.25, Math.min(4, (world.x - item.x) / gesture.width));
      setResizeScale(scaleRef.current);
      return;
    }
    if (gesture.kind === "resize-pile") {
      const pile = draft.pilePlacements[gesture.sequenceId];
      if (!pile) return;
      const world = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
      scaleRef.current = Math.max(.5, Math.min(2.5, (world.x - pile.x) / gesture.width));
      setPileResizeScale(scaleRef.current);
      return;
    }
    if ((gesture.kind === "pile" || gesture.kind === "photo") && Math.hypot(event.clientX - gesture.startClient.x, event.clientY - gesture.startClient.y) > 5) gesture.moved = true;
    if ((gesture.kind === "photo" || gesture.kind === "pile") && gesture.moved) {
      edgePanPointRef.current = { x: event.clientX, y: event.clientY };
      scheduleEdgePan();
    }
    if (gesture.kind === "photo") {
      const target = gesture.moved ? sequenceDropAt(stage, event.clientX, event.clientY) : undefined;
      setTargetSequenceId(target?.sequenceId);
      setInsertIndex(target?.at);
    }
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

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = gestureRef.current;
    const stage = stageRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !stage) return;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    gestureRef.current = undefined;
    edgePanPointRef.current = undefined;
    if (edgePanFrameRef.current !== undefined) cancelAnimationFrame(edgePanFrameRef.current);
    edgePanFrameRef.current = undefined;
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    const delta = deltaRef.current;
    const moved = gesture.kind === "pile" || gesture.kind === "photo" ? gesture.moved : Math.abs(delta.x) > .25 || Math.abs(delta.y) > .25;
    const sequenceTarget = !cancelled && moved && gesture.kind === "photo" ? sequenceDropAt(stage, event.clientX, event.clientY) : undefined;
    if (sequenceTarget && gesture.kind === "photo") {
      onDropPhotosOnSequence(gesture.ids, sequenceTarget.sequenceId, sequenceTarget.at);
    } else if (!cancelled && moved && gesture.kind === "photo") execute({ type: "move", photoIds: gesture.ids, by: delta });
    if (!cancelled && moved && gesture.kind === "pile") execute({ type: "move-sequence-piles", sequenceIds: gesture.ids, by: delta });
    if (!cancelled && !moved && gesture.kind === "pile" && gesture.openOnClick) onOpenSequence?.(gesture.openOnClick);
    if (!cancelled && gesture.kind === "resize" && Math.abs(scaleRef.current - 1) > .01) execute({ type: "resize", photoIds: [gesture.photoId], scale: scaleRef.current });
    if (!cancelled && gesture.kind === "resize-pile" && Math.abs(scaleRef.current - 1) > .01) execute({
      type: "resize-sequence-pile",
      sequenceId: gesture.sequenceId,
      scale: scaleRef.current,
      baseSize: { width: gesture.width, height: gesture.height },
    });
    if (!cancelled && gesture.kind === "marquee") {
      const rect = stage.getBoundingClientRect();
      const a = screenToWorld(gesture.start, rect, viewportRef.current);
      const b = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
      const box = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
      const hits = draft.entryOrder.filter((id) => {
        const item = draft.placements[id];
        const width = Math.max(0, Math.min(box.right, item.x + item.width) - Math.max(box.left, item.x));
        const height = Math.max(0, Math.min(box.bottom, item.y + item.height) - Math.max(box.top, item.y));
        return width * height / (item.width * item.height) >= .3;
      });
      selectPhotos(hits, gesture.additive);
    }
    deltaRef.current = { x: 0, y: 0 };
    scaleRef.current = 1;
    setDragDelta({ x: 0, y: 0 });
    setResizeScale(1);
    setPileResizeScale(1);
    setMarquee(undefined);
    setTargetSequenceId(undefined);
    setInsertIndex(undefined);
    identify(undefined);
  };

  const cancelActiveGesture = () => {
    const gesture = gestureRef.current;
    const stage = stageRef.current;
    if (!gesture || !stage) return false;
    if (stage.hasPointerCapture(gesture.pointerId)) stage.releasePointerCapture(gesture.pointerId);
    gestureRef.current = undefined;
    edgePanPointRef.current = undefined;
    if (edgePanFrameRef.current !== undefined) cancelAnimationFrame(edgePanFrameRef.current);
    edgePanFrameRef.current = undefined;
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    deltaRef.current = { x: 0, y: 0 };
    scaleRef.current = 1;
    setDragDelta({ x: 0, y: 0 });
    setResizeScale(1);
    setPileResizeScale(1);
    setMarquee(undefined);
    setTargetSequenceId(undefined);
    setInsertIndex(undefined);
    identify(undefined);
    return true;
  };

  return {
    preview: {
      ...gestureIdentity,
      dragDelta,
      resizeScale,
      pileResizeScale,
      marquee,
      targetSequenceId,
      insertIndex,
    } satisfies TableGesturePreview,
    onPhotoPointerDown,
    onGroupPointerDown,
    onPilePointerDown,
    onPhotoResizePointerDown,
    onPileResizePointerDown,
    onStagePointerDown,
    onStagePointerMove,
    finishGesture,
    cancelActiveGesture,
  };
}

function edgePanStep(point: number, start: number, end: number): number {
  if (point < start + EDGE_PAN_MARGIN) return Math.round(EDGE_PAN_MAX_STEP * Math.min(1, (start + EDGE_PAN_MARGIN - point) / EDGE_PAN_MARGIN));
  if (point > end - EDGE_PAN_MARGIN) return -Math.round(EDGE_PAN_MAX_STEP * Math.min(1, (point - (end - EDGE_PAN_MARGIN)) / EDGE_PAN_MARGIN));
  return 0;
}

function sequenceDropAt(stage: HTMLElement, clientX: number, clientY: number): { sequenceId: SequenceId; at?: number } | undefined {
  const tray = stage.querySelector<HTMLElement>("[data-sequence-insert-tray]");
  if (tray) {
    const rect = tray.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return {
        sequenceId: tray.dataset.sequenceId as SequenceId,
        at: sequenceStripInsertionIndex(clientX, rect.left, tray.scrollLeft, Number(tray.dataset.itemCount), 12, 72, 10),
      };
    }
  }
  const piles = [...stage.querySelectorAll<HTMLElement>("[data-sequence-pile-id]")]
    .sort((left, right) => Number(right.style.zIndex) - Number(left.style.zIndex));
  const pile = piles.find((pile) => {
    const rect = pile.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  });
  return pile ? { sequenceId: pile.dataset.sequencePileId as SequenceId } : undefined;
}
