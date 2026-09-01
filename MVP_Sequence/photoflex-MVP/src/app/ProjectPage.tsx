import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import type { ProjectId, ProjectSummary, ProjectWorkspace, SourceRecord, SourceRuntimeState, SourceError } from "../contracts";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { InlineNotice, EmptyPanel, InlineTitle, LoadingPage, ErrorPage, MemoCard, formatUpdated, now, shortId, sourceCounts, sourceErrorMessage, stateHasPhotos, totalIndexed, StatusDot, progressPercent } from "./AppPrimitives";
import { NewProjectDialog } from "./ProjectDialog";
import { deleteProjectWorkspace } from "./ProjectWorkspaceActions";
import { useSourceMonitor, stopSharedScan } from "./ProjectSourceMonitor";
import { useProjectWorkspace, workspaceSaveErrorMessage, type WorkspaceUpdate } from "./useProjectWorkspace";

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
      <p className="rail-label">PROJECTS</p>
      <button className="new-project-link" onClick={() => setShowDialog(true)}>＋ New Project</button>
      <div className="project-rail-list">
        {projects.map((project) => (
          <button
            key={project.id}
            className={`project-rail-item${project.id === currentProjectId ? " is-active" : ""}`}
            onClick={() => navigate({ name: "project", projectId: project.id })}
          >
            <strong>{project.name.toUpperCase()}</strong>
            {project.id === currentProjectId
              ? <span>{currentPhotoCount} photos</span>
              : <ProjectPhotoCount dependencies={dependencies} projectId={project.id} />}
          </button>
        ))}
      </div>
      <div className="rail-updated"><span>UPDATED</span><time>{formatUpdated(current?.updatedAt)}</time></div>
      {showDialog && <NewProjectDialog dependencies={dependencies} onClose={() => setShowDialog(false)} onCreated={(projectId) => navigate({ name: "project", projectId })} />}
    </aside>
  );
}
function ProjectPhotoCount({ dependencies, projectId }: { readonly dependencies: AppDependencies; readonly projectId: ProjectId }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    void dependencies.projectStore.loadWorkspace(projectId).then(async (result) => {
      if (!result.ok) return;
      const states = await Promise.all(result.value.sources.filter((source) => !source.removedAt).map((source) => dependencies.photoSource.getSourceState(source.id)));
      if (active) setCount(states.reduce((total, state) => total + (state.ok ? state.value.indexedCount : 0), 0));
    });
    return () => { active = false; };
  }, [dependencies, projectId]);
  return <span>{count} photos</span>;
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
  const { workspace, save, loading, error } = useProjectWorkspace(dependencies, projectId);
  const [notice, setNotice] = useState<string>();
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
    void persist((current) => ({
      ...current,
      lastOpenedAt: now(),
      resumeContext: { page: "project", filter: "all", sequenceId: current.resumeContext?.sequenceId },
    }));
  }, [projectId, workspace?.projectId]);

  if (loading) return <LoadingPage />;
  if (!workspace) return <ErrorPage message={error ?? "项目无法读取。"} />;

  const activeSources = workspace.sources.filter((source) => !source.removedAt);
  const updateName = async (nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === workspace.name) return;
    await persist((current) => ({ ...current, name: trimmed, updatedAt: now() }));
  };
  const updateMemo = (value: string) => {
    void persist((current) => ({ ...current, memo: value, updatedAt: now() }));
  };
  const addSource = async () => {
    const result = await dependencies.photoSource.chooseFolder(workspace.sources.map((source) => source.id));
    if (!result.ok) {
      if (result.error.kind !== "cancelled") setNotice(sourceErrorMessage(result.error.kind));
      return;
    }
    const source: SourceRecord = { id: result.value.sourceId, displayName: result.value.displayName, createdAt: now() };
    const saved = await persist((current) => {
      const existing = current.sources.find((item) => item.id === source.id);
      const sources = existing
        ? current.sources.map((item) => item.id === source.id ? { ...item, removedAt: undefined } : item)
        : [...current.sources, source];
      return { ...current, sources, updatedAt: now() };
    });
    if (saved) startScan(source.id);
  };
  const removeSource = async (source: SourceRecord) => {
    if (!window.confirm(`Remove source “${source.displayName}” (${shortId(source.id)})? Original files will not be deleted.`)) return;
    stopSharedScan(dependencies.photoSource, source.id);
    const removed = await dependencies.photoSource.removeSource(source.id);
    if (!removed.ok) {
      setNotice(sourceErrorMessage(removed.error.kind));
      return;
    }
    await persist((current) => ({
      ...current,
      sources: current.sources.filter((item) => item.id !== source.id),
      updatedAt: now(),
    }));
  };
  const deleteProject = async () => {
    if (!window.confirm(`Delete project “${workspace.name}”? Original photos will not be deleted.`)) return;
    setDeletingProject(true);
    if (!(await deleteProjectWorkspace(dependencies, workspace))) {
      setNotice("项目删除失败，请重试。");
      setDeletingProject(false);
      return;
    }
    navigate({ name: "home" });
  };

  return (
    <main className="workspace-layout page">
      <ProjectRail dependencies={dependencies} currentProjectId={projectId} currentPhotoCount={totalIndexed(states)} navigate={navigate} />
      <section className="workspace-main">
        <div className="workspace-heading">
          <div><InlineTitle value={workspace.name} onSave={updateName} /><p className="subtitle">管理照片来源，并从 Contact Sheet 进入选片桌面</p></div>
          <div className="workspace-actions">
            <button className="button button-danger" disabled={deletingProject} onClick={() => void deleteProject()}>{deletingProject ? "Deleting…" : "Delete project"}</button>
            <button className="button button-primary" onClick={addSource}>Add photo folder</button>
          </div>
        </div>
        {notice && <InlineNotice message={notice} />}
        <div className="section-heading"><span>PHOTO SOURCES</span><span>{activeSources.length} connected folders</span></div>
        <section className="source-list" aria-label="照片来源">
          {activeSources.map((source) => <SourceCard key={source.id} source={source} state={states[source.id]} onOpen={() => stateHasPhotos(states[source.id]) && navigate({ name: "contact-sheet", projectId, sourceId: source.id })} onRefresh={() => startScan(source.id)} onReconnect={() => void reconnectSource(dependencies, workspace, source, persist, startScan)} onRemove={() => void removeSource(source)} />)}
          {!activeSources.length && <EmptyPanel title="No photo folders yet" detail="Add a local folder to begin indexing." />}
        </section>
        <MemoCard value={workspace.memo} onChange={updateMemo} />
      </section>
    </main>
  );
}

function SourceCard({ source, state, onOpen, onRefresh, onReconnect, onRemove }: { readonly source: SourceRecord; readonly state?: SourceRuntimeState; readonly onOpen: () => void; readonly onRefresh: () => void; readonly onReconnect: () => void; readonly onRemove: () => void }) {
  const status = state?.status ?? "loading";
  const canOpen = stateHasPhotos(state);
  return <article className={`source-card status-${status}`}>
    <div className="source-card-copy"><h2>{source.displayName.toUpperCase()}</h2><p className="source-count">{sourceCounts(state)}</p><p className="source-status"><StatusDot status={status} />{statusLabel(status)}</p>{state?.errorMessage && <p className="source-error">{state.errorMessage}</p>}</div>
    <div className="source-card-actions"><button className="text-button source-open" disabled={!canOpen} onClick={onOpen}>Open</button><details className="source-menu"><summary aria-label={`${source.displayName} 操作`}>…</summary><div>{status === "permission-lost" || status === "offline" ? <button onClick={onReconnect}>Reconnect</button> : <button onClick={onRefresh}>Refresh</button>}<button onClick={onRemove}>Remove Source</button></div></details></div>
    {status === "loading" && <div className="progress-bar"><span style={{ width: `${progressPercent(state)}%` }} /></div>}
  </article>;
}

function statusLabel(status: SourceRuntimeState["status"]) { return status.replace("permission-lost", "permission lost").toUpperCase(); }

async function reconnectSource(dependencies: AppDependencies, workspace: ProjectWorkspace, source: SourceRecord, persist: (update: WorkspaceUpdate) => Promise<boolean>, startScan: (sourceId: import("../contracts").SourceId) => void) {
  const restored = await dependencies.photoSource.restoreFolder(source.id);
  if (restored.ok) { startScan(source.id); return; }
  const result = await dependencies.photoSource.chooseFolder(workspace.sources.map((item) => item.id));
  if (!result.ok || result.value.sourceId !== source.id) return;
  const saved = await persist((current) => ({ ...current, sources: current.sources.map((item) => item.id === source.id ? { ...item, removedAt: undefined } : item), updatedAt: now() }));
  if (saved) startScan(source.id);
}
