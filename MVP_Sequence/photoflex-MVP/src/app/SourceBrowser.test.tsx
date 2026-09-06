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

    expect(await screen.findByText("A.jpg")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Photo Sources" }));
    expect(screen.getByRole("button", { name: "Photo Sources" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Photo Sources" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("navigation", { name: "Photo source directory" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search photos"), { target: { value: "B.jpg" } });
    expect(screen.queryByText("A.jpg")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search photos"), { target: { value: "" } });
    fireEvent.click(await screen.findByRole("button", { name: "A.jpg" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add 1 to Table" }));
    await waitFor(() => expect(onPlacePhotos).toHaveBeenCalledWith([photos[0]]));
  });
});
