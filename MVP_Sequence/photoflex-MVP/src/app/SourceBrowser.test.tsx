// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    fireEvent.click(await screen.findByRole("button", { name: "Add 1 to Table" }));
    await waitFor(() => expect(onPlacePhotos).toHaveBeenCalledWith([photos[0]]));
  });
});
