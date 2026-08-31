import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import type {
  PhotoId,
  WorktableDraft,
  WorktableEditCommand,
  WorktablePoint,
  WorktableViewport,
} from "../contracts";
import { screenToWorld } from "../modules/worktable";

const MARQUEE_OVERLAP = .3;

export type Gesture =
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

export interface MarqueeRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface UseWorktableGesturesInput {
  readonly draft?: WorktableDraft;
  readonly selected: ReadonlySet<PhotoId>;
  readonly setSelected: Dispatch<SetStateAction<Set<PhotoId>>>;
  readonly execute: (command: WorktableEditCommand) => void;
  readonly stageRef: MutableRefObject<HTMLDivElement | null>;
  readonly viewportRef: MutableRefObject<WorktableViewport>;
  readonly setViewportState: Dispatch<SetStateAction<WorktableViewport>>;
}

export function useWorktableGestures({
  draft,
  selected,
  setSelected,
  execute,
  stageRef,
  viewportRef,
  setViewportState,
}: UseWorktableGesturesInput) {
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const [dragDelta, setDragDelta] = useState<WorktablePoint>({ x: 0, y: 0 });
  const [resizeScale, setResizeScale] = useState(1);
  const [marquee, setMarquee] = useState<MarqueeRect>();
  const dragDeltaRef = useRef<WorktablePoint>({ x: 0, y: 0 });
  const resizeScaleRef = useRef(1);
  const gestureFrameRef = useRef<number | undefined>(undefined);
  const pendingGestureRenderRef = useRef<(() => void) | undefined>(undefined);

  const scheduleGestureRender = useCallback((render: () => void) => {
    pendingGestureRenderRef.current = render;
    if (gestureFrameRef.current !== undefined) return;
    gestureFrameRef.current = requestFrame(() => {
      gestureFrameRef.current = undefined;
      const pending = pendingGestureRenderRef.current;
      pendingGestureRenderRef.current = undefined;
      pending?.();
    });
  }, []);

  const cancelGestureRender = useCallback(() => {
    if (gestureFrameRef.current !== undefined) cancelFrame(gestureFrameRef.current);
    gestureFrameRef.current = undefined;
    pendingGestureRenderRef.current = undefined;
  }, []);

  useEffect(() => cancelGestureRender, [cancelGestureRender]);

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
      const nextViewport = {
        ...gesture.startViewport,
        originX: gesture.startViewport.originX + event.clientX - gesture.startScreen.x,
        originY: gesture.startViewport.originY + event.clientY - gesture.startScreen.y,
      };
      viewportRef.current = nextViewport;
      scheduleGestureRender(() => setViewportState(nextViewport));
      return;
    }
    if (gesture.kind === "marquee") {
      const left = Math.min(gesture.startScreen.x, event.clientX);
      const top = Math.min(gesture.startScreen.y, event.clientY);
      const nextMarquee = {
        left: left - rect.left,
        top: top - rect.top,
        width: Math.abs(event.clientX - gesture.startScreen.x),
        height: Math.abs(event.clientY - gesture.startScreen.y),
      };
      scheduleGestureRender(() => setMarquee(nextMarquee));
      return;
    }
    if (gesture.kind === "resize") {
      const item = draft?.placements[gesture.photoId];
      if (!item) return;
      const current = screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current);
      const nextScale = Math.max(.25, Math.min(4, (current.x - item.x) / gesture.startWidth));
      resizeScaleRef.current = nextScale;
      scheduleGestureRender(() => setResizeScale(nextScale));
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
      viewportRef.current = nextViewport;
    }
    const current = screenToWorld({ x: event.clientX, y: event.clientY }, rect, nextViewport);
    const delta = {
      x: current.x - gesture.startWorld.x,
      y: current.y - gesture.startWorld.y,
    };
    dragDeltaRef.current = delta;
    scheduleGestureRender(() => {
      if (panX || panY) setViewportState(nextViewport);
      setDragDelta(delta);
    });
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = gestureRef.current;
    const stage = stageRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !stage) return;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    gestureRef.current = undefined;
    cancelGestureRender();
    if (gesture.kind === "pan") setViewportState(viewportRef.current);

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

  return {
    gestureRef,
    dragDelta,
    resizeScale,
    marquee,
    onCardPointerDown,
    onResizePointerDown,
    onStagePointerDown,
    onStagePointerMove,
    finishPointer,
  };
}

function requestFrame(callback: FrameRequestCallback): number {
  return typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 16);
}

function cancelFrame(frameId: number): void {
  if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frameId);
  else window.clearTimeout(frameId);
}
