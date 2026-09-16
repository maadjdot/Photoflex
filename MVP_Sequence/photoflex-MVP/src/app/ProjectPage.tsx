import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import type { ProjectId, ProjectSummary, ProjectWorkspace, SourceRecord, SourceRuntimeState, SourceError } from "../contracts";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { InlineNotice, EmptyPanel, LoadingPage, ErrorPage, formatUpdated, now, shortId, sourceCounts, sourceErrorMessage, stateHasPhotos, totalIndexed, StatusDot, progressPercent } from "./AppPrimitives";
import { NewProjectDialog } from "./ProjectDialog";
import { deleteProjectWorkspace, projectDeletionErrorMessage } from "./ProjectWorkspaceActions";
import { useSourceMonitor, stopSharedScan } from "./ProjectSourceMonitor";
import { useProjectWorkspaceSession, workspaceSaveErrorMessage, type WorkspaceUpdate } from "./useProjectWorkspace";
import { ProjectInfoPanel } from "./ProjectInfoPanel";
import { useLocale } from "./locale";
import { hasNativeDirectoryPicker } from "../platform/browser/webkitDirectoryPicker";

function ProjectRail({
  dependencies,
  currentProjectId,
  currentPhotoCount,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly currentProjectId: ProjectId;
  readonly currentPhotoCount: number;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { locale, t } = useLocale();
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    let active = true;
    void dependencies.projectStore.listProjects().then((result) => {
      if (active && result.ok) setProjects(result.value);
    });
    return () => { active = false; };
  }, [dependencies.projectStore, currentProjectId]);

  const current = projects.find((project) => project.id === currentProjectId);
  return (
    <aside className="context-rail project-rail">
      <p className="rail-label">{t("project.projects")}</p>
      <button className="new-project-link" onClick={() => setShowDialog(true)}>＋ {t("project.newProject")}</button>
      <div className="project-rail-list">
        {projects.map((project) => (
          <button
            key={project.id}
            className={`project-rail-item${project.id === currentProjectId ? " is-active" : ""}`}
            onClick={() => navigate({ name: "table", projectId: project.id })}
          >
            <strong>{project.name.toUpperCase()}</strong>
            <span>{project.id === currentProjectId ? t("common.photoCount", { count: currentPhotoCount }) : t("project.folderCount", { count: project.sourceCount, tableCount: project.tableCount })}</span>
          </button>
        ))}
      </div>
      <div className="rail-updated"><span>{t("status.updated")}</span><time>{formatUpdated(current?.updatedAt, locale)}</time></div>
      {showDialog && <NewProjectDialog dependencies={dependencies} onClose={() => setShowDialog(false)} onCreated={(projectId) => navigate({ name: "table", projectId })} />}
    </aside>
  );
}

export function ProjectPage({
  dependencies,
  projectId,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { locale, t } = useLocale();
  const { workspace, save, updateResumeContext, loading, error } = useProjectWorkspaceSession(dependencies, projectId);
  const [notice, setNotice] = useState<string>();
  const [addingSource, setAddingSource] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const { states, startScan } = useSourceMonitor(
    dependencies.photoSource,
    workspace?.sources.filter((source) => !source.removedAt) ?? [],
  );
  const persist = useCallback(async (update: WorkspaceUpdate) => {
    const result = await save(update);
    if (!result.ok) setNotice(workspaceSaveErrorMessage(result.error));
    return result.ok;
  }, [save]);
  const openedProjectRef = useRef<ProjectId | undefined>(undefined);

  useEffect(() => {
    if (!workspace || openedProjectRef.current === workspace.projectId) return;
    openedProjectRef.current = workspace.projectId;
    void updateResumeContext((current) => ({ page: "project", filter: "all", sequenceId: current?.sequenceId }), true);
  }, [projectId, updateResumeContext, workspace?.projectId]);

  if (loading) return <LoadingPage />;
  if (!workspace) return <ErrorPage message={error ?? (locale === "zh-CN" ? "无法读取项目。" : "Project could not be loaded.")} />;

  const visibleSources = workspace.sources;
  const updateName = async (nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === workspace.name) return;
    await persist((current) => ({ ...current, name: trimmed, updatedAt: now() }));
  };
  const updateMemo = (value: string) => {
    void persist((current) => ({ ...current, memo: value, updatedAt: now() }));
  };
  const addSource = async () => {
    if (addingSource) return;
    setAddingSource(true);
    try {
    const result = await dependencies.photoSource.chooseFolder(workspace.sources.map((source) => source.id));
    if (!result.ok) {
      if (result.error.kind !== "cancelled") setNotice(sourceErrorMessage(result.error.kind, locale));
      return;
    }
    const source: SourceRecord = { id: result.value.sourceId, displayName: result.value.displayName, createdAt: now(), kind: "folder" };
    const saved = await persist((current) => {
      const existing = current.sources.find((item) => item.id === source.id);
      const sources = existing
        ? current.sources.map((item) => item.id === source.id ? { ...item, removedAt: undefined } : item)
        : [...current.sources, source];
      return { ...current, sources, updatedAt: now() };
    });
    if (saved) startScan(source.id);
    } finally { setAddingSource(false); }
  };
  const removeSource = async (source: SourceRecord) => {
    if (!window.confirm(t("project.removeConfirm", { name: source.displayName, id: shortId(source.id) }))) return;
    // Disconnect is a project-level soft state. The source adapter keeps its
    // grant, index, cache and PhotoIds so an existing Table/Sequence can be
    // reconnected without changing references.
    const saved = await persist((current) => ({
      ...current,
      sources: current.sources.map((item) => item.id === source.id ? { ...item, removedAt: now() } : item),
      updatedAt: now(),
    }));
    if (saved) stopSharedScan(dependencies.photoSource, source.id);
  };
  const deleteProject = async () => {
    if (!window.confirm(t("project.deleteConfirm", { name: workspace.name }))) return;
    setDeletingProject(true);
    const deleted = await deleteProjectWorkspace(dependencies, workspace.projectId);
    if (!deleted.ok) {
      setNotice(projectDeletionErrorMessage(deleted.error));
      setDeletingProject(false);
      return;
    }
    navigate({ name: "home" });
  };

  return (
    <main className="workspace-layout page">
      <ProjectRail dependencies={dependencies} currentProjectId={projectId} currentPhotoCount={totalIndexed(states)} navigate={navigate} />
      <ProjectInfoPanel workspace={workspace} photoSource={dependencies.photoSource} deleting={deletingProject} onUpdateName={updateName} onUpdateMemo={updateMemo} onDelete={() => void deleteProject()} onAddSource={() => void addSource()}>
        {addingSource && <div className="source-loading-status" role="status"><span className="loading-mark" aria-hidden="true" />{t("project.connecting")}</div>}
        {notice && <InlineNotice message={notice} />}
        <div className="section-heading"><span>{t("project.photoSources")}</span><span>{t("project.connectedFolders", { count: workspace.sources.filter((source) => !source.removedAt).length })}</span></div>
        {!hasNativeDirectoryPicker() && <p className="source-access-note">{t("source.temporaryFolderAccess")}</p>}
        <section className="source-list" aria-label={t("project.photoSources")}>
          {visibleSources.map((source) => <SourceCard key={source.id} source={source} state={source.removedAt ? { sourceId: source.id, status: "offline", discoveredCount: 0, indexedCount: 0, skippedCount: 0, failedCount: 0 } : states[source.id]} onOpen={() => !source.removedAt && stateHasPhotos(states[source.id]) && navigate({ name: "contact-sheet", projectId, sourceId: source.id })} onRefresh={() => startScan(source.id)} onReconnect={() => void reconnectSource(dependencies, workspace, source, persist, startScan, locale, setNotice)} onRemove={() => void removeSource(source)} />)}
          {!visibleSources.length && <EmptyPanel title={t("project.noFolders")} detail={t("project.noFoldersDetail")} />}
        </section>
      </ProjectInfoPanel>
    </main>
  );
}

function SourceCard({ source, state, onOpen, onRefresh, onReconnect, onRemove }: { readonly source: SourceRecord; readonly state?: SourceRuntimeState; readonly onOpen: () => void; readonly onRefresh: () => void; readonly onReconnect: () => void; readonly onRemove: () => void }) {
  const { locale, t } = useLocale();
  const status = state?.status ?? "loading";
  const canOpen = stateHasPhotos(state);
  return <article className={`source-card status-${status}`}>
    <div className="source-card-copy"><h2>{source.displayName.toUpperCase()}</h2><p className="source-count">{sourceCounts(state, locale)}</p><p className="source-status"><StatusDot status={status} />{statusText(status, locale)}</p>{state?.errorMessage && <p className="source-error">{state.errorMessage}</p>}</div>
    <div className="source-card-actions">{status === "permission-lost" || status === "offline" ? <button className="text-button source-open" onClick={onReconnect}>{t("project.reconnectFolder")}</button> : <button className="text-button source-open" disabled={!canOpen} onClick={onOpen}>{t("common.open")}</button>}<details className="source-menu"><summary aria-label={t("project.actions", { name: source.displayName })}>…</summary><div><button onClick={onRefresh}>{t("project.refresh")}</button><button onClick={onRemove}>{t("project.removeSource")}</button></div></details></div>
    {status === "loading" && <div className="progress-bar"><span style={{ width: `${progressPercent(state)}%` }} /></div>}
  </article>;
}

function statusText(status: SourceRuntimeState["status"], locale: import("./localeDictionary").Locale) {
  if (locale === "zh-CN") return ({ loading: "正在加载", ready: "已就绪", partial: "部分可用", empty: "空文件夹", error: "错误", offline: "未连接", "permission-lost": "授权已失效" } as Record<string, string>)[status] ?? status;
  return status.replace("permission-lost", "permission lost").toUpperCase();
}

async function reconnectSource(dependencies: AppDependencies, workspace: ProjectWorkspace, source: SourceRecord, persist: (update: WorkspaceUpdate) => Promise<boolean>, startScan: (sourceId: import("../contracts").SourceId) => void, locale: import("./localeDictionary").Locale, onError: (message: string) => void) {
  const restored = await dependencies.photoSource.restoreFolder(source.id);
  if (restored.ok) {
    const saved = await persist((current) => ({ ...current, sources: current.sources.map((item) => item.id === source.id ? { ...item, removedAt: undefined } : item), updatedAt: now() }));
    if (saved) startScan(source.id);
    return;
  }
  if (restored.error.kind !== "cancelled") onError(sourceErrorMessage(restored.error.kind, locale));
}
