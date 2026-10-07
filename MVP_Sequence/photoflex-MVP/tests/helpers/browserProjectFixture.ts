import type { ProjectId, ProjectWorkspace } from "../../src/contracts";
import { createWorkspace, isWorkspace } from "../../src/platform/projectStoreData";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";

/** Browser fixtures use current defaults; old schemas belong in migration tests. */
export function createBrowserWorkspace(input: Omit<Partial<ProjectWorkspace>, "schemaVersion"> &
  Pick<ProjectWorkspace, "projectId" | "name" | "createdAt">): ProjectWorkspace {
  const defaults = createWorkspace({ id: input.projectId, name: input.name, createdAt: input.createdAt });
  const workspace = { ...defaults, ...input, schemaVersion: defaults.schemaVersion,
    worktableDraft: { ...defaults.worktableDraft, ...input.worktableDraft } };
  if (!isWorkspace(workspace)) throw new Error("Browser project fixture does not match the current workspace contract.");
  return workspace;
}

export async function importBrowserBackup(document: string): Promise<string> {
  const store = IndexedDbProjectStore.open();
  try {
    const result = await store.importBackup(new TextEncoder().encode(document));
    if (!result.ok) throw new Error("Browser backup import failed: " + JSON.stringify(result.error));
    return result.value;
  } finally { await store.close(); }
}

export async function exportBrowserBackup(projectId: string): Promise<string> {
  const store = IndexedDbProjectStore.open();
  try {
    const result = await store.exportBackup(projectId as ProjectId);
    if (!result.ok) throw new Error("Browser backup export failed: " + JSON.stringify(result.error));
    return new TextDecoder().decode(result.value);
  } finally { await store.close(); }
}
