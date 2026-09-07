import { describe, expect, it, vi } from "vitest";
import { err, type ProjectId, type SourceGrant, type SourceId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { deleteProjectWorkspace, resumePendingProjectDeletions } from "./ProjectWorkspaceActions";

const projectId = "delete-project" as ProjectId;
const firstSourceId = "delete-source-a" as SourceId;
const secondSourceId = "delete-source-b" as SourceId;

function sourceGrant(sourceId: SourceId, displayName: string): SourceGrant {
  return { sourceId, displayName, status: "ready", restored: false };
}

describe("deleteProjectWorkspace", () => {
  it("keeps the project retryable when source cleanup fails, then converges on retry", async () => {
    const projectStore = new MemoryProjectStore();
    const created = await projectStore.createProject({ id: projectId, name: "Delete me", createdAt: "2026-09-07T00:00:00.000Z" });
    if (!created.ok) throw new Error("project fixture failed");
    const workspace = {
      ...created.value,
      sources: [
        { id: firstSourceId, displayName: "A", createdAt: created.value.createdAt },
        { id: secondSourceId, displayName: "B", createdAt: created.value.createdAt },
      ],
    };
    const saved = await projectStore.saveWorkspace(workspace, created.value.revision);
    if (!saved.ok) throw new Error("workspace fixture failed");
    const persistedWorkspace = { ...workspace, revision: saved.value.revision };
    const photoSource = new MemoryPhotoSource([
      { grant: sourceGrant(firstSourceId, "A") },
      { grant: sourceGrant(secondSourceId, "B") },
    ]);
    const originalRemoveSource = photoSource.removeSource.bind(photoSource);
    vi.spyOn(photoSource, "removeSource")
      .mockImplementationOnce(originalRemoveSource)
      .mockImplementationOnce(async () => err({ kind: "io", retryable: true }))
      .mockImplementation(originalRemoveSource);

    const failed = await deleteProjectWorkspace({ projectStore, photoSource }, persistedWorkspace.projectId);

    expect(failed).toEqual({
      ok: false,
      error: { kind: "source-cleanup-failed", sourceId: secondSourceId, cause: { kind: "io", retryable: true } },
    });
    expect((await projectStore.loadWorkspace(projectId)).ok).toBe(true);

    const pending = await projectStore.loadWorkspace(projectId);
    expect(pending.ok && typeof pending.value.deletionPendingAt).toBe("string");
    const projects = await projectStore.listProjects();
    if (!projects.ok) throw new Error("project list fixture failed");

    const recovery = await resumePendingProjectDeletions({ projectStore, photoSource }, projects.value);

    expect(recovery).toEqual({ projects: [], failures: [] });
    expect(await projectStore.loadWorkspace(projectId)).toEqual({
      ok: false,
      error: { kind: "not-found", entity: "project", id: projectId },
    });
  });
});
