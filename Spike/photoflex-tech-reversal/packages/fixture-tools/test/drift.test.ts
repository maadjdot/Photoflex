import { describe, expect, it } from "vitest";
import { compareEnvironments } from "../src/environment";

describe("environment cohort drift", () => {
  it("maps changed components to the exact suites that must be rerun", () => {
    const previous = { webview2: "1", edge: "1", fixtureHash: "a", gpuDriver: "g1" };
    const current = { webview2: "2", edge: "1", fixtureHash: "b", gpuDriver: "g1" };
    const result = compareEnvironments(previous, current);

    expect(result.changedKeys).toEqual(["fixtureHash", "webview2"]);
    expect(result.requiredReruns).toEqual(expect.arrayContaining(["T-01", "T-02", "T-06", "WB-01", "MIX-01", "SOAK"]));
    expect(result.cohortCompatible).toBe(false);
  });

  it("keeps the cohort when all locked values match", () => {
    const lock = { node: "24", fixtureHash: "same" };
    expect(compareEnvironments(lock, lock)).toEqual({ changedKeys: [], requiredReruns: [], cohortCompatible: true });
  });
});
