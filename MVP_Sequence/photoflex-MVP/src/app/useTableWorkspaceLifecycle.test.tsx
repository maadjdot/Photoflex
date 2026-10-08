// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProjectId, WorktableViewport } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { createProjectWriteCoordinator } from "./projectWriteCoordinator";
import { useTableWorkspaceLifecycle } from "./useTableWorkspaceLifecycle";

const projectId = "table-lifecycle-project" as ProjectId;

it("restores Table state and persists the latest viewport through its lifecycle interface", async () => {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Lifecycle", createdAt: "2026-09-07T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const restoredViewport: WorktableViewport = { originX: 120, originY: 80, zoom: 0.75 };
  const saved = await projectStore.saveWorkspace({
    ...created.value,
    resumeContext: { page: "table", filter: "all", tableViewport: restoredViewport },
  }, created.value.revision);
  if (!saved.ok) throw new Error("workspace fixture failed");
  const workspace = await projectStore.loadWorkspace(projectId);
  if (!workspace.ok) throw new Error("workspace fixture could not be loaded");
  const coordinator = createProjectWriteCoordinator({ projectStore, photoSource: new MemoryPhotoSource() }, projectId);
  const resetCommittedDraft = vi.fn();
  const onInitialized = vi.fn();
  const onError = vi.fn();
  const { result, unmount } = renderHook(() => useTableWorkspaceLifecycle({
    projectId,
    workspace: workspace.value,
    coordinator,
    resetCommittedDraft,
    activeSequenceId: undefined,
    onInitialized,
    onError,
  }));

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.initialViewport).toEqual(restoredViewport);
  expect(resetCommittedDraft).toHaveBeenCalledWith(workspace.value.worktableDraft);
  await waitFor(() => expect(onInitialized).toHaveBeenCalledWith({ summaries: [], activeSequenceId: undefined }));

  const nextViewport: WorktableViewport = { originX: 240, originY: 160, zoom: 1.25 };
  act(() => result.current.onViewportChange(nextViewport));
  await new Promise((resolve) => window.setTimeout(resolve, 550));
  await coordinator.flush();
  const persisted = await projectStore.loadWorkspace(projectId);
  expect(persisted.ok && persisted.value.resumeContext?.tableViewport).toEqual(nextViewport);

  unmount();
  coordinator.dispose();
});

it("does not overwrite the saved viewport when Table leaves before initialization", async () => {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Loading", createdAt: "2026-09-07T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const viewport = { originX: -4200, originY: -1800, zoom: 0.75 };
  await projectStore.saveWorkspace({ ...created.value, resumeContext: { page: "table", filter: "all", tableViewport: viewport } }, created.value.revision);
  const coordinator = createProjectWriteCoordinator({ projectStore, photoSource: new MemoryPhotoSource() }, projectId);
  await coordinator.load();
  const { unmount } = renderHook(() => useTableWorkspaceLifecycle({
    projectId, coordinator, resetCommittedDraft: vi.fn(), onInitialized: vi.fn(), onError: vi.fn(),
  }));
  unmount();
  await coordinator.flush();
  const saved = await projectStore.loadWorkspace(projectId);
  expect(saved.ok && saved.value.resumeContext?.tableViewport).toEqual(viewport);
  coordinator.dispose();
});

it("saves the last viewport when leaving before the pan debounce finishes", async () => {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Pending pan", createdAt: "2026-09-07T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const coordinator = createProjectWriteCoordinator({ projectStore, photoSource: new MemoryPhotoSource() }, projectId);
  const resetCommittedDraft = vi.fn(), onInitialized = vi.fn(), onError = vi.fn();
  const { result, unmount } = renderHook(() => useTableWorkspaceLifecycle({
    projectId, workspace: created.value, coordinator, resetCommittedDraft, onInitialized, onError,
  }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const viewport = { originX: -5200, originY: -3800, zoom: 0.75 };
  act(() => result.current.onViewportChange(viewport));
  unmount();
  await coordinator.flush();
  const saved = await projectStore.loadWorkspace(projectId);
  expect(saved.ok && saved.value.resumeContext?.tableViewport).toEqual(viewport);
  coordinator.dispose();
});
