import { useCallback, useEffect, useRef, useState } from "react";
import {
  err,
  ok,
  type ProjectId,
  type ProjectWorkspace,
  type Result,
  type SaveError,
} from "../contracts";
import type { AppDependencies } from "./dependencies";

export type WorkspaceUpdate =
  | ProjectWorkspace
  | ((current: ProjectWorkspace) => ProjectWorkspace);

export type WorkspaceSaveError = SaveError | { readonly kind: "workspace-not-ready" };
export type WorkspaceSaveResult = Result<ProjectWorkspace, WorkspaceSaveError>;

export function workspaceSaveErrorMessage(error: WorkspaceSaveError): string {
  if (error.kind === "conflict") return "项目已在其他标签页更新，请刷新后重试。";
  if (error.kind === "quota-exceeded") return "浏览器存储空间不足，当前状态未覆盖。";
  if (error.kind === "not-found") return "项目已不存在，请返回 Home。";
  if (error.kind === "unsupported-storage-schema") return "项目数据来自不兼容的版本，无法保存。";
  if (error.kind === "migration-failed") return "项目数据升级失败，当前状态未保存。";
  if (error.kind === "workspace-not-ready") return "项目尚未载入，当前状态未保存。";
  return error.retryable ? "存储暂时不可用，请稍后重试。" : "此浏览器无法使用项目存储。";
}

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
    (update: WorkspaceUpdate): Promise<WorkspaceSaveResult> => {
      const run = async () => {
        const current = workspaceRef.current;
        if (!current) return err({ kind: "workspace-not-ready" } as const);
        const requested = typeof update === "function" ? update(current) : update;
        if (requested === current) return ok(current);
        const next = { ...requested, revision: current.revision };
        const result = await dependencies.projectStore.saveWorkspace(next, current.revision);
        if (!result.ok) return result;
        const saved = { ...next, revision: result.value.revision };
        workspaceRef.current = saved;
        setWorkspace(saved);
        return ok(saved);
      };
      const pending = saveQueueRef.current.then(run, run);
      saveQueueRef.current = pending.then(() => undefined, () => undefined);
      return pending;
    },
    [dependencies.projectStore],
  );

  return { workspace, workspaceRef, setWorkspace, save, loading, error };
}
