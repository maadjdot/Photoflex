import { describe, expect, it } from "vitest";
import { decideFramework, type DecisionInput, type FrameworkEvidence } from "../src/index";

const passEvidence = (): FrameworkEvidence => ({
  fileSafety: "pass",
  database: "pass",
  whiteboard: "pass",
  gateFailures: 0,
  macosEvidence: "pass"
});

const base = (): DecisionInput => ({
  versionDrift: "resolved",
  browserWhiteboard: "pass",
  pivotWhiteboard: "not_run",
  timebox: "within",
  tauri: passEvidence(),
  electron: { ...passEvidence(), validation: "complete" }
});

describe("single decision tree", () => {
  it("chooses Tauri when all hard gates pass and no more than one count gate fails", () => {
    expect(decideFramework(base()).code).toBe("choose_tauri");
    expect(decideFramework({ ...base(), tauri: { ...passEvidence(), gateFailures: 1 } }).code).toBe("choose_tauri_with_limit");
  });

  it("does not let a low count hide a whiteboard hard-gate failure", () => {
    const input = base();
    input.tauri.whiteboard = "fail_tauri_specific";

    expect(decideFramework(input).code).toBe("choose_electron");
  });

  it("returns a unique inconclusive result for unresolved drift or missing Mac evidence", () => {
    expect(decideFramework({ ...base(), versionDrift: "unresolved" }).code).toBe("inconclusive_version_drift");
    const input = base();
    input.tauri.macosEvidence = "blocked_device";
    expect(decideFramework(input).code).toBe("provisional_windows");
  });

  it("requires scope change when both frameworks fail the count gate", () => {
    const input = base();
    input.tauri.gateFailures = 2;
    input.electron.gateFailures = 2;

    expect(decideFramework(input).code).toBe("needs_scope_change");
  });
});
