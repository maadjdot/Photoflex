import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectId, ProjectWorkspace } from "../contracts";
import type { AppDependencies } from "./dependencies";

export type WorkspaceUpdate =
  | ProjectWorkspace
  | ((current: ProjectWorkspace) => ProjectWorkspace);

export function useProjectWorkspace(dependencies: AppDependencies, projectId: ProjectId) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const workspaceRef = useRef<ProjectWorkspace | undefined>(undefined);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setWorkspace(undefined);
    workspaceRef.current = undefined;
    saveQueueRef.current = Promise.resolve();
    void dependencies.projectStore.loadWorkspace(projectId).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        workspaceRef.current = result.value;
        setWorkspace(result.value);
      } else {
        setError("项目数据无法读取，请返回 Home 重试。");
      }
    });
    return () => {
      active = false;
    };
  }, [dependencies.projectStore, projectId]);

  const save = useCallback(
    (update: WorkspaceUpdate): Promise<boolean> => {
      const run = async () => {
        const current = workspaceRef.current;
        if (!current) return false;
        const requested = typeof update === "function" ? update(current) : update;
        const next = { ...requested, revision: current.revision };
        const result = await dependencies.projectStore.saveWorkspace(next, current.revision);
        if (!result.ok) return false;
        const saved = { ...next, revision: result.value.revision };
        workspaceRef.current = saved;
        setWorkspace(saved);
        return true;
      };
      const pending = saveQueueRef.current.then(run, run);
      saveQueueRef.current = pending.then(() => undefined, () => undefined);
      return pending;
    },
    [dependencies.projectStore],
  );

  return { workspace, workspaceRef, setWorkspace, save, loading, error };
}
