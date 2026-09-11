import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectId, ProjectWorkspace, SequenceId, SequenceSummary, WorktableDraft, WorktableViewport } from "../contracts";
import type { ProjectWriteCoordinator } from "./projectWriteCoordinator";
import { workspaceSaveErrorMessage } from "./useProjectWorkspace";

export const DEFAULT_TABLE_VIEWPORT: WorktableViewport = { originX: 48, originY: 38, zoom: 1 };

type TableLifecycleCoordinator = Pick<
  ProjectWriteCoordinator,
  "flush" | "load" | "listSequences" | "updateResumeContext"
>;

export interface TableWorkspaceInitialization {
  readonly summaries: readonly SequenceSummary[];
  readonly activeSequenceId?: SequenceId;
}

export interface UseTableWorkspaceLifecycleInput {
  readonly projectId: ProjectId;
  readonly workspace?: ProjectWorkspace;
  readonly coordinator: TableLifecycleCoordinator;
  readonly resetCommittedDraft: (draft: WorktableDraft) => unknown;
  readonly activeSequenceId?: SequenceId;
  readonly onInitialized: (initialization: TableWorkspaceInitialization) => void;
  readonly onError: (message: string) => void;
}

/**
 * Owns Table route entry and resume persistence ordering. Callers render only
 * after `ready`, then forward viewport changes through the returned callback.
 */
export function useTableWorkspaceLifecycle({
  projectId,
  workspace,
  coordinator,
  resetCommittedDraft,
  activeSequenceId,
  onInitialized,
  onError,
}: UseTableWorkspaceLifecycleInput) {
  const [refreshedProjectId, setRefreshedProjectId] = useState<ProjectId>();
  const [initializedProjectId, setInitializedProjectId] = useState<ProjectId>();
  const [initialViewport, setInitialViewport] = useState(DEFAULT_TABLE_VIEWPORT);
  const viewportRef = useRef(DEFAULT_TABLE_VIEWPORT);
  const viewportSaveTimerRef = useRef<number | undefined>(undefined);
  const reloadRequestedRef = useRef<ProjectId | undefined>(undefined);

  // The project Provider survives route changes. Refresh once on Table entry so
  // a preceding Contact Sheet write cannot leave a stale workspace snapshot.
  useEffect(() => {
    if (reloadRequestedRef.current === projectId) return;
    reloadRequestedRef.current = projectId;
    setRefreshedProjectId(undefined);
    setInitializedProjectId(undefined);
    viewportRef.current = DEFAULT_TABLE_VIEWPORT;
    setInitialViewport(DEFAULT_TABLE_VIEWPORT);
    void coordinator.flush()
      .then((result) => { if (result.ok || result.error.kind === "workspace-not-ready") return coordinator.load(); onError(workspaceSaveErrorMessage(result.error)); })
      .then(() => {
        if (reloadRequestedRef.current === projectId) setRefreshedProjectId(projectId);
      });
  }, [coordinator, projectId]);

  useEffect(() => {
    if (refreshedProjectId !== projectId || !workspace || initializedProjectId === projectId) return;
    resetCommittedDraft(workspace.worktableDraft);
    const restoredViewport = workspace.resumeContext?.page === "table"
      ? workspace.resumeContext.tableViewport ?? DEFAULT_TABLE_VIEWPORT
      : DEFAULT_TABLE_VIEWPORT;
    viewportRef.current = restoredViewport;
    setInitialViewport(restoredViewport);
    setInitializedProjectId(projectId);
    onInitialized({ summaries: [], activeSequenceId: undefined });

    void coordinator.listSequences().then((result) => {
      if (reloadRequestedRef.current !== projectId) return;
      if (!result.ok) {
        onError("Sequences could not be loaded.");
        return;
      }
      const restoredId = workspace.resumeContext?.sequenceId;
      onInitialized({
        summaries: result.value,
        activeSequenceId: restoredId && result.value.some((item) => item.id === restoredId)
          ? restoredId
          : result.value[0]?.id,
      });
    });
    void coordinator.updateResumeContext(
      (current) => ({ page: "table", filter: "all", tableViewport: restoredViewport, sequenceId: current?.sequenceId }),
      true,
    ).then((result) => {
      if (reloadRequestedRef.current !== projectId) return;
      if (!result.ok) onError(workspaceSaveErrorMessage(result.error));
    });
  }, [coordinator, initializedProjectId, onError, onInitialized, projectId, refreshedProjectId, resetCommittedDraft, workspace]);

  const onViewportChange = useCallback((next: WorktableViewport) => {
    viewportRef.current = next;
    if (viewportSaveTimerRef.current !== undefined) window.clearTimeout(viewportSaveTimerRef.current);
    viewportSaveTimerRef.current = window.setTimeout(() => {
      viewportSaveTimerRef.current = undefined;
      void coordinator.updateResumeContext((current) => ({
        page: "table",
        filter: "all",
        tableViewport: next,
        sequenceId: current?.sequenceId,
      })).then((result) => {
        if (!result.ok) onError(workspaceSaveErrorMessage(result.error));
      });
    }, 500);
  }, [coordinator, onError]);

  useEffect(() => {
    if (!activeSequenceId || initializedProjectId !== projectId) return;
    void coordinator.updateResumeContext((current) => ({
      page: "table",
      filter: "all",
      tableViewport: current?.tableViewport ?? viewportRef.current,
      sequenceId: activeSequenceId,
    })).then((result) => {
      if (!result.ok) onError(workspaceSaveErrorMessage(result.error));
    });
  }, [activeSequenceId, coordinator, initializedProjectId, onError, projectId]);

  useEffect(() => () => {
    if (viewportSaveTimerRef.current !== undefined) window.clearTimeout(viewportSaveTimerRef.current);
    if (reloadRequestedRef.current !== projectId) return;
    void coordinator.updateResumeContext((current) => ({
      page: "table",
      filter: "all",
      tableViewport: viewportRef.current,
      sequenceId: current?.sequenceId,
    }));
  }, [coordinator, projectId]);

  const ready = refreshedProjectId === projectId && (!workspace || initializedProjectId === projectId);
  return { ready, initialViewport, onViewportChange };
}
