// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { App } from "./App";

describe("M1 app", () => {
  beforeEach(() => {
    window.location.hash = "#/";
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("显示项目首页", async () => {
    render(
      <App
        dependencies={{
          projectStore: new MemoryProjectStore(),
          photoSource: new MemoryPhotoSource(),
        }}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Your Projects" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /New project/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Create a project" })).toBeTruthy();
    expect(screen.getByRole("banner").classList.contains("is-table")).toBe(true);
    expect(screen.getByRole("banner").classList.contains("is-home")).toBe(true);
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
  });

  it("创建项目时要求名称与照片文件夹", async () => {
    render(
      <App
        dependencies={{
          projectStore: new MemoryProjectStore(),
          photoSource: new MemoryPhotoSource(),
        }}
      />,
    );
    await screen.findByRole("heading", { name: "Your Projects" });
    screen.getByRole("button", { name: "Create a project" }).click();
    const createButton = await screen.findByRole("button", { name: "Create project" });

    // Figma 交互要求资料齐全前不可提交，因此这里验证禁用状态，而不是提交后的报错。
    expect((createButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("从项目首页进入项目时默认打开 Table", async () => {
    const projectStore = new MemoryProjectStore();
    const projectId = "project-default-table" as ProjectId;
    const created = await projectStore.createProject({ id: projectId, name: "Default Table", createdAt: "2026-09-05T08:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture not created");
    render(<App dependencies={{ projectStore, photoSource: new MemoryPhotoSource() }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Open project Default Table" }));
    expect(await screen.findByLabelText("Photo worktable")).toBeTruthy();
    expect(window.location.hash).toBe(`#/projects/${projectId}/table`);
  });

  it("可以从项目列表删除项目", async () => {
    const projectStore = new MemoryProjectStore();
    const projectId = "drag-project" as ProjectId;
    const created = await projectStore.createProject({
      id: projectId,
      name: "Drag Project",
      createdAt: "2026-09-05T08:00:00.000Z",
    });
    if (!created.ok) throw new Error("fixture project not created");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <App
        dependencies={{
          projectStore,
          photoSource: new MemoryPhotoSource(),
        }}
      />,
    );

    await screen.findByRole("button", { name: "Open project Drag Project" });
    fireEvent.click(screen.getByRole("button", { name: "Delete project Drag Project" }));

    await waitFor(async () => {
      const result = await projectStore.listProjects();
      expect(result.ok && result.value).toHaveLength(0);
    });
    expect(screen.queryByText("Drag Project")).toBeNull();
  });
});
