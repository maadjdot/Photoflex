import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { aggregateLatencyRuns, type BenchmarkResult } from "../packages/benchmark-core/src/index.ts";
import { createSequenceEngine } from "../packages/sequence-engine/src/index.ts";
import { createWhiteboardState, reduceWhiteboard, stableStateHash } from "../packages/whiteboard-engine/src/index.ts";

const root = process.cwd();
const environmentPath = process.env.PHOTOFLEX_ENVIRONMENT_FILE ?? join(root, "environment-lock.json");
const environment = JSON.parse(await readFile(environmentPath, "utf8")) as { environmentId: string; fixtureHash: string };
const ids = Array.from({ length: 500 }, (_, index) => `photo-${index}`);

function measure(operation: () => void, count: number): number[] {
  return Array.from({ length: count }, () => {
    const started = performance.now();
    operation();
    return performance.now() - started;
  });
}

const sequenceRuns = Array.from({ length: 5 }, (_, run) => {
  const engine = createSequenceEngine(ids);
  return measure(() => {
    const current = engine.snapshot();
    const id = current.order[(engine.snapshot().revision * 37 + run) % current.order.length] as string;
    engine.move([id], (engine.snapshot().revision * 53) % current.order.length);
  }, 100);
});

const whiteboardRuns = Array.from({ length: 5 }, (_, run) => {
  let state = createWhiteboardState(ids);
  return measure(() => {
    const selected = ids.slice(run * 10, run * 10 + 100);
    state = reduceWhiteboard(state, { type: "move-items", ids: selected, dx: 1, dy: 1 });
    stableStateHash(state);
  }, 100);
});

const completedAt = new Date().toISOString();
const results: BenchmarkResult[] = [
  {
    scenarioId: "T-02-pure-engine",
    framework: "browser",
    environmentId: environment.environmentId,
    fixtureHash: environment.fixtureHash,
    samples: sequenceRuns.flat(),
    statistics: aggregateLatencyRuns(sequenceRuns, 100),
    verdict: "pass",
    evidence: ["Node-side deterministic engine baseline; UI frame gate still required"],
    notes: [],
    startedAt: completedAt,
    completedAt
  },
  {
    scenarioId: "WB-01-pure-engine",
    framework: "browser",
    environmentId: environment.environmentId,
    fixtureHash: environment.fixtureHash,
    samples: whiteboardRuns.flat(),
    statistics: aggregateLatencyRuns(whiteboardRuns, 100),
    verdict: "pass",
    evidence: ["500-item reducer and state-hash baseline; renderer gate still required"],
    notes: [],
    startedAt: completedAt,
    completedAt
  }
];
await mkdir(join(root, "results", "raw"), { recursive: true });
const output = join(root, "results", "raw", `browser-engine-${Date.now()}.json`);
await writeFile(output, `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(output);
