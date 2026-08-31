import { describe, expect, it } from "vitest";
import { workspaceSaveErrorMessage } from "./useProjectWorkspace";

describe("workspaceSaveErrorMessage", () => {
  it("preserves actionable save failure distinctions", () => {
    expect(workspaceSaveErrorMessage({ kind: "conflict", expectedRevision: 1 as never, actualRevision: 2 as never })).toContain("其他标签页");
    expect(workspaceSaveErrorMessage({ kind: "quota-exceeded" })).toContain("存储空间不足");
    expect(workspaceSaveErrorMessage({ kind: "not-found", entity: "project", id: "missing" })).toContain("不存在");
  });
});
