export interface BenchmarkStatistics {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  standardDeviation: number;
  coefficientOfVariation: number;
}

export function nearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0) throw new Error("Cannot calculate a percentile from no samples");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1] as number;
}

export function calculateStatistics(values: readonly number[]): BenchmarkStatistics {
  if (values.length === 0) throw new Error("At least one sample is required");
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Samples must be finite numbers");
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  const standardDeviation = Math.sqrt(variance);
  return {
    count: sorted.length,
    min: sorted[0] as number,
    max: sorted.at(-1) as number,
    mean,
    median: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    standardDeviation,
    coefficientOfVariation: mean === 0 ? 0 : standardDeviation / Math.abs(mean)
  };
}

export interface AggregatedLatencyRuns {
  runCount: number;
  samples: number[];
  runStatistics: BenchmarkStatistics[];
  medianOfP50: number;
  medianOfP95: number;
  overall: BenchmarkStatistics;
  unstable: boolean;
}

export function aggregateLatencyRuns(runs: readonly (readonly number[])[], p95Threshold: number): AggregatedLatencyRuns {
  if (runs.length < 5) throw new Error("Latency benchmarks require at least five independent runs");
  const runStatistics = runs.map(calculateStatistics);
  const samples = runs.flatMap((run) => [...run]);
  return {
    runCount: runs.length,
    samples,
    runStatistics,
    medianOfP50: nearestRank(runStatistics.map((run) => run.median), 50),
    medianOfP95: nearestRank(runStatistics.map((run) => run.p95), 50),
    overall: calculateStatistics(samples),
    unstable: runStatistics.some((run) => run.p95 > p95Threshold)
  };
}

export interface FrameRun {
  medianFps: number;
  onePercentLowFps: number;
  p95FrameTime: number;
  over50msRatio: number;
  longestPause: number;
}

export function frameRunPasses(run: FrameRun): boolean {
  return run.medianFps >= 55
    && run.onePercentLowFps >= 40
    && run.p95FrameTime <= 25
    && run.over50msRatio < 0.01
    && run.longestPause <= 250;
}

export function evaluateFrameRuns(runs: readonly FrameRun[]): { pass: boolean; passingRuns: number; worstRun: FrameRun } {
  if (runs.length !== 5) throw new Error("Frame benchmarks require exactly five formal runs");
  const passingRuns = runs.filter(frameRunPasses).length;
  const nonPassingWithinTolerance = runs.filter((run) => !frameRunPasses(run)).every((run) => run.medianFps >= 50 && run.longestPause <= 250);
  const worstRun = [...runs].sort((a, b) => a.medianFps - b.medianFps || b.longestPause - a.longestPause)[0] as FrameRun;
  return { pass: passingRuns >= 4 && nonPassingWithinTolerance, passingRuns, worstRun };
}
