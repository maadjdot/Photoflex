import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { SequenceItemId } from "../contracts";
import { sequenceStripInsertionIndex, TABLE_SEQUENCE_STRIP_ITEM_GAP, TABLE_SEQUENCE_STRIP_ITEM_WIDTH } from "../modules/sequence";

export type SequenceDragSource = "stage" | "strip" | "overview";

export interface SequenceDragContainers {
  readonly workspace: RefObject<HTMLElement | null>;
  readonly stage: RefObject<HTMLElement | null>;
  readonly strip: RefObject<HTMLElement | null>;
  readonly overview: RefObject<HTMLElement | null>;
}

export interface SequenceSelectionModifiers {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export interface UseSequenceReorderDragInput {
  readonly itemIds: readonly SequenceItemId[];
  readonly selected: ReadonlySet<SequenceItemId>;
  readonly anchor?: SequenceItemId;
  readonly containers: SequenceDragContainers;
  readonly onSelectionChange: (selected: ReadonlySet<SequenceItemId>, anchor?: SequenceItemId) => void;
  readonly onMove: (itemIds: readonly SequenceItemId[], to: number) => void;
  readonly onActivate?: (itemId: SequenceItemId, source: SequenceDragSource) => void;
}

interface DragState {
  readonly pointerId: number;
  readonly source: SequenceDragSource;
  readonly itemIds: readonly SequenceItemId[];
  readonly clickedId: SequenceItemId;
  readonly collapseOnClick: boolean;
  readonly activateOnClick: boolean;
  readonly startX: number;
  readonly startY: number;
  target: number;
  moved: boolean;
}

interface DragLayoutItem {
  readonly index: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Owns pointer state, geometry caching, auto-scroll and the final move intent. */
export function useSequenceReorderDrag({
  itemIds,
  selected,
  anchor,
  containers,
  onSelectionChange,
  onMove,
  onActivate,
}: UseSequenceReorderDragInput) {
  const [dropTarget, setDropTarget] = useState<number>();
  const dragRef = useRef<DragState | undefined>(undefined);
  const dragFrameRef = useRef<number | undefined>(undefined);
  const pendingPointRef = useRef<{ readonly x: number; readonly y: number; readonly pointerId: number } | undefined>(undefined);
  const layoutRef = useRef<readonly DragLayoutItem[]>([]);
  const suppressClickRef = useRef(false);

  const containerFor = useCallback((source: SequenceDragSource) => {
    if (source === "stage") return containers.stage.current;
    if (source === "strip") return containers.strip.current;
    return containers.overview.current;
  }, [containers]);

  const captureLayout = useCallback((source: SequenceDragSource) => {
    const container = containerFor(source);
    if (!container || source === "strip") {
      layoutRef.current = [];
      return;
    }
    const bounds = container.getBoundingClientRect();
    layoutRef.current = [...container.querySelectorAll<HTMLElement>("[data-sequence-index]")].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        index: Number(element.dataset.sequenceIndex),
        left: rect.left - bounds.left + container.scrollLeft,
        top: rect.top - bounds.top + container.scrollTop,
        width: rect.width,
        height: rect.height,
      };
    });
  }, [containerFor]);

  const begin = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    id: SequenceItemId,
    source: SequenceDragSource,
    forcedIds?: readonly SequenceItemId[],
  ) => {
    if (event.button !== 0 || !itemIds.includes(id)) return;
    event.preventDefault();
    event.stopPropagation();
    containers.workspace.current?.focus();
    const draggedIds = forcedIds ?? (selected.has(id) ? itemIds.filter((itemId) => selected.has(itemId)) : [id]);
    if (forcedIds) {
      onSelectionChange(new Set(forcedIds), forcedIds[0]);
    } else if (!selected.has(id)) {
      const nextSelection = selectionAfterPointer(itemIds, selected, anchor, id, event);
      onSelectionChange(nextSelection.selected, nextSelection.anchor);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      source,
      itemIds: draggedIds,
      clickedId: id,
      collapseOnClick: !forcedIds && selected.has(id) && selected.size > 1 && !event.shiftKey && !event.ctrlKey && !event.metaKey,
      activateOnClick: !event.shiftKey && !event.ctrlKey && !event.metaKey,
      startX: event.clientX,
      startY: event.clientY,
      target: itemIds.indexOf(id),
      moved: false,
    };
    captureLayout(source);
  }, [anchor, captureLayout, containers.workspace, itemIds, onSelectionChange, selected]);

  const move = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
      drag.moved = true;
      suppressClickRef.current = true;
    }
    pendingPointRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    if (dragFrameRef.current !== undefined) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = undefined;
      const point = pendingPointRef.current;
      const currentDrag = dragRef.current;
      if (!point || !currentDrag || point.pointerId !== currentDrag.pointerId) return;
      const container = containerFor(currentDrag.source);
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      if (currentDrag.source === "overview") {
        if (point.y < bounds.top + 48) container.scrollTop -= 24;
        else if (point.y > bounds.bottom - 48) container.scrollTop += 24;
      } else {
        if (point.x < bounds.left + 48) container.scrollLeft -= 24;
        else if (point.x > bounds.right - 48) container.scrollLeft += 24;
      }
      const target = insertionTarget(currentDrag.source, point, bounds, container, layoutRef.current, itemIds.length);
      currentDrag.target = target;
      setDropTarget(target);
    });
  }, [containerFor, itemIds.length]);

  const end = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    const point = pendingPointRef.current;
    const container = containerFor(drag.source);
    if (point && container) {
      const bounds = container.getBoundingClientRect();
      drag.target = insertionTarget(drag.source, point, bounds, container, layoutRef.current, itemIds.length);
    }
    dragRef.current = undefined;
    pendingPointRef.current = undefined;
    setDropTarget(undefined);
    if (drag.moved) onMove(drag.itemIds, drag.target);
    else if (drag.collapseOnClick) onSelectionChange(new Set([drag.clickedId]), drag.clickedId);
    else if (drag.activateOnClick) onActivate?.(drag.clickedId, drag.source);
  }, [containerFor, itemIds.length, onActivate, onMove, onSelectionChange]);

  const cancel = useCallback(() => {
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    dragRef.current = undefined;
    pendingPointRef.current = undefined;
    setDropTarget(undefined);
  }, []);

  useEffect(() => () => {
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    dragRef.current = undefined;
    pendingPointRef.current = undefined;
  }, []);

  const consumeClickSuppression = useCallback(() => {
    const suppressed = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppressed;
  }, []);

  return { dropTarget, begin, move, end, cancel, consumeClickSuppression };
}

function selectionAfterPointer(
  itemIds: readonly SequenceItemId[],
  selected: ReadonlySet<SequenceItemId>,
  anchor: SequenceItemId | undefined,
  id: SequenceItemId,
  modifiers: SequenceSelectionModifiers,
) {
  if (modifiers.shiftKey && anchor) {
    const from = itemIds.indexOf(anchor);
    const to = itemIds.indexOf(id);
    if (from >= 0 && to >= 0) {
      return { selected: new Set(itemIds.slice(Math.min(from, to), Math.max(from, to) + 1)), anchor };
    }
  }
  if (modifiers.ctrlKey || modifiers.metaKey) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    return { selected: next, anchor: id };
  }
  return { selected: new Set([id]), anchor: id };
}

function insertionTarget(
  source: SequenceDragSource,
  point: { readonly x: number; readonly y: number },
  bounds: DOMRect,
  container: HTMLElement,
  layout: readonly DragLayoutItem[],
  itemCount: number,
) {
  if (source === "strip") {
    return sequenceStripInsertionIndex(point.x, bounds.left, container.scrollLeft, itemCount, 16, TABLE_SEQUENCE_STRIP_ITEM_WIDTH, TABLE_SEQUENCE_STRIP_ITEM_GAP);
  }
  const localX = point.x - bounds.left + container.scrollLeft;
  const localY = point.y - bounds.top + container.scrollTop;
  if (source === "overview") {
    let nearest: DragLayoutItem | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const item of layout) {
      const nextDistance = Math.hypot(localX - (item.left + item.width / 2), localY - (item.top + item.height / 2));
      if (nextDistance < distance) {
        nearest = item;
        distance = nextDistance;
      }
    }
    return nearest ? nearest.index + (localX > nearest.left + nearest.width / 2 ? 1 : 0) : itemCount;
  }
  return layout.find((item) => localX < item.left + item.width / 2)?.index ?? itemCount;
}
