// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectId, WorktableDraft, WorktableViewport } from "../contracts";
import { useTableGestures } from "./useTableGestures";

afterEach(() => vi.unstubAllGlobals());

describe("useTableGestures marquee edge pan", () => {
  it("pans the Table while a selection box is held near an edge", () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const stage = document.createElement("div");
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON: () => ({}) });
    Object.assign(stage, { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => false), releasePointerCapture: vi.fn() });
    const viewport: WorktableViewport = { originX: 0, originY: 0, zoom: 1 };
    const setViewport = vi.fn();
    const { result } = renderHook(() => useTableGestures({
      stageRef: ref(stage),
      draft: emptyDraft(),
      viewport,
      setViewport,
      execute: vi.fn(),
      selectPhoto: vi.fn(),
      selectPile: vi.fn(),
      selectPhotos: vi.fn(),
      clearSelection: vi.fn(),
      onDropPhotosOnSequence: vi.fn(),
      visiblePhotoIds: new Set(),
    }));

    act(() => result.current.onStagePointerDown(pointerEvent(stage, 100, 100)));
    act(() => result.current.onStagePointerMove(pointerEvent(stage, 390, 290)));
    act(() => scheduledFrame?.(0));

    expect(setViewport).toHaveBeenCalledWith({ originX: -15, originY: -15, zoom: 1 });
    expect(result.current.preview.marquee).toMatchObject({ left: 100, top: 100, width: 290, height: 190 });
  });
});

function ref<T>(current: T): RefObject<T> {
  return { current };
}

function pointerEvent(stage: HTMLElement, clientX: number, clientY: number): ReactPointerEvent<HTMLDivElement> {
  return {
    button: 0,
    pointerId: 11,
    clientX,
    clientY,
    target: stage,
    currentTarget: stage,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}

function emptyDraft(): WorktableDraft {
  return {
    projectId: "gesture-test" as ProjectId,
    entryOrder: [],
    placements: {},
    groups: [],
    links: [],
    pileOrder: [],
    pilePlacements: {},
  };
}
