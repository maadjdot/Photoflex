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

  it("只填写项目名称即可创建，项目备注会成为 Table Memo", async () => {
    const projectStore = new MemoryProjectStore();
    render(
      <App
        dependencies={{
          projectStore,
          photoSource: new MemoryPhotoSource(),
        }}
      />,
    );
    await screen.findByRole("heading", { name: "Your Projects" });
    screen.getByRole("button", { name: "Create a project" }).click();
    const createButton = await screen.findByRole("button", { name: "Create project" });

    expect((createButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Folderless Project" } });
    fireEvent.change(screen.getByLabelText("Project memo"), { target: { value: "Opening direction" } });
    expect((createButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(createButton);

    expect((await screen.findByLabelText("Memo text") as HTMLTextAreaElement).value).toBe("Opening direction");
    const listed = await projectStore.listProjects();
    expect(listed.ok && listed.value[0]).toMatchObject({ name: "Folderless Project", sourceCount: 0 });
  });

  it("从项目首页进入项目时默认打开 Table", async () => {
    const projectStore = new MemoryProjectStore();
    const projectId = "project-default-table" as ProjectId;
    const created = await projectStore.createProject({ id: projectId, name: "Default Table", createdAt: "2026-09-05T08:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture not created");
    const photoId = "default-table-photo" as import("../contracts").PhotoId;
    const saved = await projectStore.saveWorktable(projectId, {
      ...created.value.worktableDraft,
      entryOrder: [photoId],
      placements: { [photoId]: { photoId, x: 0, y: 0, z: 1, width: 100, height: 150, filename: "default-table-photo.jpg" } },
    }, created.value.revision);
    if (!saved.ok) throw new Error("project worktable not saved");
    render(<App dependencies={{ projectStore, photoSource: new MemoryPhotoSource() }} />);

    fireEvent.click(await screen.findByRole("button", { name: /Open project Default Table/ }));
    expect(await screen.findByLabelText("Photo worktable")).toBeTruthy();
    expect(window.location.hash).toBe(`#/projects/${projectId}/table`);
  });

  it("首页的项目设置跟随当前选中的项目，Table 顶部不再显示该按钮", async () => {
    const projectStore = new MemoryProjectStore();
    for (const [id, name] of [["first-project", "First Project"], ["second-project", "Second Project"]] as const) {
      const created = await projectStore.createProject({ id: id as ProjectId, name, createdAt: "2026-09-05T08:00:00.000Z" });
      if (!created.ok) throw new Error("project fixture not created");
    }
    render(<App dependencies={{ projectStore, photoSource: new MemoryPhotoSource() }} />);

    expect(await screen.findByRole("button", { name: "Project settings" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Second Project" }));
    fireEvent.click(screen.getByRole("button", { name: "Project settings" }));
    await waitFor(() => expect(window.location.hash).toBe("#/projects/second-project"));

    window.location.hash = "#/projects/first-project/table";
    expect(await screen.findByLabelText("Photo worktable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Project settings" })).toBeNull();
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

    await screen.findByRole("button", { name: "Drag Project" });
    fireEvent.click(screen.getByRole("button", { name: "Delete project Drag Project" }));

    await waitFor(async () => {
      const result = await projectStore.listProjects();
      expect(result.ok && result.value).toHaveLength(0);
    });
    expect(screen.queryByText("Drag Project")).toBeNull();
  });
});
