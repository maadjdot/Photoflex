import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureEnvironment, compareEnvironments, generateFixtures, spikeRoot, type EnvironmentValues } from "./index.ts";

const root = spikeRoot();
const command = process.argv[2];
const lockPath = join(root, "environment-lock.json");

if (command === "fixture") {
  console.log(JSON.stringify(await generateFixtures(root), null, 2));
} else if (command === "env-capture") {
  const lock = captureEnvironment(root);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ lockPath, environmentId: lock.environmentId }, null, 2));
} else if (command === "env-verify") {
  const previous = JSON.parse(await readFile(lockPath, "utf8")) as EnvironmentValues;
  const current = captureEnvironment(root);
  const ignored = new Set(["capturedAt", "freeMemoryAtCaptureBytes"]);
  const strip = (source: EnvironmentValues) => Object.fromEntries(Object.entries(source).filter(([key]) => !ignored.has(key)));
  const report = compareEnvironments(strip(previous), strip(current));
  console.log(JSON.stringify({ previousEnvironmentId: previous.environmentId, currentEnvironmentId: current.environmentId, ...report }, null, 2));
  if (!report.cohortCompatible) process.exitCode = 2;
} else {
  console.error("Usage: cli.ts fixture | env-capture | env-verify");
  process.exitCode = 1;
}
