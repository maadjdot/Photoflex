import { useEffect, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type { ProjectId, ProjectSummary } from "../contracts";
import trashBinIcon from "../assets/icons/trash-bin.png";
import { PhotoThumb } from "./PhotoThumb";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { InlineError, EmptyPanel } from "./AppPrimitives";
import { NewProjectDialog } from "./ProjectDialog";
import { deleteProjectWorkspace } from "./ProjectWorkspaceActions";
export const PROJECT_DRAG_TYPE = "application/x-photoflex-project";

export function HomePage({
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

function ProjectCover({ project, dependencies }: { readonly project: ProjectSummary; readonly dependencies: AppDependencies }) {
  if (project.coverPhotoId) return <PhotoThumb photoSource={dependencies.photoSource} photoId={project.coverPhotoId} alt={`${project.name} cover`} />;
  return <div className="cover-placeholder" aria-hidden="true"><span /><span /></div>;
}
