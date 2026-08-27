import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProjectId,
  ProjectStore,
  ProjectWorkspace,
  Result,
  SaveError,
} from "../../contracts";

type WorkspaceUpdate = (current: ProjectWorkspace) => ProjectWorkspace;
type WorkspaceNotLoaded = { readonly kind: "workspace-not-loaded" };
export type WorkspaceSaveResult = Result<ProjectWorkspace, SaveError | WorkspaceNotLoaded>;

export function useWorkspace(projectStore: ProjectStore, projectId: ProjectId) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const workspaceRef = useRef<ProjectWorkspace | undefined>(undefined);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const activeProjectRef = useRef(projectId);
  activeProjectRef.current = projectId;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setWorkspace(undefined);
    workspaceRef.current = undefined;
    saveQueueRef.current = Promise.resolve();

    void projectStore.loadWorkspace(projectId).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        workspaceRef.current = result.value;
        setWorkspace(result.value);
      } else {
        setError("项目数据无法读取，请返回 Home 重试。");
      }
    });
    return () => { active = false; };
  }, [projectId, projectStore]);

  const save = useCallback((update: WorkspaceUpdate): Promise<WorkspaceSaveResult> => {
    const run = async (): Promise<WorkspaceSaveResult> => {
      const current = workspaceRef.current;
      if (!current || current.projectId !== projectId) {
        return { ok: false, error: { kind: "workspace-not-loaded" } };
      }

      const next = update(current);
      const result = await projectStore.saveWorkspace(next, current.revision);
      if (!result.ok) return result;

      const saved = { ...next, revision: result.value.revision };
      if (activeProjectRef.current === projectId) {
        workspaceRef.current = saved;
        setWorkspace(saved);
      }
      return { ok: true, value: saved };
    };

    const queued = saveQueueRef.current.then(run, run);
    saveQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, [projectId, projectStore]);

  return { workspace, loading, error, save };
}
