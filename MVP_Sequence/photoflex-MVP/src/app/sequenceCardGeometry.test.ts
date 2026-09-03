import { describe, expect, it } from "vitest";
import { fitSequenceCardFrame } from "./sequenceCardGeometry";

describe("Sequence card geometry", () => {
  it("keeps a landscape photograph's real ratio", () => {
    expect(fitSequenceCardFrame(6000, 4000)).toEqual({ width: 360, height: 240 });
  });

  it("keeps a portrait photograph's real ratio", () => {
    expect(fitSequenceCardFrame(2800, 4000)).toEqual({ width: 280, height: 400 });
  });

  it("uses a stable fallback while metadata is unavailable", () => {
    expect(fitSequenceCardFrame(0, 0)).toEqual({ width: 360, height: 270 });
  });
});

