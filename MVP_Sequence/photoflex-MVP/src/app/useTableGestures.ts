import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type {
  PhotoId,
  SequenceId,
  WorktableDraft,
  WorktableEditCommand,
  WorktablePoint,
  WorktableViewport,
} from "../contracts";
import { screenToWorld } from "../modules/worktable";

type Gesture =
  | { kind: "photo"; pointerId: number; start: WorktablePoint; ids: readonly PhotoId[] }
  | { kind: "pile"; pointerId: number; start: WorktablePoint; ids: readonly SequenceId[] }
  | { kind: "pan"; pointerId: number; start: WorktablePoint; viewport: WorktableViewport }
  | { kind: "marquee"; pointerId: number; start: WorktablePoint; additive: boolean }
  | { kind: "resize"; pointerId: number; start: WorktablePoint; photoId: PhotoId; width: number }
  | { kind: "resize-pile"; pointerId: number; start: WorktablePoint; sequenceId: SequenceId; width: number };

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
  readonly selectPhoto: (photoId: PhotoId, toggle: boolean) => readonly PhotoId[] | undefined;
  readonly selectPile: (sequenceId: SequenceId, toggle: boolean) => readonly SequenceId[] | undefined;
  readonly selectPhotos: (photoIds: readonly PhotoId[], additive?: boolean) => unknown;
  readonly clearSelection: () => unknown;
  readonly disabled?: boolean;
}

export interface TableGesturePreview {
  readonly kind?: Gesture["kind"];
  readonly photoId?: PhotoId;
  readonly sequenceId?: SequenceId;
  readonly dragDelta: WorktablePoint;
  readonly resizeScale: number;
  readonly pileResizeScale: number;
  readonly marquee?: TableMarquee;
}

export function useTableGestures(options: TableGestureOptions) {
  const { stageRef, draft, viewport, setViewport, execute, selectPhoto, selectPile, selectPhotos, clearSelection, disabled = false } = options;
  const [dragDelta, setDragDelta] = useState<WorktablePoint>({ x: 0, y: 0 });
  const [resizeScale, setResizeScale] = useState(1);
  const [pileResizeScale, setPileResizeScale] = useState(1);
  const [marquee, setMarquee] = useState<TableMarquee>();
  const [gestureIdentity, setGestureIdentity] = useState<Pick<TableGesturePreview, "kind" | "photoId" | "sequenceId">>({});
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const deltaRef = useRef<WorktablePoint>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const viewportRef = useRef(viewport);
  const dragFrameRef = useRef<number | undefined>(undefined);
  const pendingDragDeltaRef = useRef<WorktablePoint>({ x: 0, y: 0 });
  viewportRef.current = viewport;

  useEffect(() => () => {
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
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

  const onPhotoPointerDown = (event: ReactPointerEvent<HTMLElement>, id: PhotoId) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 2) return startPan(event);
    if (event.button !== 0 || !stageRef.current) return;
    const ids = selectPhoto(id, event.shiftKey || event.ctrlKey || event.metaKey);
    if (!ids?.length) return;
    beginDrag(event, {
      kind: "photo",
      pointerId: event.pointerId,
      start: screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current.getBoundingClientRect(), viewportRef.current),
      ids,
    });
  };

  const onGroupPointerDown = (event: ReactPointerEvent<HTMLElement>, ids: readonly PhotoId[]) => {
    if (disabled || event.button !== 0 || !stageRef.current || !ids.length) return;
    event.preventDefault();
    event.stopPropagation();
    selectPhotos(ids);
    beginDrag(event, {
      kind: "photo",
      pointerId: event.pointerId,
      start: screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current.getBoundingClientRect(), viewportRef.current),
      ids,
    });
  };

  const onPilePointerDown = (event: ReactPointerEvent<HTMLElement>, id: SequenceId) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 2) return startPan(event);
    if (event.button !== 0 || !stageRef.current) return;
    const ids = selectPile(id, event.shiftKey || event.ctrlKey || event.metaKey);
    if (!ids?.length) return;
    beginDrag(event, {
      kind: "pile",
      pointerId: event.pointerId,
      start: screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current.getBoundingClientRect(), viewportRef.current),
      ids,
    });
  };

  const onPhotoResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: PhotoId) => {
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

  const onPileResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: SequenceId) => {
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
      width: pile.width,
    };
    gestureRef.current = gesture;
    scaleRef.current = 1;
    setPileResizeScale(1);
    identify(gesture);
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.target !== event.currentTarget || !stageRef.current) return;
    if (event.button === 2) return startPan(event);
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
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    const delta = deltaRef.current;
    const moved = Math.abs(delta.x) > .25 || Math.abs(delta.y) > .25;
    if (!cancelled && moved && gesture.kind === "photo") execute({ type: "move", photoIds: gesture.ids, by: delta });
    if (!cancelled && moved && gesture.kind === "pile") execute({ type: "move-sequence-piles", sequenceIds: gesture.ids, by: delta });
    if (!cancelled && gesture.kind === "resize" && Math.abs(scaleRef.current - 1) > .01) execute({ type: "resize", photoIds: [gesture.photoId], scale: scaleRef.current });
    if (!cancelled && gesture.kind === "resize-pile" && Math.abs(scaleRef.current - 1) > .01) execute({ type: "resize-sequence-pile", sequenceId: gesture.sequenceId, scale: scaleRef.current });
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
    identify(undefined);
  };

  return {
    preview: {
      ...gestureIdentity,
      dragDelta,
      resizeScale,
      pileResizeScale,
      marquee,
    } satisfies TableGesturePreview,
    onPhotoPointerDown,
    onGroupPointerDown,
    onPilePointerDown,
    onPhotoResizePointerDown,
    onPileResizePointerDown,
    onStagePointerDown,
    onStagePointerMove,
    finishGesture,
  };
}
