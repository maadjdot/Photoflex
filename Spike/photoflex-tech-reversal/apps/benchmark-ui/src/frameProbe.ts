import { calculateStatistics } from "@photoflex/benchmark-core";

export interface FrameProbeResult {
  durationMs: number;
  frameCount: number;
  medianFps: number;
  onePercentLowFps: number;
  p95FrameTime: number;
  over50msRatio: number;
  longestPause: number;
}

export function probeFrames(durationMs: number, signal?: AbortSignal): Promise<FrameProbeResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    let previous = started;
    const intervals: number[] = [];
    const frame = (now: number) => {
      intervals.push(now - previous);
      previous = now;
      if (now - started < durationMs && !signal?.aborted) {
        requestAnimationFrame(frame);
        return;
      }
      const usable = intervals.slice(1);
      const statistics = calculateStatistics(usable);
      const fps = usable.map((interval) => 1000 / interval);
      const fpsStats = calculateStatistics(fps);
      resolve({
        durationMs: now - started,
        frameCount: usable.length,
        medianFps: fpsStats.median,
        onePercentLowFps: [...fps].sort((a, b) => a - b)[Math.max(0, Math.ceil(fps.length * 0.01) - 1)] ?? 0,
        p95FrameTime: statistics.p95,
        over50msRatio: usable.filter((interval) => interval > 50).length / usable.length,
        longestPause: statistics.max
      });
    };
    requestAnimationFrame(frame);
  });
}
