import { createContext, createElement, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { ProjectId, ProjectWorkspace, WorktableDraft } from "../contracts";
import type { AppDependencies } from "./dependencies";
import {
  createProjectWriteCoordinator,
  type CoordinatorWorkspaceError,
  type CoordinatorWorkspaceResult,
  type ProjectWriteCoordinator,
  type ResumeContextUpdate,
} from "./projectWriteCoordinator";

export type WorkspaceUpdate = ProjectWorkspace | ((current: ProjectWorkspace) => ProjectWorkspace);
export type WorktableUpdate = WorktableDraft | ((current: WorktableDraft) => WorktableDraft);
export type WorkspaceSaveError = CoordinatorWorkspaceError;
export type WorkspaceSaveResult = CoordinatorWorkspaceResult;

export function workspaceSaveErrorMessage(error: WorkspaceSaveError): string {
  if (error.kind === "conflict") return "项目已在其他标签页更新，请刷新后重试。";
  if (error.kind === "quota-exceeded") return "浏览器存储空间不足，当前状态未覆盖。";
  if (error.kind === "not-found") return "项目已不存在，请返回 Home。";
  if (error.kind === "unsupported-storage-schema") return "项目数据来自不兼容的版本，无法保存。";
  if (error.kind === "migration-failed") return "项目数据升级失败，当前状态未保存。";
  if (error.kind === "workspace-not-ready") return "项目尚未载入，当前状态未保存。";
  if (error.kind === "writes-paused") return "项目保存已暂停，请重试后再继续编辑。";
  return error.retryable ? "存储暂时不可用，请稍后重试。" : "此浏览器无法使用项目存储。";
}

const ProjectWorkspaceContext = createContext<ProjectWriteCoordinator | undefined>(undefined);

export function ProjectWorkspaceProvider({ dependencies, projectId, children, coordinator: provided }: { readonly dependencies: AppDependencies; readonly projectId: ProjectId; readonly children: ReactNode; readonly coordinator?: ProjectWriteCoordinator }) {
  const coordinator = useMemo(() => provided ?? createProjectWriteCoordinator(dependencies, projectId), [dependencies, projectId, provided]);
  useEffect(() => {
    void coordinator.load();
    return () => coordinator.dispose();
  }, [coordinator]);
  return createElement(ProjectWorkspaceContext.Provider, { value: coordinator }, children);
}

function useCoordinator(dependencies: AppDependencies, projectId: ProjectId): ProjectWriteCoordinator {
  const provided = useContext(ProjectWorkspaceContext);
  const local = useMemo(() => provided ?? createProjectWriteCoordinator(dependencies, projectId), [dependencies, projectId, provided]);
  useEffect(() => {
    if (provided) return;
    void local.load();
    return () => local.dispose();
  }, [local, provided]);
  return local;
}

export interface ProjectWorkspaceSession {
  readonly coordinator: ProjectWriteCoordinator;
  readonly workspace?: ProjectWorkspace;
  readonly loading: boolean;
  readonly error?: string;
  readonly saving: boolean;
  readonly save: (update: WorkspaceUpdate) => Promise<WorkspaceSaveResult>;
  readonly updateResumeContext: (update: ResumeContextUpdate, touchLastOpened?: boolean) => Promise<WorkspaceSaveResult>;
  readonly saveWorktable: (update: WorktableUpdate) => Promise<WorkspaceSaveResult>;
  readonly deleteSequences: ProjectWriteCoordinator["deleteSequences"];
  readonly createSequence: ProjectWriteCoordinator["createSequence"];
  readonly createSequenceBundle: ProjectWriteCoordinator["createSequenceBundle"];
  readonly listSequences: ProjectWriteCoordinator["listSequences"];
  readonly loadSequence: ProjectWriteCoordinator["loadSequence"];
  readonly loadVersion: ProjectWriteCoordinator["loadVersion"];
  readonly listVersions: ProjectWriteCoordinator["listVersions"];
  readonly saveSequenceDraft: ProjectWriteCoordinator["saveSequenceDraft"];
  readonly editSequence: ProjectWriteCoordinator["editSequence"];
  readonly flush: ProjectWriteCoordinator["flush"];
}

export function useProjectWorkspaceSession(dependencies: AppDependencies, projectId: ProjectId): ProjectWorkspaceSession {
  const coordinator = useCoordinator(dependencies, projectId);
  const snapshot = useSyncExternalStore(
    (listener) => coordinator.subscribe(listener),
    () => coordinator.getSnapshot(),
    () => coordinator.getSnapshot(),
  );
  return useMemo(() => ({
    coordinator,
    workspace: snapshot.workspace,
    loading: snapshot.loading,
    error: snapshot.error,
    saving: snapshot.saving,
    save: coordinator.saveWorkspace,
    updateResumeContext: coordinator.updateResumeContext,
    saveWorktable: coordinator.saveWorktable,
    deleteSequences: coordinator.deleteSequences,
    createSequence: coordinator.createSequence,
    createSequenceBundle: coordinator.createSequenceBundle,
    listSequences: coordinator.listSequences,
    loadSequence: coordinator.loadSequence,
    loadVersion: coordinator.loadVersion,
    listVersions: coordinator.listVersions,
    saveSequenceDraft: coordinator.saveSequenceDraft,
    editSequence: coordinator.editSequence,
    flush: coordinator.flush,
  }), [coordinator, projectId, snapshot]);
}
