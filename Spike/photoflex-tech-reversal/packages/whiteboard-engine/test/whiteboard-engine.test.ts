import { describe, expect, it } from "vitest";
import {
  commitWhiteboard,
  createWhiteboardState,
  deriveSequenceOrder,
  discardWhiteboard,
  reduceWhiteboard,
  selectItemsInRect,
  stableStateHash,
  visibleWhiteboardItems,
  whiteboardStateMatchesIds
} from "../src/index";

describe("WhiteboardEngine pure state seam", () => {
  it("moves a selected group without mutating the entry snapshot", () => {
    const initial = createWhiteboardState(["a", "b", "c"]);
    const selected = reduceWhiteboard(initial, { type: "select", ids: ["a", "b"] });
    const moved = reduceWhiteboard(selected, { type: "move-selection", dx: 25, dy: -10 });

    expect(moved.items.a).toMatchObject({ x: 25, y: -10 });
    expect(moved.items.b).toMatchObject({ x: 245, y: -10 });
    expect(moved.entrySnapshot.items.a).toMatchObject({ x: 0, y: 0 });
    expect(moved.dirty).toBe(true);
  });

  it("discards back to the exact entry snapshot", () => {
    const initial = createWhiteboardState(["a", "b"]);
    const changed = reduceWhiteboard(initial, { type: "move-items", ids: ["a"], dx: 99, dy: 42 });

    expect(stableStateHash(discardWhiteboard(changed))).toBe(stableStateHash(initial));
  });

  it("commits layout and derives rows top-to-bottom then left-to-right", () => {
    let state = createWhiteboardState(["a", "b", "c"]);
    state = reduceWhiteboard(state, { type: "set-item", id: "a", patch: { x: 500, y: 0 } });
    state = reduceWhiteboard(state, { type: "set-item", id: "b", patch: { x: 0, y: 80 } });
    state = reduceWhiteboard(state, { type: "set-item", id: "c", patch: { x: 20, y: 300 } });

    expect(deriveSequenceOrder(state, 120)).toEqual(["b", "a", "c"]);
    const commit = commitWhiteboard(state);
    expect(commit.sequenceOrder).toEqual(["b", "a", "c"]);
    expect(commit.state.dirty).toBe(false);
  });

  it("keeps repeated action sequences deterministic", () => {
    const execute = () => {
      let state = createWhiteboardState(Array.from({ length: 60 }, (_, index) => `p-${index}`));
      state = reduceWhiteboard(state, { type: "select", ids: ["p-1", "p-2", "p-3"] });
      state = reduceWhiteboard(state, { type: "move-selection", dx: 10, dy: 20 });
      state = reduceWhiteboard(state, { type: "set-viewport", zoom: 0.75, scrollX: 50, scrollY: 80 });
      return stableStateHash(state);
    };

    expect(new Set(Array.from({ length: 20 }, execute)).size).toBe(1);
  });

  it.each([500, 3000])("places all %i items inside the 5200 x 3600 canvas", (count) => {
    const state = createWhiteboardState(Array.from({ length: count }, (_, index) => `p-${index}`));

    expect(Object.values(state.items).every((item) =>
      item.x >= 0 && item.y >= 0 && item.x + item.width <= 5200 && item.y + item.height <= 3600
    )).toBe(true);
  });

  it("rejects a stale state when the whiteboard item set changes", () => {
    const largeState = createWhiteboardState(Array.from({ length: 1500 }, (_, index) => `p-${index}`));
    const smallState = createWhiteboardState(["p-0", "p-1", "p-2"]);
    const afterDelete = reduceWhiteboard(smallState, { type: "remove-items", ids: ["p-1"] });

    expect(whiteboardStateMatchesIds(largeState, ["p-0", "p-1", "p-2"])).toBe(false);
    expect(whiteboardStateMatchesIds(largeState, Object.keys(largeState.items))).toBe(true);
    expect(whiteboardStateMatchesIds(afterDelete, ["p-0", "p-1", "p-2"])).toBe(true);

    const savedAfterDelete = commitWhiteboard(afterDelete).state;
    expect(savedAfterDelete.sourcePhotoIds).toEqual(["p-0", "p-1", "p-2"]);
    expect(whiteboardStateMatchesIds(savedAfterDelete, ["p-0", "p-1", "p-2"])).toBe(true);
  });

  it("keeps mounted whiteboard photo nodes bounded at 500", () => {
    const state = createWhiteboardState(Array.from({ length: 3000 }, (_, index) => `p-${index}`));

    expect(visibleWhiteboardItems(state, 1400, 800, 10, 500)).toHaveLength(500);
  });

  it("selects every item intersecting a marquee rectangle", () => {
    let state = createWhiteboardState(["a", "b", "c"]);
    state = reduceWhiteboard(state, { type: "set-item", id: "a", patch: { x: 20, y: 20, width: 100, height: 100 } });
    state = reduceWhiteboard(state, { type: "set-item", id: "b", patch: { x: 110, y: 110, width: 100, height: 100 } });
    state = reduceWhiteboard(state, { type: "set-item", id: "c", patch: { x: 400, y: 400, width: 100, height: 100 } });

    expect(selectItemsInRect(state, { left: 100, top: 100, right: 250, bottom: 250 })).toEqual(["a", "b"]);
  });
});
