import { describe, expect, it } from "vitest";
import { createSequenceEngine } from "../src/index";

describe("SequenceEngine public seam", () => {
  it("moves one item as one undoable transaction", () => {
    const engine = createSequenceEngine(["a", "b", "c", "d"]);
    const moved = engine.move(["b"], 3);

    expect(moved.order).toEqual(["a", "c", "d", "b"]);
    expect(moved.revision).toBe(1);
    expect(engine.undo().order).toEqual(["a", "b", "c", "d"]);
  });

  it("preserves relative order during a batch move", () => {
    const engine = createSequenceEngine(["a", "b", "c", "d", "e"]);

    expect(engine.move(["d", "b"], 0).order).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("exposes immutable snapshots and a deterministic diff", () => {
    const engine = createSequenceEngine(["a", "b", "c"]);
    const before = engine.snapshot();
    engine.move(["c"], 0);

    expect(before.order).toEqual(["a", "b", "c"]);
    expect(engine.diff(before)).toEqual([
      { id: "c", from: 2, to: 0 },
      { id: "a", from: 0, to: 1 },
      { id: "b", from: 1, to: 2 }
    ]);
  });
});
