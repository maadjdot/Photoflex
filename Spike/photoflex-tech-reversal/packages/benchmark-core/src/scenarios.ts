export const FORMAL_SCENARIOS = {
  "T-01": { label: "10,000 项大型网格", formalRuns: 5, durationSeconds: 60 },
  "T-02": { label: "500 项 Sequence 排序", formalRuns: 5, operationsPerRun: 100 },
  "DB-01": { label: "数据库迁移与崩溃恢复", faultRuns: 20 },
  "T-03": { label: "ExifTool sidecar", fixtureCount: 20 },
  "T-04": { label: "200 页 PDF", completionRuns: 7, cancellationRuns: 5 },
  "T-05": { label: "动态 Source 权限", legalRuns: 20, restoreRuns: 10 },
  "T-06": { label: "跨平台方向和色彩", requiresPhysicalMac: true },
  "WB-01": { label: "自由白板", functionalItems: 60, pressureItems: 500, formalRuns: 5, durationSeconds: 60 },
  "PKG-01": { label: "壳层构建、安装和启动", installRuns: 5 },
  "MIX-01": { label: "Library + Sequence + Whiteboard", formalRuns: 5, durationSeconds: 300 },
  SOAK: { label: "跨模块长时间稳定性", activeMinutes: 45, idleMinutes: 5 },
  "WB-LIMIT": { label: "探索性白板上限", itemSteps: [500, 1000, 1500, 2000, 3000] }
} as const;

export interface MemorySample {
  elapsedSeconds: number;
  processTreeRssBytes: number;
  rendererHeapBytes: number;
  gpuBytes: number;
}

export function memorySlopeMbPerMinute(samples: readonly MemorySample[], ignoreFirstMinutes = 5): number {
  const usable = samples.filter((sample) => sample.elapsedSeconds >= ignoreFirstMinutes * 60);
  if (usable.length < 2) throw new Error("Not enough soak samples after warm-up");
  const xs = usable.map((sample) => sample.elapsedSeconds / 60);
  const ys = usable.map((sample) => sample.processTreeRssBytes / 1024 / 1024);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce((sum, x, index) => sum + (x - meanX) * ((ys[index] as number) - meanY), 0);
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  return denominator === 0 ? 0 : numerator / denominator;
}
