import { describe, expect, it } from "vitest";
import { aggregateLatencyRuns, calculateStatistics, evaluateFrameRuns } from "../src/index";

describe("benchmark statistics", () => {
  it("uses nearest-rank percentiles and keeps every sample", () => {
    const result = calculateStatistics([1, 2, 3, 4, 100]);

    expect(result).toMatchObject({ count: 5, min: 1, max: 100, median: 3, p95: 100 });
    expect(result.standardDeviation).toBeGreaterThan(38);
  });

  it("aggregates by median of per-run p50 and p95 and flags one bad run", () => {
    const runs = [
      Array(50).fill(10),
      Array(50).fill(11),
      Array(50).fill(12),
      Array(50).fill(13),
      [...Array(47).fill(14), 500, 500, 500]
    ];
    const result = aggregateLatencyRuns(runs, 100);

    expect(result.runCount).toBe(5);
    expect(result.medianOfP50).toBe(12);
    expect(result.unstable).toBe(true);
    expect(result.samples).toHaveLength(250);
  });

  it("requires four of five frame runs to fully pass", () => {
    const passing = { medianFps: 58, onePercentLowFps: 44, p95FrameTime: 20, over50msRatio: 0.005, longestPause: 100 };
    const tolerated = { medianFps: 52, onePercentLowFps: 35, p95FrameTime: 30, over50msRatio: 0.02, longestPause: 150 };

    expect(evaluateFrameRuns([passing, passing, passing, passing, tolerated]).pass).toBe(true);
    expect(evaluateFrameRuns([passing, passing, passing, tolerated, tolerated]).pass).toBe(false);
  });
});
