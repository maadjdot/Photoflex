import { err, ok, type DeleteError, type LoadError, type ProjectId, type ProjectSummary, type ProjectWorkspace, type Result, type SaveError, type SourceError, type SourceId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { stopSharedScan } from "./ProjectSourceMonitor";

export type DeleteProjectWorkspaceError =
  | { readonly kind: "project-load-failed"; readonly cause: LoadError }
  | { readonly kind: "project-mark-failed"; readonly cause: SaveError }
  | { readonly kind: "source-cleanup-failed"; readonly sourceId: SourceId; readonly cause: SourceError }
  | { readonly kind: "project-delete-failed"; readonly cause: DeleteError };

export interface PendingProjectDeletionRecovery {
  readonly projects: readonly ProjectSummary[];
  readonly failures: readonly { readonly projectId: ProjectId; readonly error: DeleteProjectWorkspaceError }[];
}

/**
 * Cross-adapter deletion saga. Source cleanup happens first so a failure never
 * leaves source data unreachable after its owning project has disappeared.
 * Missing sources count as already cleaned, making a partial attempt retryable.
 */
export async function deleteProjectWorkspace(
  dependencies: AppDependencies,
  projectId: ProjectId,
): Promise<Result<void, DeleteProjectWorkspaceError>> {
  const loaded = await dependencies.projectStore.loadWorkspace(projectId);
  if (!loaded.ok) {
    return loaded.error.kind === "not-found"
      ? ok(undefined)
      : err({ kind: "project-load-failed", cause: loaded.error });
  }
  return continueProjectDeletion(dependencies, loaded.value);
}

export async function resumePendingProjectDeletions(
  dependencies: AppDependencies,
  projects: readonly ProjectSummary[],
): Promise<PendingProjectDeletionRecovery> {
  const remaining: ProjectSummary[] = [];
  const failures: Array<{ projectId: ProjectId; error: DeleteProjectWorkspaceError }> = [];
  for (const project of projects) {
    const loaded = await dependencies.projectStore.loadWorkspace(project.id);
    if (!loaded.ok) {
      if (loaded.error.kind !== "not-found") {
        remaining.push(project);
        failures.push({ projectId: project.id, error: { kind: "project-load-failed", cause: loaded.error } });
      }
      continue;
    }
    if (!loaded.value.deletionPendingAt) {
      remaining.push(project);
      continue;
    }
    const deleted = await continueProjectDeletion(dependencies, loaded.value);
    if (!deleted.ok) {
      remaining.push(project);
      failures.push({ projectId: project.id, error: deleted.error });
    }
  }
  return { projects: remaining, failures };
}

async function continueProjectDeletion(
  dependencies: AppDependencies,
  workspace: ProjectWorkspace,
): Promise<Result<void, DeleteProjectWorkspaceError>> {
  let pendingWorkspace = workspace;
  if (!workspace.deletionPendingAt) {
    const deletionPendingAt = new Date().toISOString();
    const marked = await dependencies.projectStore.saveWorkspace(
      { ...workspace, deletionPendingAt, updatedAt: deletionPendingAt },
      workspace.revision,
    );
    if (!marked.ok) return err({ kind: "project-mark-failed", cause: marked.error });
    pendingWorkspace = { ...workspace, deletionPendingAt, updatedAt: deletionPendingAt, revision: marked.value.revision };
  }
  for (const source of pendingWorkspace.sources) stopSharedScan(dependencies.photoSource, source.id);

  for (const source of pendingWorkspace.sources) {
    const removed = await dependencies.photoSource.removeSource(source.id);
    if (!removed.ok && removed.error.kind !== "source-not-found") {
      return err({ kind: "source-cleanup-failed", sourceId: source.id, cause: removed.error });
    }
  }

  const deleted = await dependencies.projectStore.deleteProject(pendingWorkspace.projectId);
  return deleted.ok
    ? ok(undefined)
    : err({ kind: "project-delete-failed", cause: deleted.error });
}

export function projectDeletionErrorMessage(error: DeleteProjectWorkspaceError) {
  if (error.kind === "source-cleanup-failed") return "照片来源清理失败，项目已标记待删除；下次启动会继续清理。";
  if (error.kind === "project-mark-failed") return "无法安全标记待删除项目，项目未被修改；请重试。";
  return "项目删除失败，请重试。";
}
