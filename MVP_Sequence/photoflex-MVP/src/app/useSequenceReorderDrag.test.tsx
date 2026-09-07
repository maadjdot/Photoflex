// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceItemId } from "../contracts";
import { useSequenceReorderDrag, type SequenceDragContainers } from "./useSequenceReorderDrag";

const firstId = "drag-first" as SequenceItemId;
const secondId = "drag-second" as SequenceItemId;
const thirdId = "drag-third" as SequenceItemId;

afterEach(() => vi.unstubAllGlobals());

describe("useSequenceReorderDrag", () => {
  it("commits one Strip move and clears its insertion target on release", () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 7;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const strip = document.createElement("div");
    Object.defineProperty(strip, "scrollLeft", { value: 0, writable: true });
    strip.getBoundingClientRect = () => ({ left: 0, right: 600, top: 0, bottom: 120, width: 600, height: 120, x: 0, y: 0, toJSON: () => ({}) });
    const containers: SequenceDragContainers = {
      workspace: ref(document.createElement("main")),
      stage: ref(document.createElement("section")),
      strip: ref(strip),
      overview: ref(document.createElement("section")),
    };
    const onMove = vi.fn();
    const onSelectionChange = vi.fn();
    const { result } = renderHook(() => useSequenceReorderDrag({
      itemIds: [firstId, secondId, thirdId],
      selected: new Set<SequenceItemId>(),
      anchor: undefined,
      containers,
      onSelectionChange,
      onMove,
    }));

    act(() => result.current.begin(pointerEvent({ clientX: 50 }), firstId, "strip"));
    act(() => result.current.move(pointerEvent({ clientX: 540 })));
    act(() => scheduledFrame?.(0));
    expect(result.current.dropTarget).toBe(3);

    act(() => result.current.end(pointerEvent({ clientX: 540 })));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith([firstId], 3);
    expect(result.current.dropTarget).toBeUndefined();
  });

  it("keeps the original anchor when extending a selection", () => {
    const onSelectionChange = vi.fn();
    const containers: SequenceDragContainers = {
      workspace: ref(document.createElement("main")),
      stage: ref(document.createElement("section")),
      strip: ref(document.createElement("div")),
      overview: ref(document.createElement("section")),
    };
    const { result } = renderHook(() => useSequenceReorderDrag({
      itemIds: [firstId, secondId, thirdId],
      selected: new Set([firstId]),
      anchor: firstId,
      containers,
      onSelectionChange,
      onMove: vi.fn(),
    }));

    act(() => result.current.begin(pointerEvent({ clientX: 50, shiftKey: true }), thirdId, "stage"));

    expect(onSelectionChange).toHaveBeenCalledWith(new Set([firstId, secondId, thirdId]), firstId);
  });
});

function ref<T>(current: T): RefObject<T> {
  return { current };
}

function pointerEvent({ clientX, shiftKey = false }: { clientX: number; shiftKey?: boolean }): ReactPointerEvent<HTMLElement> {
  return {
    button: 0,
    pointerId: 11,
    clientX,
    clientY: 40,
    shiftKey,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() },
  } as unknown as ReactPointerEvent<HTMLElement>;
}
