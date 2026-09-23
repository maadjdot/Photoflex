// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, WorktableDraft, WorktableItemId, WorktableViewport } from "../contracts";
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
    expect(result.current.preview.marquee).toMatchObject({ left: 85, top: 85, width: 305, height: 205 });
    act(() => scheduledFrame?.(16));
    expect(setViewport).toHaveBeenLastCalledWith({ originX: -30, originY: -30, zoom: 1 });
    expect(result.current.preview.marquee).toMatchObject({ left: 70, top: 70, width: 320, height: 220 });
  });

  it("keeps the original photo inside the marquee while auto-panning to later photos", () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { scheduledFrame = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const stage = document.createElement("div");
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON: () => ({}) });
    Object.assign(stage, { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => false), releasePointerCapture: vi.fn() });
    const first = "first" as WorktableItemId, later = "later" as WorktableItemId;
    const draft: WorktableDraft = { ...emptyDraft(), entryOrder: [first, later], placements: {
      [first]: { id: first, photoId: "photo-first" as PhotoId, x: 100, y: 100, z: 1, width: 100, height: 100, filename: "first.jpg" },
      [later]: { id: later, photoId: "photo-later" as PhotoId, x: 430, y: 100, z: 2, width: 100, height: 100, filename: "later.jpg" },
    } };
    const selectPhotos = vi.fn();
    const viewport: WorktableViewport = { originX: 0, originY: 0, zoom: 1 };
    const { result } = renderHook(() => useTableGestures({
      stageRef: ref(stage), draft, viewport, setViewport: vi.fn(), execute: vi.fn(),
      selectPhoto: vi.fn(), selectPile: vi.fn(), selectPhotos, clearSelection: vi.fn(), onDropPhotosOnSequence: vi.fn(), visiblePhotoIds: new Set(),
    }));
    act(() => result.current.onStagePointerDown(pointerEvent(stage, 50, 50)));
    act(() => result.current.onStagePointerMove(pointerEvent(stage, 390, 200)));
    for (let index = 0; index < 5; index++) act(() => scheduledFrame?.(index * 16));
    expect(result.current.preview.marquee).toMatchObject({ left: -25, top: 50, width: 415, height: 150 });
    act(() => result.current.finishGesture(pointerEvent(stage, 390, 200)));
    expect(selectPhotos).toHaveBeenCalledWith([first, later], false);
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
