import { describe, expect, it } from "vitest";
import { MemoryProjectStore } from "../../src/platform/memory/MemoryProjectStore";
import { PROJECT_ID, PROJECT_INPUT } from "../helpers/fixtures";

describe("MemoryProjectStore 失败模式", () => {
  it("返回 not-found、quota、corrupt 与 unavailable 联合类型", async () => {
    const normal = new MemoryProjectStore();
    expect(await normal.loadWorkspace(PROJECT_ID)).toMatchObject({
      ok: false,
      error: { kind: "not-found" },
    });

    const quota = new MemoryProjectStore(undefined, { quotaExceeded: true });
    expect(await quota.createProject(PROJECT_INPUT)).toEqual({
      ok: false,
      error: { kind: "quota-exceeded" },
    });

    const corruptDatabase = {
      projects: new Map(),
      photos: new Map(),
      versions: new Map(),
      sequences: new Map(),
      layouts: new Map(),
      corruptProjectIds: new Set([PROJECT_ID]),
    };
    const corrupt = new MemoryProjectStore(corruptDatabase);
    expect(await corrupt.loadWorkspace(PROJECT_ID)).toEqual({
      ok: false,
      error: { kind: "corrupt-data", entityId: PROJECT_ID },
    });

    const unavailable = new MemoryProjectStore(undefined, { unavailable: true });
    expect(await unavailable.listProjects()).toEqual({
      ok: false,
      error: { kind: "unavailable", retryable: true },
    });
  });
});
