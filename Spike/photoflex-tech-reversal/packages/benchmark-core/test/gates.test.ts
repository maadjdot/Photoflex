import { describe, expect, it } from "vitest";
import { buildSoakTimeline, evaluateExploratoryStep, evaluateMixedRun, evaluateSoakMemory } from "../src/index";

describe("executable stability gates", () => {
  it("builds the fixed 45-minute active soak plus five-minute idle window", () => {
    const timeline = buildSoakTimeline();
    expect(timeline.map((segment) => [segment.id, segment.minutes])).toEqual([
      ["grid", 10], ["sequence", 10], ["whiteboard", 20], ["compare", 5], ["idle", 5]
    ]);
    expect(timeline.reduce((sum, segment) => sum + segment.minutes, 0)).toBe(50);
  });

  it("classifies a rising soak memory curve by regression slope", () => {
    const samples = Array.from({ length: 50 * 60 }, (_, second) => ({
      elapsedSeconds: second,
      processTreeRssBytes: (300 + second / 60 * 3.2) * 1024 * 1024,
      rendererHeapBytes: 100 * 1024 * 1024,
      gpuBytes: 50 * 1024 * 1024
    }));
    expect(evaluateSoakMemory(samples, 300 * 1024 * 1024).verdict).toBe("fail");
  });

  it("keeps mixed pressure as a risk unless correctness or recoverability fails", () => {
    expect(evaluateMixedRun({ peakRssMb: 900, idleRssMb: 700, gridMedianFps: 40, boardMedianFps: 40, gridOnePercentLowFps: 25, boardOnePercentLowFps: 25, inputP95Ms: 170, longestPauseMs: 400, commitsCorrect: true, crashed: false, dataLoss: false }).verdict).toBe("risk");
    expect(evaluateMixedRun({ peakRssMb: 700, idleRssMb: 600, gridMedianFps: 50, boardMedianFps: 50, gridOnePercentLowFps: 35, boardOnePercentLowFps: 35, inputP95Ms: 100, longestPauseMs: 300, commitsCorrect: false, crashed: false, dataLoss: true }).verdict).toBe("hard_fail");
  });

  it("records exploratory degradation without changing WB-01", () => {
    expect(evaluateExploratoryStep({ medianFps: 28, inputP95Ms: 180, longestPauseMs: 800, rssMb: 900, saveAndReopen: true, dataLoss: false })).toBe("degraded");
    expect(evaluateExploratoryStep({ medianFps: 40, inputP95Ms: 150, longestPauseMs: 5100, rssMb: 900, saveAndReopen: true, dataLoss: false })).toBe("stop");
  });
});
