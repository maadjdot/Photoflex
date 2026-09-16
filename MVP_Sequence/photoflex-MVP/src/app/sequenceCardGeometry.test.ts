import { describe, expect, it } from "vitest";
import { fitSequenceCardFrame, sequencePileCardWidth } from "./sequenceCardGeometry";

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

  it("grows the Table Sequence card from the compact four-photo width to the six-photo Figma width", () => {
    expect(sequencePileCardWidth(0)).toBe(280);
    expect(sequencePileCardWidth(4)).toBe(290);
    expect(sequencePileCardWidth(5)).toBe(346);
    expect(sequencePileCardWidth(6)).toBe(402);
    expect(sequencePileCardWidth(20)).toBe(402);
  });
});

