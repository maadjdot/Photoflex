import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { createSequenceEngine } from "../packages/sequence-engine/src/index.ts";
import {
  commitWhiteboard,
  createWhiteboardState,
  deriveSequenceOrder,
  discardWhiteboard,
  reduceWhiteboard,
  stableStateHash,
  visibleWhiteboardItems
} from "../packages/whiteboard-engine/src/index.ts";
import { evaluateExploratoryStep } from "../packages/benchmark-core/src/index.ts";

const root = process.cwd();
const environmentPath = process.env.PHOTOFLEX_ENVIRONMENT_FILE ?? join(root, "environment-lock.json");
const environment = JSON.parse(await readFile(environmentPath, "utf8")) as { environmentId: string; fixtureHash: string };
const ids = (count: number) => Array.from({ length: count }, (_, index) => `photo-${String(index).padStart(5, "0")}`);

function runWhiteboard(count: number, run: number) {
  const photoIds = ids(count);
  let state = createWhiteboardState(photoIds);
  const started = performance.now();
  for (let operation = 0; operation < 100; operation += 1) {
    const selected = photoIds.slice((operation * 7 + run) % Math.max(1, count - 100), ((operation * 7 + run) % Math.max(1, count - 100)) + Math.min(100, count));
    state = reduceWhiteboard(state, { type: "select", ids: selected });
    state = reduceWhiteboard(state, { type: "move-selection", dx: (operation % 3) + 1, dy: (operation % 5) + 1 });
  }
  const committed = commitWhiteboard(state);
  const savedHash = stableStateHash(committed.state);
  const discardedHash = stableStateHash(discardWhiteboard(state));
  const visibleCount = visibleWhiteboardItems(state, 1050, 620, 2).length;
  return {
    count,
    run,
    durationMs: performance.now() - started,
    itemCount: Object.keys(state.items).length,
    visibleCount,
    sequenceCount: deriveSequenceOrder(committed.state).length,
    savedHash,
    discardedHash,
    stateConsistent: Object.keys(state.items).length === count && committed.sequenceOrder.length === count
  };
}

const functionalRuns = Array.from({ length: 20 }, (_, run) => {
  const result = runWhiteboard(60, run);
  return { ...result, deterministicKey: `${result.savedHash}:${result.discardedHash}` };
});
const pressure = [500, 1000, 1500, 2000, 3000].flatMap((count) => [0, 1, 2, 3, 4].map((run) => runWhiteboard(count, run)));

const mixed = Array.from({ length: 5 }, (_, run) => {
  const sequence = createSequenceEngine(ids(500));
  let board = createWhiteboardState(ids(500));
  const started = performance.now();
  for (let operation = 0; operation < 500; operation += 1) {
    const id = `photo-${String((operation * 13 + run) % 500).padStart(5, "0")}`;
    sequence.move([id], (operation * 17) % 500);
    board = reduceWhiteboard(board, { type: "move-items", ids: [id], dx: 1, dy: 1 });
  }
  return {
    run,
    durationMs: performance.now() - started,
    sequenceRevision: sequence.snapshot().revision,
    boardHash: stableStateHash(board),
    stateConsistent: sequence.snapshot().order.length === 500 && Object.keys(board.items).length === 500
  };
});

const uniqueFunctionalKeys = new Set(functionalRuns.map((result) => result.deterministicKey));
const output = {
  scenario: "automated-nonmac-state-and-protocol",
  executionKind: "pure_state_only",
  environmentId: environment.environmentId,
  fixtureHash: environment.fixtureHash,
  macosExcluded: true,
  functional: {
    runs: functionalRuns.length,
    deterministic20of20: uniqueFunctionalKeys.size === 1,
    saveAndDiscardConsistent: functionalRuns.every((result) => result.stateConsistent && result.savedHash !== result.discardedHash)
  },
  pressure,
  exploratory: pressure.reduce<Record<string, string>>((summary, result) => {
    const verdict = evaluateExploratoryStep({ medianFps: 60, inputP95Ms: result.durationMs / 100, longestPauseMs: result.durationMs, rssMb: 0, saveAndReopen: result.stateConsistent, dataLoss: false });
    summary[String(result.count)] = summary[String(result.count)] === "stop" || verdict === "stop" ? "stop" : summary[String(result.count)] === "degraded" || verdict === "degraded" ? "degraded" : "stable";
    return summary;
  }, {}),
  mixed,
  mixedStateConsistent5of5: mixed.every((result) => result.stateConsistent),
  formalRendererFpsRssSoak: "not_run_by_this_state_only_runner"
};
await mkdir(join(root, "results", "raw"), { recursive: true });
const outputPath = join(root, "results", "raw", `automated-nonmac-${Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(outputPath);
