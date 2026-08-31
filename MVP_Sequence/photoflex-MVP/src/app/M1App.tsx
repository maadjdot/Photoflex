import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  PhotoId,
  PhotoRef,
  ProjectId,
  ProjectSummary,
  ProjectWorkspace,
  SourceGrant,
  SourceId,
  SourceRecord,
  SourceRuntimeState,
  SourceError,
} from "../contracts";
import {
  calculateContactSheetVirtualGrid,
  type ContactSheetVirtualGrid,
} from "../modules/contactSheet/contactSheetVirtualizer";
import { addToPool, removeFromPool } from "../modules/library/pool";
import trashBinIcon from "../assets/icons/trash-bin.png";
import { routeToHash, useAppRoute, type AppRoute } from "./router";
import type { AppDependencies } from "./dependencies";

interface AppProps {
  readonly dependencies: AppDependencies;
}

const now = () => new Date().toISOString();
const PROJECT_DRAG_TYPE = "application/x-photoflex-project";

type ScanListener = (state: SourceRuntimeState) => void;

interface SharedScan {
  readonly controller: AbortController;
  readonly listeners: Set<ScanListener>;
}

// A scan is longer-lived than any single page. Keeping it beside the PhotoSource
// means route changes only replace listeners; they do not abort indexing work.
const sharedScans = new WeakMap<AppDependencies["photoSource"], Map<SourceId, SharedScan>>();

function scansFor(photoSource: AppDependencies["photoSource"]) {
  let scans = sharedScans.get(photoSource);
  if (!scans) {
    scans = new Map();
    sharedScans.set(photoSource, scans);
  }
  return scans;
}

function startSharedScan(photoSource: AppDependencies["photoSource"], sourceId: SourceId) {
  const scans = scansFor(photoSource);
  if (scans.has(sourceId)) return;

  const scan: SharedScan = { controller: new AbortController(), listeners: new Set() };
  scans.set(sourceId, scan);
  void (async () => {
    for await (const result of photoSource.scan(sourceId, scan.controller.signal)) {
      if (!result.ok) {
        const failed = {
          ...initialRuntimeState(sourceId),
          status: "error" as const,
          errorMessage: "扫描失败，请重试。",
        };
        scan.listeners.forEach((listener) => listener(failed));
        break;
      }
      scan.listeners.forEach((listener) => listener(result.value.state));
    }
    scans.delete(sourceId);
  })();
}

function stopSharedScan(photoSource: AppDependencies["photoSource"], sourceId: SourceId) {
  scansFor(photoSource).get(sourceId)?.controller.abort();
}

export function M1App({ dependencies }: AppProps) {
  const [route, navigate] = useAppRoute();
  const currentProjectId = route.name === "home" ? undefined : route.projectId;

  return (
    <div className="app-shell">
      <AppHeader route={route} projectId={currentProjectId} navigate={navigate} />
      {route.name === "home" && <HomePage dependencies={dependencies} navigate={navigate} />}
      {route.name === "project" && (
        <ProjectPage dependencies={dependencies} projectId={route.projectId} navigate={navigate} />
      )}
      {route.name === "contact-sheet" && (
        <ContactSheetPage
          dependencies={dependencies}
          projectId={route.projectId}
          sourceId={route.sourceId}
          navigate={navigate}
        />
      )}
    </div>
  );
}

function AppHeader({
  route,
  projectId,
  navigate,
}: {
  readonly route: AppRoute;
  readonly projectId?: ProjectId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const goHome = () => navigate({ name: "home" });
  return (
    <header className="topbar">
      <button className="brand" onClick={goHome} aria-label="返回 Home">
        Photoflex
      </button>
      <nav className="topnav" aria-label="主导航">
        <NavButton active={route.name === "home"} onClick={goHome}>
          Home
        </NavButton>
        <NavButton
          active={route.name === "project"}
          disabled={!projectId}
          onClick={() => projectId && navigate({ name: "project", projectId })}
        >
          Project
        </NavButton>
        <NavButton
          active={route.name === "contact-sheet"}
          disabled={!projectId || route.name !== "contact-sheet"}
          title={route.name === "contact-sheet" ? undefined : "请从 Source 卡片打开 Contact Sheet"}
          onClick={() => route.name === "contact-sheet" && navigate(route)}
        >
          Contact Sheet
        </NavButton>
        <NavButton disabled title="Sequence 编辑将在 M2 开放" onClick={() => undefined}>
          Sequence
        </NavButton>
        <NavButton disabled title="Compare 编辑将在后续阶段开放" onClick={() => undefined}>
          Compare
        </NavButton>
      </nav>
      <button className="login-button" aria-label="登录（M1 占位）">Login</button>
    </header>
  );
}

function NavButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      className={`nav-button${active ? " is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function HomePage({
  dependencies,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly navigate: (route: AppRoute) => void;
}) {
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [draggingProject, setDraggingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<ProjectId>();

  useEffect(() => {
    let active = true;
    void dependencies.projectStore.listProjects().then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) setProjects(result.value);
      else setError("项目列表暂时无法读取，请重试。");
    });
    return () => {
      active = false;
    };
  }, [dependencies.projectStore]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => project.name.toLowerCase().includes(query));
  }, [projects, search]);

  const deleteProject = async (project: ProjectSummary) => {
    if (!window.confirm(`Delete project “${project.name}”? Original photos will not be deleted.`)) return;
    setDeletingProjectId(project.id);
    const loaded = await dependencies.projectStore.loadWorkspace(project.id);
    if (!loaded.ok || !(await deleteProjectWorkspace(dependencies, loaded.value))) {
      setError("项目删除失败，请重试。");
      setDeletingProjectId(undefined);
      return;
    }
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setDeletingProjectId(undefined);
  };

  return (
    <main className="page home-page">
      <section className="page-intro home-intro">
        <h1>Your Projects</h1>
        <div className="intro-actions">
          <label className="search-field">
            <span className="sr-only">搜索项目</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setSearch("")}
              placeholder="Search projects / 搜索"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="清除搜索">
                ×
              </button>
            )}
          </label>
          <button className="button button-primary" onClick={() => setShowDialog(true)}>
            New project
          </button>
        </div>
      </section>

      {error && <InlineError message={error} onRetry={() => window.location.reload()} />}
      {loading ? (
        <div className="project-grid" aria-label="项目加载中">
          {[1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}
        </div>
      ) : filtered.length ? (
        <section className="project-grid" aria-label="项目列表">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              dependencies={dependencies}
              onOpen={() => navigate({ name: "project", projectId: project.id })}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(PROJECT_DRAG_TYPE, project.id);
                setDraggingProject(true);
              }}
              onDragEnd={() => setDraggingProject(false)}
            />
          ))}
        </section>
      ) : search ? (
        <EmptyPanel title="No matching projects" detail="清除搜索后查看全部项目。">
          <button className="button button-secondary" onClick={() => setSearch("")}>Clear search</button>
        </EmptyPanel>
      ) : (
        <EmptyPanel eyebrow="NO PROJECTS YET" title="Begin with a body of work.">
          <button className="button button-primary" onClick={() => setShowDialog(true)}>New project</button>
        </EmptyPanel>
      )}

      {projects.length > 0 && (
        <div
          className={`project-trash${draggingProject ? " is-dragging" : ""}`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDraggingProject(false);
            const project = projects.find((item) => item.id === event.dataTransfer.getData(PROJECT_DRAG_TYPE));
            if (project && project.id !== deletingProjectId) void deleteProject(project);
          }}
          aria-label="拖动项目到这里删除"
        >
          <img src={trashBinIcon} alt="" aria-hidden="true" />
          <small>Drag project here to delete</small>
        </div>
      )}

      {showDialog && (
        <NewProjectDialog
          dependencies={dependencies}
          onClose={() => setShowDialog(false)}
          onCreated={(projectId) => navigate({ name: "project", projectId })}
        />
      )}
    </main>
  );
}

function ProjectCard({
  project,
  dependencies,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  readonly project: ProjectSummary;
  readonly dependencies: AppDependencies;
  readonly onOpen: () => void;
  readonly onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => void;
  readonly onDragEnd: () => void;
}) {
  return (
    <button className="project-card" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}>
      <div className="project-cover">
        <ProjectCover project={project} dependencies={dependencies} />
      </div>
      <div className="project-card-copy">
        <h2>{project.name.toUpperCase()}</h2>
        <p>可恢复到上次工作位置</p>
      </div>
    </button>
  );
}

async function deleteProjectWorkspace(dependencies: AppDependencies, workspace: ProjectWorkspace) {
  const deleted = await dependencies.projectStore.deleteProject(workspace.projectId);
  if (!deleted.ok) return false;

  // Project records and generated photo data live behind separate contracts.
  // Delete the project first, then remove only its derived indexes; source files stay untouched.
  await Promise.all(workspace.sources.map(async (source) => {
    stopSharedScan(dependencies.photoSource, source.id);
    await dependencies.photoSource.removeSource(source.id);
  }));
  return true;
}

function ProjectCover({ project, dependencies }: { readonly project: ProjectSummary; readonly dependencies: AppDependencies }) {
  const [photoId, setPhotoId] = useState(project.coverPhotoId);

  useEffect(() => {
    if (project.coverPhotoId) {
      setPhotoId(project.coverPhotoId);
      return;
    }
    let active = true;

    // M1 has no cover picker: the first indexed photo is the project cover.
    void dependencies.projectStore.loadWorkspace(project.id).then(async (workspace) => {
      if (!workspace.ok) return;
      for (const source of workspace.value.sources) {
        if (source.removedAt) continue;
        const page = await dependencies.photoSource.listPhotos(source.id, "0", 1);
        const first = page.ok ? page.value.items[0] : undefined;
        if (first) {
          if (active) setPhotoId(first.id);
          return;
        }
      }
    });
    return () => { active = false; };
  }, [dependencies, project.coverPhotoId, project.id]);

  if (photoId) return <PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt={`${project.name} cover`} />;
  return <div className="cover-placeholder" aria-hidden="true"><span /><span /></div>;
}

function NewProjectDialog({
  dependencies,
  onClose,
  onCreated,
}: {
  readonly dependencies: AppDependencies;
  readonly onClose: () => void;
  readonly onCreated: (projectId: ProjectId) => void;
}) {
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [expected, setExpected] = useState("");
  const [grant, setGrant] = useState<SourceGrant>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogKeyboard(dialogRef, onClose);

  const chooseFolder = async () => {
    setError(undefined);
    const result = await dependencies.photoSource.chooseFolder([]);
    if (result.ok) setGrant(result.value);
    else if (result.error.kind !== "cancelled") setError(sourceErrorMessage(result.error.kind));
  };

  const create = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a project name");
      return;
    }
    if (!grant) {
      setError("Choose a photo folder");
      return;
    }
    const expectedCount = expected.trim() ? Number(expected) : null;
    if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount <= 0)) {
      setError("Expected photo count must be a positive integer");
      return;
    }
    setBusy(true);
    const createdAt = now();
    const projectId = crypto.randomUUID() as ProjectId;
    const source: SourceRecord = {
      id: grant.sourceId,
      displayName: grant.displayName,
      createdAt,
    };
    const result = await dependencies.projectStore.createProject({
      id: projectId,
      name: trimmedName,
      memo,
      expectedPhotoCount: expectedCount,
      createdAt,
      initialSource: source,
    });
    if (result.ok) onCreated(projectId);
    else {
      setBusy(false);
      setError(createErrorMessage(result.error.kind));
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        <header className="modal-header">
          <h2 id="new-project-title">New Project</h2>
          <p>创建新的摄影项目</p>
        </header>
        <div className="modal-divider" />
        <div className="modal-fields">
          <label className="field-label"><span>Project name <small>项目名称</small></span><input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Untitled project" /></label>
          <div className="field-label"><span>Photo folder <small>项目照片资料夹</small></span>
            <span className="folder-row"><span className="folder-value">{grant ? grant.displayName : "No folder selected"}</span><button className="folder-picker" type="button" onClick={chooseFolder}>Browse folder</button></span>
          </div>
          <label className="field-label"><span>Project memo <small>项目 Memo</small></span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="可记录拍摄主题、地点或筛选目标……" rows={3} /></label>
          <label className="field-label expected-field"><span>Expected photo count <small>预期照片张数</small></span><input inputMode="numeric" value={expected} onChange={(event) => setExpected(event.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 60" /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-footer">
          <p className="modal-safe">Original files will never be moved or modified. <span>原片不会被移动或修改。</span></p>
          <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || !name.trim() || !grant} onClick={create}>{busy ? "Creating…" : "Create project"}</button></div>
        </footer>
      </section>
    </div>
  );
}

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

function ProjectPage({
  dependencies,
  projectId,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { workspace, setWorkspace, loading, error } = useWorkspace(dependencies, projectId);
  const [notice, setNotice] = useState<string>();
  const [deletingProject, setDeletingProject] = useState(false);
  const [poolPreviewId, setPoolPreviewId] = useState<PhotoId>();
  const { states, startScan } = useSourceMonitor(
    dependencies.photoSource,
    workspace?.sources.filter((source) => !source.removedAt) ?? [],
  );
  const persist = useWorkspaceSaver(dependencies, workspace, setWorkspace, setNotice);
  const openedProjectRef = useRef<ProjectId | undefined>(undefined);

  useEffect(() => {
    if (!workspace || openedProjectRef.current === workspace.projectId) return;
    openedProjectRef.current = workspace.projectId;
    void persist({
      ...workspace,
      lastOpenedAt: now(),
      resumeContext: { page: "project", filter: "all" },
    });
  }, [projectId, workspace?.projectId]);

  if (loading) return <LoadingPage />;
  if (!workspace) return <ErrorPage message={error ?? "项目无法读取。"} />;

  const activeSources = workspace.sources.filter((source) => !source.removedAt);
  const updateName = async (nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === workspace.name) return;
    await persist({ ...workspace, name: trimmed, updatedAt: now() });
  };
  const updateMemo = (value: string) => {
    void persist({ ...workspace, memo: value, updatedAt: now() });
  };
  const addSource = async () => {
    const result = await dependencies.photoSource.chooseFolder(workspace.sources.map((source) => source.id));
    if (!result.ok) {
      if (result.error.kind !== "cancelled") setNotice(sourceErrorMessage(result.error.kind));
      return;
    }
    const source: SourceRecord = { id: result.value.sourceId, displayName: result.value.displayName, createdAt: now() };
    const existing = workspace.sources.find((item) => item.id === source.id);
    const sources = existing
      ? workspace.sources.map((item) => item.id === source.id ? { ...item, removedAt: undefined } : item)
      : [...workspace.sources, source];
    const saved = await persist({ ...workspace, sources, updatedAt: now() });
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
    const removedPhotoIds = new Set(removed.value.photoIds);
    await persist({
      ...workspace,
      sources: workspace.sources.filter((item) => item.id !== source.id),
      poolPhotoIds: workspace.poolPhotoIds.filter((photoId) => !removedPhotoIds.has(photoId)),
      coverPhotoId: workspace.coverPhotoId && removedPhotoIds.has(workspace.coverPhotoId) ? undefined : workspace.coverPhotoId,
      updatedAt: now(),
    });
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
          <div><InlineTitle value={workspace.name} onSave={updateName} /><p className="subtitle">管理照片来源与项目照片池</p></div>
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
      <PoolPanel photoSource={dependencies.photoSource} poolIds={workspace.poolPhotoIds} onOpen={setPoolPreviewId} onRemove={async (photoId) => { await persist({ ...workspace, poolPhotoIds: removeFromPool(workspace.poolPhotoIds, [photoId]), updatedAt: now() }); }} />
      {poolPreviewId && <PreviewOverlay photoIds={workspace.poolPhotoIds} index={Math.max(0, workspace.poolPhotoIds.indexOf(poolPreviewId))} workspace={workspace} photoSource={dependencies.photoSource} onClose={() => setPoolPreviewId(undefined)} onMove={(index) => setPoolPreviewId(workspace.poolPhotoIds[index])} onTogglePool={async (photoId) => { const saved = await persist({ ...workspace, poolPhotoIds: removeFromPool(workspace.poolPhotoIds, [photoId]), updatedAt: now() }); if (saved) setPoolPreviewId(undefined); }} />}
    </main>
  );
}

function ContactSheetPage({
  dependencies,
  projectId,
  sourceId,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly sourceId: SourceId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { workspace, setWorkspace, loading, error } = useWorkspace(dependencies, projectId);
  const source = workspace?.sources.find((item) => item.id === sourceId && !item.removedAt);
  const { states, startScan } = useSourceMonitor(
    dependencies.photoSource,
    workspace?.sources.filter((item) => !item.removedAt) ?? [],
  );
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [cursor, setCursor] = useState<string | null>("0");
  const [loadingPage, setLoadingPage] = useState(false);
  const [selected, setSelected] = useState<Set<PhotoId>>(new Set());
  const [missingPhotoIds, setMissingPhotoIds] = useState<Set<PhotoId>>(new Set());
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [previewIndex, setPreviewIndex] = useState<number>();
  const [poolPreviewId, setPoolPreviewId] = useState<PhotoId>();
  const [notice, setNotice] = useState<string>();
  const [anchorPhotoId, setAnchorPhotoId] = useState<PhotoId>();
  const [sourceCollapsed, setSourceCollapsed] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [gridZoom, setGridZoom] = useState(75);
  const lastSelectedIndexRef = useRef<number | undefined>(undefined);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const resumeSavedKeyRef = useRef<string | undefined>(undefined);
  const exhaustedAtIndexedCountRef = useRef(-1);
  const handlePhotoSourceError = useCallback((photoId: PhotoId, photoError: SourceError) => {
    if (photoError.kind === "photo-not-found") {
      setMissingPhotoIds((current) => current.has(photoId) ? current : new Set([...current, photoId]));
      return;
    }
    if (photoError.kind === "permission-lost") {
      setNotice("文件夹授权已失效，请重新连接。");
      return;
    }
    if (photoError.kind === "preview-unavailable") setNotice("照片预览生成失败。");
  }, []);

  useEffect(() => {
    const resumeKey = `${projectId}/${sourceId}`;
    if (!workspace || !source || resumeSavedKeyRef.current === resumeKey) return;
    resumeSavedKeyRef.current = resumeKey;
    const next = {
      ...workspace,
      lastOpenedAt: now(),
      resumeContext: { page: "contact-sheet" as const, sourceId, filter: "all" as const },
    };
    void dependencies.projectStore.saveWorkspace(next, workspace.revision).then((result) => {
      if (!result.ok) return;
      const saved = { ...next, revision: result.value.revision };
      workspaceRef.current = saved;
      setWorkspace(saved);
    });
  }, [projectId, sourceId, workspace?.projectId, source?.id]);

  useEffect(() => {
    if (source && stateNeedsScan(states[source.id])) startScan(source.id);
  }, [source?.id]);

  useEffect(() => {
    let active = true;
    exhaustedAtIndexedCountRef.current = -1;
    setPhotos([]); setCursor("0"); setSelected(new Set()); setMissingPhotoIds(new Set()); setFilter("all");
    void (async () => {
      const page = await dependencies.photoSource.listPhotos(sourceId, "0", 100);
      if (!active) return;
      if (page.ok) {
        setPhotos([...page.value.items]);
        setMissingPhotoIds(new Set(page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)));
        setCursor(page.value.nextCursor);
      }
      else setNotice("照片索引暂时无法读取，请重试。");
    })();
    return () => { active = false; };
  }, [dependencies.photoSource, sourceId]);

  const loadMore = async () => {
    if (!cursor || loadingPage) return;
    setLoadingPage(true);
    const page = await dependencies.photoSource.listPhotos(sourceId, cursor, 100);
    if (page.ok) {
      setPhotos((current) => [...current, ...page.value.items]);
      setMissingPhotoIds((current) => new Set([...current, ...page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)]));
      setCursor(page.value.nextCursor);
    }
    setLoadingPage(false);
  };

  const indexedCount = states[sourceId]?.indexedCount ?? 0;
  useEffect(() => {
    if (indexedCount <= photos.length || loadingPage || exhaustedAtIndexedCountRef.current === indexedCount) return;
    // A null cursor means the previous read reached the then-current tail. If a
    // running scan adds rows, continue once after the last stable path key.
    const nextCursor = cursor ?? photos.at(-1)?.relativePath ?? "0";
    setLoadingPage(true);
    void dependencies.photoSource.listPhotos(sourceId, nextCursor, 100).then((page) => {
      if (page.ok) {
        if (!page.value.items.length && page.value.nextCursor === null) {
          exhaustedAtIndexedCountRef.current = indexedCount;
        }
        setPhotos((current) => [...current, ...page.value.items]);
        setMissingPhotoIds((current) => new Set([...current, ...page.value.issues.filter((issue) => issue.kind === "missing-file").map((issue) => issue.photoId)]));
        setCursor(page.value.nextCursor);
      } else {
        exhaustedAtIndexedCountRef.current = indexedCount;
        setNotice("照片索引暂时无法读取，请重试。");
      }
      setLoadingPage(false);
    });
  }, [cursor, dependencies.photoSource, indexedCount, loadingPage, photos.length, sourceId]);

  useEffect(() => {
    if (!anchorPhotoId) return;
    const timer = window.setTimeout(() => {
      const current = workspaceRef.current;
      if (!current) return;
      const next = {
        ...current,
        resumeContext: { page: "contact-sheet" as const, sourceId, filter: "all" as const, anchorPhotoId },
      };
      void dependencies.projectStore.saveWorkspace(next, current.revision).then((result) => {
        if (!result.ok) return;
        const saved = { ...next, revision: result.value.revision };
        workspaceRef.current = saved;
        setWorkspace(saved);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [anchorPhotoId, dependencies.projectStore, sourceId]);

  if (loading) return <LoadingPage />;
  if (!workspace || !source) return <ErrorPage message={error ?? "Source 无法读取。"} />;

  const visiblePhotos = filter === "selected" ? photos.filter((photo) => selected.has(photo.id)) : photos;
  const visibleSources = workspace.sources.filter((item) => {
    if (item.removedAt) return false;
    return item.displayName.toLowerCase().includes(sourceSearch.trim().toLowerCase());
  });
  const toggleSelection = (photoId: PhotoId, index: number, event?: ReactMouseEvent<HTMLElement>) => {
    setSelected((current) => {
      const next = new Set(current);
      if (event?.shiftKey && lastSelectedIndexRef.current !== undefined) {
        const [start, end] = [lastSelectedIndexRef.current, index].sort((left, right) => left - right);
        visiblePhotos.slice(start, end + 1).forEach((photo) => next.add(photo.id));
      } else if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      lastSelectedIndexRef.current = index;
      return next;
    });
  };
  const persistPool = async (ids: readonly PhotoId[]) => {
    const current = workspaceRef.current;
    if (!current) return false;
    const change = addToPool(current.poolPhotoIds, ids);
    const result = await dependencies.projectStore.saveWorkspace(
      { ...current, poolPhotoIds: change.ids, updatedAt: now() },
      current.revision,
    );
    if (result.ok) {
      const next = {
        ...current,
        poolPhotoIds: change.ids,
        updatedAt: now(),
        revision: result.value.revision,
      };
      workspaceRef.current = next;
      setWorkspace(next);
      setSelected(new Set());
      setNotice(`${change.added} photos added to Project Pool${change.existing ? ` · ${change.existing} already there` : ""}`);
      return true;
    }
    setNotice("加入 Pool 失败，当前选择仍然保留。");
    return false;
  };
  const togglePool = async (photoId: PhotoId) => {
    const current = workspaceRef.current;
    if (!current) return;
    const inPool = current.poolPhotoIds.includes(photoId);
    const ids = inPool ? removeFromPool(current.poolPhotoIds, [photoId]) : addToPool(current.poolPhotoIds, [photoId]).ids;
    const result = await dependencies.projectStore.saveWorkspace({ ...current, poolPhotoIds: ids, updatedAt: now() }, current.revision);
    if (result.ok) { const next = { ...current, poolPhotoIds: ids, updatedAt: now(), revision: result.value.revision }; workspaceRef.current = next; setWorkspace(next); }
    else setNotice("Pool 状态保存失败。");
  };

  return (
    <main className={`workspace-layout contact-layout page${sourceCollapsed ? " is-source-collapsed" : ""}`}>
      <aside className="context-rail source-rail">
        <button className="rail-collapse" onClick={() => setSourceCollapsed((value) => !value)} aria-label={sourceCollapsed ? "展开 Source 栏" : "收起 Source 栏"}>{sourceCollapsed ? "›" : "‹"}</button>
        {!sourceCollapsed && <>
          <label className="source-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search sources</span>
            <input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search Project" />
          </label>
          <div className="source-nav-list">{visibleSources.map((item) => <button className={`source-nav-item${item.id === sourceId ? " is-active" : ""}`} key={item.id} onClick={() => navigate({ name: "contact-sheet", projectId, sourceId: item.id })}><strong>{item.displayName.toUpperCase()}</strong><span>{item.id === sourceId ? Math.max(states[item.id]?.indexedCount ?? 0, photos.length) : (states[item.id]?.indexedCount ?? 0)} photos</span></button>)}</div>
          <div className="rail-updated"><span>UPDATED</span><time>{formatUpdated(workspace.updatedAt)}</time></div>
        </>}
      </aside>
      <section className="workspace-main contact-main" onDragOver={(event) => event.dataTransfer.types.includes("application/x-photoflex-pool-photo") && event.preventDefault()} onDrop={(event) => { const photoId = event.dataTransfer.getData("application/x-photoflex-pool-photo") as PhotoId; if (photoId) void togglePool(photoId); }}>
        <div className="workspace-heading contact-heading">
          <h1>{source.displayName}</h1>
          <div className="sheet-zoom" aria-label="Contact Sheet 缩放">
            <button onClick={() => setGridZoom((value) => Math.max(50, value - 25))} disabled={gridZoom === 50} aria-label="缩小照片">−</button>
            <span>{gridZoom}%</span>
            <button onClick={() => setGridZoom((value) => Math.min(125, value + 25))} disabled={gridZoom === 125} aria-label="放大照片">＋</button>
          </div>
        </div>
        <div className="sheet-toolbar"><div className="filter-tabs"><button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All {Math.max(states[sourceId]?.indexedCount ?? 0, photos.length)}</button><button className={filter === "selected" ? "is-active" : ""} onClick={() => setFilter("selected")}>Selected {selected.size}</button></div><div className="toolbar-actions"><button className="button button-secondary" onClick={() => setSelected(new Set(visiblePhotos.map((photo) => photo.id)))}>Select all</button><button className="button button-secondary" onClick={() => setSelected((current) => new Set(visiblePhotos.filter((photo) => !current.has(photo.id)).map((photo) => photo.id)))}>Invert</button><button className="button button-primary" disabled={!selected.size} onClick={() => void persistPool([...selected])}>Add to Pool</button></div></div>
        {notice && <InlineNotice message={notice} />}
        {visiblePhotos.length ? <VirtualPhotoGrid photos={visiblePhotos} selected={selected} poolIds={workspace.poolPhotoIds} missingIds={missingPhotoIds} zoom={gridZoom} initialAnchorPhotoId={workspace.resumeContext?.sourceId === sourceId ? workspace.resumeContext.anchorPhotoId : undefined} onAnchorChange={setAnchorPhotoId} onToggle={toggleSelection} onOpen={(index) => setPreviewIndex(index)} onNearEnd={() => void loadMore()} onPhotoSourceError={handlePhotoSourceError} photoSource={dependencies.photoSource} /> : <EmptyPanel title={filter === "selected" ? "No selected photos" : "No supported JPEG files"} detail={filter === "selected" ? "Select photos in All to continue." : "This folder has no readable .jpg or .jpeg files."} />}
        {loadingPage && <p className="loading-line">Loading more photos…</p>}
      </section>
      <PoolPanel photoSource={dependencies.photoSource} poolIds={workspace.poolPhotoIds} onOpen={setPoolPreviewId} onAdd={async (photoId) => { await persistPool([photoId]); }} onRemove={async (photoId) => { const current = workspaceRef.current; if (!current) return; const ids = removeFromPool(current.poolPhotoIds, [photoId]); const result = await dependencies.projectStore.saveWorkspace({ ...current, poolPhotoIds: ids, updatedAt: now() }, current.revision); if (result.ok) { const next = { ...current, poolPhotoIds: ids, updatedAt: now(), revision: result.value.revision }; workspaceRef.current = next; setWorkspace(next); } }} onPhotoSourceError={handlePhotoSourceError} />
      {previewIndex !== undefined && <PreviewOverlay photoIds={visiblePhotos.map((photo) => photo.id)} index={previewIndex} workspace={workspace} photoSource={dependencies.photoSource} onClose={() => setPreviewIndex(undefined)} onMove={setPreviewIndex} onTogglePool={togglePool} onPhotoSourceError={handlePhotoSourceError} />}
      {poolPreviewId && <PreviewOverlay photoIds={workspace.poolPhotoIds} index={Math.max(0, workspace.poolPhotoIds.indexOf(poolPreviewId))} workspace={workspace} photoSource={dependencies.photoSource} onClose={() => setPoolPreviewId(undefined)} onMove={(index) => setPoolPreviewId(workspace.poolPhotoIds[index])} onTogglePool={async (photoId) => { await togglePool(photoId); setPoolPreviewId(undefined); }} onPhotoSourceError={handlePhotoSourceError} />}
    </main>
  );
}

function SourceCard({ source, state, onOpen, onRefresh, onReconnect, onRemove }: { readonly source: SourceRecord; readonly state?: SourceRuntimeState; readonly onOpen: () => void; readonly onRefresh: () => void; readonly onReconnect: () => void; readonly onRemove: () => void; }) {
  const status = state?.status ?? "loading";
  const canOpen = stateHasPhotos(state);
  return (
    <article className={`source-card status-${status}`}>
      <div className="source-card-copy">
        <h2>{source.displayName.toUpperCase()}</h2>
        <p className="source-count">{sourceCounts(state)}</p>
        <p className="source-status"><StatusDot status={status} />{statusLabel(status)}</p>
        {state?.errorMessage && <p className="source-error">{state.errorMessage}</p>}
      </div>
      <div className="source-card-actions">
        <button className="text-button source-open" disabled={!canOpen} onClick={onOpen}>Open</button>
        <details className="source-menu">
          <summary aria-label={`${source.displayName} 操作`}>…</summary>
          <div>
            {status === "permission-lost" || status === "offline" ? <button onClick={onReconnect}>Reconnect</button> : <button onClick={onRefresh}>Refresh</button>}
            <button onClick={onRemove}>Remove Source</button>
          </div>
        </details>
      </div>
      {status === "loading" && <div className="progress-bar"><span style={{ width: `${progressPercent(state)}%` }} /></div>}
    </article>
  );
}

function PoolPanel({ photoSource, poolIds, onRemove, onOpen, onAdd, onPhotoSourceError }: { readonly photoSource: AppDependencies["photoSource"]; readonly poolIds: readonly PhotoId[]; readonly onRemove: (photoId: PhotoId) => Promise<void>; readonly onOpen?: (photoId: PhotoId) => void; readonly onAdd?: (photoId: PhotoId) => Promise<void>; readonly onPhotoSourceError?: (photoId: PhotoId, error: SourceError) => void; }) {
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<Set<PhotoId>>(new Set());
  const toggle = (photoId: PhotoId) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(photoId)) next.delete(photoId); else next.add(photoId);
    return next;
  });
  const dropPhoto = (event: React.DragEvent<HTMLElement>) => {
    const photoId = event.dataTransfer.getData("application/x-photoflex-photo") as PhotoId;
    if (!photoId || !onAdd) return;
    event.preventDefault();
    void onAdd(photoId);
  };
  return (
    <aside className={`pool-panel${collapsed ? " is-collapsed" : ""}`} onDragOver={(event) => onAdd && event.preventDefault()} onDrop={dropPhoto}>
      <button className="pool-heading" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
        <span><span className="eyebrow">PROJECT POOL</span><strong>{poolIds.length} photos</strong></span><span>{collapsed ? "‹" : "›"}</span>
      </button>
      {!collapsed && <div className="pool-content">
        <div className="pool-list">
          {poolIds.length ? poolIds.map((photoId) => <PoolItem key={photoId} photoSource={photoSource} photoId={photoId} selected={selected.has(photoId)} onToggle={() => toggle(photoId)} onOpen={() => onOpen?.(photoId)} onPhotoSourceError={onPhotoSourceError} />) : null}
        </div>
        <div className="pool-footer">
          <button className="button button-primary pool-sequence-button" disabled title="Sequence 编辑将在 M2 开放">Add selected to sequence</button>
        </div>
      </div>}
    </aside>
  );
}

function PoolItem({ photoSource, photoId, selected, onToggle, onOpen, onPhotoSourceError }: { readonly photoSource: AppDependencies["photoSource"]; readonly photoId: PhotoId; readonly selected: boolean; readonly onToggle: () => void; readonly onOpen: () => void; readonly onPhotoSourceError?: (photoId: PhotoId, error: SourceError) => void; }) {
  const [photo, setPhoto] = useState<PhotoRef>();
  useEffect(() => { void photoSource.getPhoto(photoId).then((result) => result.ok && setPhoto(result.value)); }, [photoId, photoSource]);
  const label = photo?.relativePath ?? photoId;

  return (
    <button
      className={`pool-item${selected ? " is-selected" : ""}`}
      onClick={onToggle}
      onDoubleClick={onOpen}
      draggable
      onDragStart={(event) => event.dataTransfer.setData("application/x-photoflex-pool-photo", photoId)}
      aria-label={`${label}${selected ? "，已选择" : ""}`}
    >
      <span className="pool-thumb">
        <PhotoThumb photoSource={photoSource} photoId={photoId} alt={label} onError={onPhotoSourceError} />
        {selected && <span className="check-mark">✓</span>}
      </span>
      <span>{photo?.relativePath.split("/").at(-1) ?? shortId(photoId)}</span>
    </button>
  );
}

export function VirtualPhotoGrid({ photos, selected, poolIds, missingIds, zoom = 75, initialAnchorPhotoId, onAnchorChange, onToggle, onOpen, onNearEnd, onPhotoSourceError, photoSource }: { readonly photos: readonly PhotoRef[]; readonly selected: ReadonlySet<PhotoId>; readonly poolIds: readonly PhotoId[]; readonly missingIds: ReadonlySet<PhotoId>; readonly zoom?: number; readonly initialAnchorPhotoId?: PhotoId; readonly onAnchorChange: (photoId: PhotoId | undefined) => void; readonly onToggle: (photoId: PhotoId, index: number, event?: ReactMouseEvent<HTMLElement>) => void; readonly onOpen: (index: number) => void; readonly onNearEnd: () => void; readonly onPhotoSourceError: (photoId: PhotoId, error: SourceError) => void; readonly photoSource: AppDependencies["photoSource"]; }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const restoredAnchorRef = useRef<PhotoId | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const latestScrollTopRef = useRef(0);
  const photosRef = useRef(photos);
  const targetTileWidthRef = useRef(205 * zoom / 75);
  const gridRef = useRef<ContactSheetVirtualGrid>(calculateContactSheetVirtualGrid({
    photoCount: photos.length,
    viewportWidth: 860,
    viewportHeight: 620,
    scrollTop: 0,
  }));
  const [grid, setGrid] = useState(gridRef.current);
  const poolIdSet = useMemo(() => new Set(poolIds), [poolIds]);
  const onAnchorChangeRef = useRef(onAnchorChange);
  const onNearEndRef = useRef(onNearEnd);
  photosRef.current = photos;
  targetTileWidthRef.current = 205 * zoom / 75;
  onAnchorChangeRef.current = onAnchorChange;
  onNearEndRef.current = onNearEnd;

  const refreshGrid = (notifyScroll: boolean) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const previous = gridRef.current;
    const next = calculateContactSheetVirtualGrid({
      photoCount: photosRef.current.length,
      viewportWidth: viewport.clientWidth || 860,
      viewportHeight: viewport.clientHeight || 620,
      scrollTop: latestScrollTopRef.current,
      targetTileWidth: targetTileWidthRef.current,
    });
    if (!sameVirtualGrid(previous, next)) {
      gridRef.current = next;
      setGrid(next);
    }
    if (notifyScroll && next.firstVisibleIndex !== previous.firstVisibleIndex) {
      onAnchorChangeRef.current(photosRef.current[next.firstVisibleIndex]?.id);
    }
    if (notifyScroll && viewport.scrollTop + viewport.clientHeight > viewport.scrollHeight - next.rowHeight * 2) {
      onNearEndRef.current();
    }
  };

  const scheduleGridRefresh = () => {
    if (frameRef.current !== undefined) return;
    // Scroll events may arrive faster than the browser can paint. One pending
    // frame always reads the newest scrollTop, so intermediate positions cost no render.
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = undefined;
      refreshGrid(true);
    });
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    refreshGrid(false);
    const observer = new ResizeObserver(scheduleGridRefresh);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    };
  }, []);
  useEffect(() => refreshGrid(false), [photos.length, zoom]);
  useEffect(() => {
    if (!initialAnchorPhotoId || restoredAnchorRef.current === initialAnchorPhotoId || !viewportRef.current) return;
    const index = photos.findIndex((photo) => photo.id === initialAnchorPhotoId);
    if (index < 0) return;
    viewportRef.current.scrollTop = Math.floor(index / grid.columns) * grid.rowHeight;
    latestScrollTopRef.current = viewportRef.current.scrollTop;
    refreshGrid(false);
    restoredAnchorRef.current = initialAnchorPhotoId;
  }, [grid.columns, grid.rowHeight, initialAnchorPhotoId, photos]);
  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    latestScrollTopRef.current = event.currentTarget.scrollTop;
    scheduleGridRefresh();
  };
  const moveFocus = (index: number, delta: number) => {
    const next = Math.max(0, Math.min(photos.length - 1, index + delta));
    if (next === index) return;
    const nextRow = Math.floor(next / grid.columns);
    const viewport = viewportRef.current;
    if (viewport) {
      const rowTop = nextRow * grid.rowHeight;
      if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
      if (rowTop + grid.rowHeight > viewport.scrollTop + viewport.clientHeight) {
        viewport.scrollTop = Math.max(0, rowTop - viewport.clientHeight + grid.rowHeight);
      }
    }
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-photo-index="${next}"]`)?.focus();
    });
  };
  const visible = photos.slice(grid.startIndex, grid.endIndex);
  return <div className="sheet-scroll" ref={viewportRef} onScroll={onScroll} tabIndex={0}><div className="virtual-grid-inner" style={{ height: grid.totalHeight }}><div className="virtual-grid-layer">{visible.map((photo, offset) => { const index = grid.startIndex + offset; const row = Math.floor(index / grid.columns); const column = index % grid.columns; return <PhotoTile key={photo.id} photoSource={photoSource} photo={photo} selected={selected.has(photo.id)} inPool={poolIdSet.has(photo.id)} missing={missingIds.has(photo.id)} index={index} columns={grid.columns} style={{ top: row * grid.rowHeight, left: column * (grid.tileWidth + grid.gap), width: grid.tileWidth, height: grid.rowHeight - grid.gap }} onToggle={(event) => onToggle(photo.id, index, event)} onOpen={() => onOpen(index)} onMoveFocus={moveFocus} onPhotoSourceError={onPhotoSourceError} />; })}</div></div></div>;
}

function sameVirtualGrid(left: ContactSheetVirtualGrid, right: ContactSheetVirtualGrid) {
  return left.columns === right.columns
    && left.tileWidth === right.tileWidth
    && left.rowHeight === right.rowHeight
    && left.totalHeight === right.totalHeight
    && left.firstVisibleIndex === right.firstVisibleIndex
    && left.startIndex === right.startIndex
    && left.endIndex === right.endIndex;
}

function PhotoTile({ photoSource, photo, selected, inPool, missing, index, columns, style, onToggle, onOpen, onMoveFocus, onPhotoSourceError }: { readonly photoSource: AppDependencies["photoSource"]; readonly photo: PhotoRef; readonly selected: boolean; readonly inPool: boolean; readonly missing: boolean; readonly index: number; readonly columns: number; readonly style: CSSProperties; readonly onToggle: (event?: ReactMouseEvent<HTMLElement>) => void; readonly onOpen: () => void; readonly onMoveFocus: (index: number, delta: number) => void; readonly onPhotoSourceError: (photoId: PhotoId, error: SourceError) => void; }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") { event.preventDefault(); onToggle(); }
    if (event.key === "Enter") { event.preventDefault(); onOpen(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); onMoveFocus(index, -1); }
    if (event.key === "ArrowRight") { event.preventDefault(); onMoveFocus(index, 1); }
    if (event.key === "ArrowUp") { event.preventDefault(); onMoveFocus(index, -columns); }
    if (event.key === "ArrowDown") { event.preventDefault(); onMoveFocus(index, columns); }
  };
  const stateLabel = `${selected ? "已选择" : "未选择"}${inPool ? "，已在 Pool" : ""}${missing ? "，文件已移动或重命名" : ""}`;

  return (
    <article
      className={`photo-tile${selected ? " is-selected" : ""}${inPool ? " is-in-pool" : ""}${missing ? " is-missing" : ""}`}
      data-photo-index={index}
      style={style}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={onToggle}
      onDoubleClick={onOpen}
      draggable
      onDragStart={(event) => event.dataTransfer.setData("application/x-photoflex-photo", photo.id)}
      aria-label={`${photo.relativePath}，${stateLabel}`}
    >
      <div className="photo-image-wrap">
        <PhotoThumb photoSource={photoSource} photoId={photo.id} alt={photo.relativePath} onError={onPhotoSourceError} />
        {inPool && <span className="pool-mark">IN POOL</span>}
        {missing && <span className="missing-mark">MISSING</span>}
        {selected && <span className="check-mark">✓</span>}
      </div>
      <div className="photo-meta">
        <strong>{photo.relativePath.split("/").at(-1)}</strong>
        <button className="view-button" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
          View
        </button>
      </div>
    </article>
  );
}

function PreviewOverlay({ photoIds, index, workspace, photoSource, onClose, onMove, onTogglePool, onPhotoSourceError }: { readonly photoIds: readonly PhotoId[]; readonly index: number; readonly workspace: ProjectWorkspace; readonly photoSource: AppDependencies["photoSource"]; readonly onClose: () => void; readonly onMove: (index: number) => void; readonly onTogglePool: (photoId: PhotoId) => Promise<void>; readonly onPhotoSourceError?: (photoId: PhotoId, error: SourceError) => void; }) {
  const photoId = photoIds[index];
  const [photo, setPhoto] = useState<PhotoRef>();
  const [url, setUrl] = useState<string>();
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [naturalSize, setNaturalSize] = useState<{ readonly width: number; readonly height: number }>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(dialogRef, onClose);

  useEffect(() => {
    let active = true;
    setPhoto(undefined);
    void photoSource.getPhoto(photoId).then((result) => {
      if (active && result.ok) setPhoto(result.value);
      if (active && !result.ok) onPhotoSourceError?.(photoId, result.error);
    });
    return () => { active = false; };
  }, [onPhotoSourceError, photoId, photoSource]);
  useEffect(() => {
    let active = true;
    let lease: { url: string; release(): void } | undefined;
    setUrl(undefined);
    setZoom("fit");
    setNaturalSize(undefined);

    // Preview URLs are leased by PhotoSource. Releasing on photo change prevents
    // large Blob URLs from accumulating while the user navigates with arrows.
    void photoSource.preview(photoId).then((result) => {
      if (!result.ok) { if (active) onPhotoSourceError?.(photoId, result.error); return; }
      if (!active) { result.value.release(); return; }
      lease = result.value;
      setUrl(result.value.url);
    });
    return () => { active = false; lease?.release(); };
  }, [onPhotoSourceError, photoId, photoSource]);
  useEffect(() => {
    for (const adjacentIndex of [index - 1, index + 1]) {
      const adjacentId = photoIds[adjacentIndex];
      if (!adjacentId) continue;
      void photoSource.preview(adjacentId).then((result) => {
        if (result.ok) result.value.release();
      });
    }
  }, [index, photoIds, photoSource]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowLeft") onMove(Math.max(0, index - 1));
      if (event.key === "ArrowRight") onMove(Math.min(photoIds.length - 1, index + 1));
      if (event.key === " ") { event.preventDefault(); setZoom((value) => value === "fit" ? 1 : "fit"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onMove, photoIds.length]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onPreviewWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      // A non-passive native listener must cancel Ctrl+wheel before the browser
      // interprets it as page zoom. PhotoFlex then owns the same gesture locally.
      event.preventDefault();
      event.stopPropagation();
      setZoom((value) => Math.max(.25, Math.min(4, (value === "fit" ? 1 : value) - Math.sign(event.deltaY) * .1)));
    };
    dialog.addEventListener("wheel", onPreviewWheel, { passive: false });
    return () => dialog.removeEventListener("wheel", onPreviewWheel);
  }, []);

  const inPool = workspace.poolPhotoIds.includes(photoId);
  const label = photo?.relativePath ?? shortId(photoId);
  return (
    <div ref={dialogRef} className="preview-backdrop" role="dialog" aria-modal="true" aria-label="Full Size Preview">
      <div className="preview-top">
        <span>PHOTO {String(index + 1).padStart(2, "0")} / {label}</span>
        <button autoFocus onClick={onClose} aria-label="关闭预览">×</button>
      </div>
      <button className="preview-arrow preview-arrow-left" onClick={() => onMove(Math.max(0, index - 1))} disabled={!index}>‹</button>
      <div ref={imageWrapRef} className={`preview-image-wrap${zoom === "fit" ? " is-fit" : " is-zoomed"}`}>
        {url
          ? <img
              src={url}
              alt={label}
              onLoad={(event) => {
                // The browser-decoded dimensions already reflect JPEG EXIF orientation.
                setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
              }}
              style={zoom === "fit"
                // This box never depends on the photo's decoded dimensions, so the
                // first visible frame already contains the complete photo.
                ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "center" }
                : naturalSize ? { width: `${naturalSize.width * zoom}px`, height: `${naturalSize.height * zoom}px` } : undefined}
            />
          : <div className="preview-placeholder">Preview unavailable</div>}
      </div>
      <button className="preview-arrow preview-arrow-right" onClick={() => onMove(Math.min(photoIds.length - 1, index + 1))} disabled={index === photoIds.length - 1}>›</button>
      <div className="preview-bottom">
        <span>
          {String(index + 1).padStart(2, "0")} / {photoIds.length}
          <small>← / → 下一张 · Space 适应画面 · Ctrl + 滚轮缩放 · Esc 返回</small>
        </span>
        <span className="preview-zoom-controls">
          <button onClick={() => setZoom("fit")} aria-pressed={zoom === "fit"}>Fit</button>
          <button onClick={() => setZoom(1)} aria-pressed={zoom === 1}>Reset</button>
          <span>{zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        </span>
        <button className="button button-secondary" onClick={() => void onTogglePool(photoId)}>
          {inPool ? "Remove from Pool" : "Add to Pool"}
        </button>
      </div>
    </div>
  );
}

function MemoCard({ value, onChange }: { readonly value: string; readonly onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => setDraft(value), [value]);
  useEffect(() => { const timer = window.setTimeout(() => { if (draft !== value) onChangeRef.current(draft); }, 500); return () => window.clearTimeout(timer); }, [draft, value]);
  return <section className="memo-card"><p className="eyebrow">PROJECT MEMO</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="记录这个项目的方向、问题或下一步。" rows={5} /></section>;
}

function InlineTitle({ value, onSave }: { readonly value: string; readonly onSave: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing) return <button className="editable-title" onClick={() => setEditing(true)}>{value}<span>✎</span></button>;
  return <input className="title-input" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { void onSave(draft); setEditing(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void onSave(draft); setEditing(false); } if (event.key === "Escape") { setDraft(value); setEditing(false); } }} />;
}

function PhotoThumb({ photoSource, photoId, alt, onError }: { readonly photoSource: AppDependencies["photoSource"]; readonly photoId: PhotoId; readonly alt: string; readonly onError?: (photoId: PhotoId, error: SourceError) => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { let active = true; let lease: { url: string; release(): void } | undefined; void photoSource.thumbnail(photoId).then((result) => { if (!result.ok) { if (active) onError?.(photoId, result.error); return; } if (!active) { result.value.release(); return; } lease = result.value; setUrl(result.value.url); }); return () => { active = false; lease?.release(); }; }, [onError, photoId, photoSource]);
  return url ? <img src={url} alt={alt} loading="lazy" /> : <div className="thumb-placeholder" aria-label={`${alt} 缩略图加载中`} />;
}

function useDialogKeyboard(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;

    // Keep keyboard focus inside the dialog and return it to the button that
    // opened the dialog. Escape is the single close shortcut for both dialogs.
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [ref]);
}

function useWorkspace(dependencies: AppDependencies, projectId: ProjectId) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => { let active = true; setLoading(true); setError(undefined); setWorkspace(undefined); void dependencies.projectStore.loadWorkspace(projectId).then((result) => { if (!active) return; setLoading(false); if (result.ok) setWorkspace(result.value); else setError("项目数据无法读取，请返回 Home 重试。"); }); return () => { active = false; }; }, [dependencies.projectStore, projectId]);
  return { workspace, setWorkspace, loading, error };
}

function useWorkspaceSaver(dependencies: AppDependencies, workspace: ProjectWorkspace | undefined, setWorkspace: (workspace: ProjectWorkspace) => void, setNotice: (message: string | undefined) => void) {
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  return async (next: ProjectWorkspace): Promise<boolean> => {
    const current = workspaceRef.current;
    if (!current) return false;
    const result = await dependencies.projectStore.saveWorkspace(next, current.revision);
    if (result.ok) { const saved = { ...next, revision: result.value.revision }; workspaceRef.current = saved; setWorkspace(saved); return true; }
    setNotice(saveErrorMessage(result.error.kind));
    return false;
  };
}

function useSourceMonitor(photoSource: AppDependencies["photoSource"], sources: readonly SourceRecord[]) {
  const [states, setStates] = useState<Record<string, SourceRuntimeState>>({});
  const sourceKey = sources.map((source) => source.id).join(",");
  const startScan = (sourceId: SourceId) => startSharedScan(photoSource, sourceId);

  useEffect(() => {
    let active = true;
    const scans = scansFor(photoSource);
    const unsubscribers = sources.map((source) => {
      const listener: ScanListener = (state) => {
        if (active) setStates((current) => ({ ...current, [source.id]: state }));
      };
      scans.get(source.id)?.listeners.add(listener);

      void photoSource.getSourceState(source.id).then((result) => {
        if (!active || !result.ok) return;
        setStates((current) => ({ ...current, [source.id]: result.value }));
        if (stateNeedsScan(result.value)) startSharedScan(photoSource, source.id);
        scans.get(source.id)?.listeners.add(listener);
      });
      return () => scans.get(source.id)?.listeners.delete(listener);
    });

    // Scanning belongs to the Source, not to a React page. Navigating between
    // Project and Contact Sheet only removes this page's listener; the job keeps
    // running so switching projects cannot discard partially indexed photos.
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [photoSource, sourceKey]);
  return { states, startScan };
}

async function reconnectSource(dependencies: AppDependencies, workspace: ProjectWorkspace, source: SourceRecord, persist: (workspace: ProjectWorkspace) => Promise<boolean>, startScan: (sourceId: SourceId) => void) {
  const restored = await dependencies.photoSource.restoreFolder(source.id);
  if (restored.ok) {
    startScan(source.id);
    return;
  }

  const result = await dependencies.photoSource.chooseFolder(workspace.sources.map((item) => item.id));
  if (!result.ok) return;
  if (result.value.sourceId === source.id) { const saved = await persist({ ...workspace, sources: workspace.sources.map((item) => item.id === source.id ? { ...item, removedAt: undefined } : item), updatedAt: now() }); if (saved) startScan(source.id); }
}

function stateNeedsScan(state?: SourceRuntimeState) {
  return !state || state.status === "loading" || (state.status === "ready" && state.indexedCount === 0);
}

function stateHasPhotos(state?: SourceRuntimeState) {
  return Boolean(state && state.indexedCount > 0);
}

function initialRuntimeState(sourceId: SourceId): SourceRuntimeState {
  return {
    sourceId,
    status: "loading",
    discoveredCount: 0,
    indexedCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };
}

function totalIndexed(states: Record<string, SourceRuntimeState>) {
  return Object.values(states).reduce((total, state) => total + state.indexedCount, 0);
}

function progressPercent(state?: SourceRuntimeState) {
  if (!state?.discoveredCount) return 0;
  return Math.min(100, Math.round((state.indexedCount / state.discoveredCount) * 100));
}

function sourceCounts(state?: SourceRuntimeState) {
  if (!state) return "正在读取…";
  if (state.status === "loading") {
    return `${state.indexedCount} indexed · ${state.discoveredCount} discovered · ${progressPercent(state)}%`;
  }
  return `${state.indexedCount} indexed${state.failedCount ? ` · ${state.failedCount} failed` : ""}${state.skippedCount ? ` · ${state.skippedCount} skipped` : ""}`;
}

function statusLabel(status: SourceRuntimeState["status"]) {
  return status.replace("permission-lost", "permission lost").toUpperCase();
}

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase();
}
function sourceErrorMessage(kind: SourceError["kind"]) {
  if (kind === "permission-denied") return "文件夹访问被拒绝。";
  if (kind === "permission-lost") return "文件夹授权已失效，请重新连接。";
  return "文件夹暂时无法读取，请重试。";
}

function createErrorMessage(kind: string) {
  if (kind === "project-id-exists") return "项目已存在，请重试。";
  if (kind === "quota-exceeded") return "浏览器存储空间不足。";
  return "项目创建失败，已保留当前输入。";
}

function saveErrorMessage(kind: string) {
  if (kind === "conflict") return "项目已在其他标签页更新，请刷新后重试。";
  if (kind === "quota-exceeded") return "浏览器存储空间不足，当前状态未覆盖。";
  return "保存失败，当前状态仍保留在页面中。";
}

function StatusDot({ status }: { readonly status: SourceRuntimeState["status"] }) { return <span className="status-dot" aria-hidden="true" data-status={status} />; }
function InlineNotice({ message }: { readonly message: string }) { return <p className="inline-notice" role="status">{message}</p>; }
function InlineError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) { return <div className="inline-error" role="alert"><span>{message}</span><button className="text-button" onClick={onRetry}>Retry</button></div>; }
function EmptyPanel({ eyebrow = "NO CONTENT YET", title, detail, children }: { readonly eyebrow?: string; readonly title: string; readonly detail?: string; readonly children?: ReactNode }) { return <section className="empty-panel"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{detail && <p>{detail}</p>}{children && <div className="empty-actions">{children}</div>}</section>; }
function LoadingPage() { return <main className="page centered-state"><div className="loading-mark" /><p>Loading workspace…</p></main>; }
function ErrorPage({ message }: { readonly message: string }) { return <main className="page centered-state"><p className="eyebrow">RECOVERY</p><h1>{message}</h1><a href={routeToHash({ name: "home" })}>Return to Home</a></main>; }

function formatUpdated(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? `Today, ${time}` : date.toLocaleDateString();
}
