import { calculateStatistics } from "./statistics.ts";
import { memorySlopeMbPerMinute, type MemorySample } from "./scenarios.ts";

export interface SoakSegment {
  id: "grid" | "sequence" | "whiteboard" | "compare" | "idle";
  minutes: number;
  actions: string[];
}

export function buildSoakTimeline(): SoakSegment[] {
  return [
    { id: "grid", minutes: 10, actions: ["scroll", "filter", "zoom"] },
    { id: "sequence", minutes: 10, actions: ["drag", "keyboard-move", "undo"] },
    { id: "whiteboard", minutes: 20, actions: ["pan", "zoom", "marquee", "group-move", "delete-restore"] },
    { id: "compare", minutes: 5, actions: ["save-snapshot", "open-compare", "return-whiteboard"] },
    { id: "idle", minutes: 5, actions: [] }
  ];
}

export interface SoakEvaluation {
  verdict: "pass" | "warning" | "fail";
  slopeMbPerMinute: number;
  stableWindowGrowthRatio: number;
  idleReturnRatio: number;
  reasons: string[];
}

function medianRss(samples: readonly MemorySample[]): number {
  return calculateStatistics(samples.map((sample) => sample.processTreeRssBytes)).median;
}

export function evaluateSoakMemory(samples: readonly MemorySample[], baselineRssBytes: number): SoakEvaluation {
  if (samples.length < 45 * 60) throw new Error("SOAK requires at least 45 minutes of one-second samples");
  const slopeMbPerMinute = memorySlopeMbPerMinute(samples);
  const firstStable = samples.filter((sample) => sample.elapsedSeconds >= 5 * 60 && sample.elapsedSeconds < 15 * 60);
  const lastActiveSecond = Math.max(...samples.map((sample) => sample.elapsedSeconds)) - 5 * 60;
  const lastStable = samples.filter((sample) => sample.elapsedSeconds >= lastActiveSecond - 10 * 60 && sample.elapsedSeconds < lastActiveSecond);
  const idle = samples.filter((sample) => sample.elapsedSeconds >= lastActiveSecond);
  const stableWindowGrowthRatio = medianRss(lastStable) / medianRss(firstStable);
  const idleReturnRatio = medianRss(idle) / baselineRssBytes;
  const reasons: string[] = [];
  if (slopeMbPerMinute > 3) reasons.push("RSS regression slope exceeds 3 MB/min");
  else if (slopeMbPerMinute > 1) reasons.push("RSS regression slope is in the 1–3 MB/min warning band");
  if (stableWindowGrowthRatio > 1.2) reasons.push("Last stable window exceeds first stable window by more than 20%");
  if (idleReturnRatio > 1.2) reasons.push("Idle memory did not return to baseline +20%");
  const failed = slopeMbPerMinute > 3 || stableWindowGrowthRatio > 1.2 || idleReturnRatio > 1.2;
  const warning = !failed && slopeMbPerMinute > 1;
  return { verdict: failed ? "fail" : warning ? "warning" : "pass", slopeMbPerMinute, stableWindowGrowthRatio, idleReturnRatio, reasons };
}

export interface MixedRunEvidence {
  peakRssMb: number;
  idleRssMb: number;
  gridMedianFps: number;
  boardMedianFps: number;
  gridOnePercentLowFps: number;
  boardOnePercentLowFps: number;
  inputP95Ms: number;
  longestPauseMs: number;
  commitsCorrect: boolean;
  crashed: boolean;
  dataLoss: boolean;
}

export function evaluateMixedRun(evidence: MixedRunEvidence): { verdict: "pass" | "risk" | "hard_fail"; failedMetrics: string[] } {
  if (evidence.crashed || evidence.dataLoss || !evidence.commitsCorrect) {
    return { verdict: "hard_fail", failedMetrics: [evidence.crashed ? "crash" : "", evidence.dataLoss ? "data-loss" : "", !evidence.commitsCorrect ? "incorrect-commit" : ""].filter(Boolean) };
  }
  const failedMetrics = [
    evidence.peakRssMb >= 800 ? "peak-rss" : "",
    evidence.idleRssMb >= 650 ? "idle-rss" : "",
    evidence.gridMedianFps < 45 ? "grid-median-fps" : "",
    evidence.boardMedianFps < 45 ? "board-median-fps" : "",
    evidence.gridOnePercentLowFps < 30 ? "grid-1%-low" : "",
    evidence.boardOnePercentLowFps < 30 ? "board-1%-low" : "",
    evidence.inputP95Ms > 150 ? "input-p95" : "",
    evidence.longestPauseMs > 500 ? "longest-pause" : ""
  ].filter(Boolean);
  return { verdict: failedMetrics.length ? "risk" : "pass", failedMetrics };
}

export interface ExploratoryStepEvidence {
  medianFps: number;
  inputP95Ms: number;
  longestPauseMs: number;
  rssMb: number;
  saveAndReopen: boolean;
  dataLoss: boolean;
  systemAvailableMemoryMb?: number;
}

export function evaluateExploratoryStep(evidence: ExploratoryStepEvidence): "stable" | "degraded" | "stop" {
  if (evidence.dataLoss || !evidence.saveAndReopen || evidence.longestPauseMs > 5_000 || evidence.rssMb >= 1_500 || (evidence.systemAvailableMemoryMb !== undefined && evidence.systemAvailableMemoryMb < 2_000)) return "stop";
  if (evidence.medianFps < 30 || evidence.inputP95Ms > 200 || evidence.longestPauseMs > 1_000) return "degraded";
  return "stable";
}
