import type { ProjectWorkspace } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { stopSharedScan } from "./ProjectSourceMonitor";
export async function deleteProjectWorkspace(dependencies: AppDependencies, workspace: ProjectWorkspace) { const deleted = await dependencies.projectStore.deleteProject(workspace.projectId); if (!deleted.ok) return false; await Promise.all(workspace.sources.map(async (source) => { stopSharedScan(dependencies.photoSource, source.id); await dependencies.photoSource.removeSource(source.id); })); return true; }
