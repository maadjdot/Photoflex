// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProjectId } from "../../contracts";
import { MemoryProjectStore } from "../../platform/memory/MemoryProjectStore";
import { PROJECT_INPUT } from "../../../tests/helpers/fixtures";
import { useWorkspace } from "./useWorkspace";

describe("useWorkspace", () => {
  it("把同时发出的 CAS 写入串行到最新 revision", async () => {
    const store = new MemoryProjectStore();
    const created = await store.createProject(PROJECT_INPUT);
    if (!created.ok) throw new Error("测试项目未创建");

    const { result } = renderHook(() => useWorkspace(store, PROJECT_INPUT.id as ProjectId));
    await waitFor(() => expect(result.current.workspace).toBeTruthy());

    await act(async () => {
      const first = result.current.save((current) => ({ ...current, memo: "first" }));
      const second = result.current.save((current) => ({ ...current, name: "second" }));
      const results = await Promise.all([first, second]);
      expect(results.every((saveResult) => saveResult.ok)).toBe(true);
    });

    expect(result.current.workspace).toMatchObject({ memo: "first", name: "second", revision: 2 });
  });
});
