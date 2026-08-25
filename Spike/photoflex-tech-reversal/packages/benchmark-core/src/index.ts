export * from "./statistics.ts";
export * from "./decision.ts";
export * from "./scenarios.ts";
export * from "./gates.ts";

export type BenchmarkVerdict = "pass" | "fail" | "needs_scope_change" | "blocked";

export interface BenchmarkResult<TStatistics = unknown> {
  scenarioId: string;
  framework: "browser" | "tauri" | "electron";
  environmentId: string;
  fixtureHash: string;
  samples: number[];
  statistics: TStatistics;
  verdict: BenchmarkVerdict;
  evidence: string[];
  notes: string[];
  startedAt: string;
  completedAt: string;
}
