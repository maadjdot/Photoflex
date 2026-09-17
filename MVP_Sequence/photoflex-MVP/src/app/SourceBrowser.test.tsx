// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, ProjectWorkspace, SourceId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { SourceBrowser } from "./SourceBrowser";

const projectId = "source-browser-project" as ProjectId;
const sourceId = "source-browser-source" as SourceId;

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("SourceBrowser", () => {
  it("uses one reconnect action for all sources when the selection is All", async () => {
    const projectStore = new MemoryProjectStore();
    const created = await projectStore.createProject({ id: projectId, name: "Sources", createdAt: "2026-09-01T00:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture failed");
    const photoSource = new MemoryPhotoSource([{ grant: { sourceId, displayName: "Selects", status: "offline", restored: true }, photos: [] }]);
    const reconnectAll = vi.fn(async () => ({ reconnected: [sourceId], unmatched: [] }));
    const reconnectOne = vi.fn();
    render(<SourceBrowser dependencies={{ projectStore, photoSource }} projectId={projectId} workspace={{ ...created.value, sources: [{ id: sourceId, displayName: "Selects", createdAt: created.value.createdAt }] }} onPlacePhotos={vi.fn()} onOpenPhoto={() => {}} onAddSource={() => {}} onReconnectSource={reconnectOne} onReconnectSavedSources={reconnectAll} onPhotoError={() => {}} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Select photo source" }), { target: { value: "all" } });
    fireEvent.click(await screen.findByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(reconnectAll).toHaveBeenCalledOnce());
    expect(reconnectOne).not.toHaveBeenCalled();
  });

  it("shows one parent-folder action and individual selection only for unmatched folders", async () => {
    const projectStore = new MemoryProjectStore();
    const created = await projectStore.createProject({ id: projectId, name: "Sources", createdAt: "2026-09-01T00:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture failed");
    const changedId = "source-browser-changed" as SourceId;
    const sources = [
      { id: sourceId, displayName: "Photos", createdAt: created.value.createdAt, kind: "folder" as const },
      { id: changedId, displayName: "Old name", createdAt: created.value.createdAt, kind: "folder" as const },
    ];
    const photoSource = new MemoryPhotoSource();
    const reconnectAll = vi.fn(async () => ({ reconnected: [sourceId], unmatched: [changedId] }));
    const reconnectOne = vi.fn(async () => true);
    render(<SourceBrowser dependencies={{ projectStore, photoSource }} projectId={projectId} workspace={{ ...created.value, sources }} onPlacePhotos={vi.fn()} onOpenPhoto={() => {}} onAddSource={() => {}} onRemoveSource={vi.fn()} onReconnectSource={reconnectOne} onReconnectAllSources={reconnectAll} onPhotoError={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Manage photo sources" }));
    fireEvent.click(screen.getByRole("button", { name: "Reconnect all folders" }));
    await screen.findByText("Folders reconnected: 1; needing individual selection: 1.");
    expect(reconnectAll).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    await waitFor(() => expect(reconnectOne).toHaveBeenCalledWith(changedId));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Choose folder" })).toBeNull());
  });

  it("offers folder reconnection when a scan has failed", async () => {
    const projectStore = new MemoryProjectStore();
    const created = await projectStore.createProject({ id: projectId, name: "Sources", createdAt: "2026-09-01T00:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture failed");
    const photoSource = new MemoryPhotoSource([{ grant: { sourceId, displayName: "Selects", status: "error", restored: true }, photos: [] }]);
    const reconnect = vi.fn();
    render(<SourceBrowser dependencies={{ projectStore, photoSource }} projectId={projectId} workspace={{ ...created.value, sources: [{ id: sourceId, displayName: "Selects", createdAt: created.value.createdAt }] }} onPlacePhotos={vi.fn()} onOpenPhoto={() => {}} onAddSource={() => {}} onReconnectSource={reconnect} onPhotoError={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reconnect" }));
    expect(reconnect).toHaveBeenCalledWith(sourceId);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows a clear loading state while a selected source has not returned photos", async () => {
    const projectStore = new MemoryProjectStore();
    const created = await projectStore.createProject({ id: projectId, name: "Sources", createdAt: "2026-09-01T00:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture failed");
    const photoSource = new MemoryPhotoSource();
    let finishLoading: ((value: Awaited<ReturnType<MemoryPhotoSource["listPhotos"]>>) => void) | undefined;
    vi.spyOn(photoSource, "listPhotos").mockImplementation(() => new Promise((resolve) => { finishLoading = resolve; }));

    render(<SourceBrowser dependencies={{ projectStore, photoSource }} projectId={projectId} workspace={{ ...created.value, sources: [{ id: sourceId, displayName: "Selects", createdAt: created.value.createdAt }] }} onPlacePhotos={vi.fn().mockResolvedValue(true)} onOpenPhoto={() => {}} onAddSource={() => {}} onPhotoError={() => {}} />);

    expect((await screen.findByRole("status")).textContent).toContain("Loading photos…");
    expect(screen.queryByText("No photos match this view.")).toBeNull();
    finishLoading?.({ ok: true, value: { items: [], nextCursor: null, issues: [] } });
  });

  it("keeps loading visible when the list is empty but the folder scan is still running", async () => {
    const projectStore = new MemoryProjectStore();
    const created = await projectStore.createProject({ id: projectId, name: "Sources", createdAt: "2026-09-01T00:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture failed");
    const photoSource = new MemoryPhotoSource([{ grant: { sourceId, displayName: "Selects", status: "loading", restored: true }, photos: [] }]);
    let finishScan!: () => void;
    const pending = new Promise<void>((resolve) => { finishScan = resolve; });
    vi.spyOn(photoSource, "scan").mockImplementation(async function* () {
      await pending;
      yield { ok: true as const, value: { kind: "completed" as const, state: { sourceId, status: "empty" as const, indexedCount: 0, discoveredCount: 0, skippedCount: 0, failedCount: 0 } } };
    });
    const list = vi.spyOn(photoSource, "listPhotos");
    render(<SourceBrowser dependencies={{ projectStore, photoSource }} projectId={projectId} workspace={{ ...created.value, sources: [{ id: sourceId, displayName: "Selects", createdAt: created.value.createdAt }] }} onPlacePhotos={vi.fn()} onOpenPhoto={() => {}} onAddSource={() => {}} onPhotoError={() => {}} />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toContain("Loading photos…");
    expect(screen.queryByText("No photos match this view.")).toBeNull();
    await act(async () => finishScan());
    await screen.findByText("No photos match this view.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("aggregates source photos, filters them and submits selected photos through one callback", async () => {
    const projectStore = new MemoryProjectStore();
    const created = await projectStore.createProject({ id: projectId, name: "Sources", createdAt: "2026-09-01T00:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture failed");
    const workspace: ProjectWorkspace = created.value;
    const photos = [
      { id: "source-photo-a" as PhotoId, sourceId, relativePath: "A.jpg", width: 1200, height: 900 },
      { id: "source-photo-b" as PhotoId, sourceId, relativePath: "B.jpg", width: 900, height: 1200 },
    ];
    const photoSource = new MemoryPhotoSource([{ grant: { sourceId, displayName: "Selects", status: "ready", restored: true }, photos, previewUrls: { "source-photo-a": "memory:a", "source-photo-b": "memory:b" } as Record<PhotoId, string> }]);
    const onPlacePhotos = vi.fn().mockResolvedValue(true);
    render(<SourceBrowser dependencies={{ projectStore, photoSource }} projectId={projectId} workspace={{ ...workspace, sources: [{ id: sourceId, displayName: "Selects", createdAt: workspace.createdAt }] }} onPlacePhotos={onPlacePhotos} onOpenPhoto={() => {}} onAddSource={() => {}} onPhotoError={() => {}} />);

    expect(await screen.findByRole("button", { name: "A.jpg" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Photo Sources" }));
    expect(screen.getByRole("button", { name: "Open Photo Sources" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Photo Sources" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Photo Sources" }));
    expect(screen.getByRole("navigation", { name: "Photo source directory" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "A.jpg" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add to Table" }));
    await waitFor(() => expect(onPlacePhotos).toHaveBeenCalledWith([photos[0]]));
  });
});
