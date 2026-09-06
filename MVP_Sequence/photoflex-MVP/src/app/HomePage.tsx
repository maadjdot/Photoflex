import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import type { PhotoId, ProjectId, ProjectSummary } from "../contracts";
import trashBinIcon from "../assets/icons/trash-bin.png";
import { PhotoThumb } from "./PhotoThumb";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { formatUpdated, InlineError, EmptyPanel } from "./AppPrimitives";
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
  const [showDialog, setShowDialog] = useState(false);
  const [draggingProject, setDraggingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<ProjectId>();
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>();
  const [coverPhotoIds, setCoverPhotoIds] = useState<Record<string, PhotoId | null>>({});
  const draggingProjectRef = useRef<ProjectId | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void dependencies.projectStore.listProjects().then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        setProjects(result.value);
        setCoverPhotoIds({});
        void Promise.all(result.value.map(async (project) => [project.id, await resolveHomeCoverPhoto(dependencies, project.id)] as const)).then((covers) => {
          if (!active) return;
          setCoverPhotoIds(Object.fromEntries(covers));
        });
      }
      else setError("项目列表暂时无法读取，请重试。");
    });
    return () => {
      active = false;
    };
  }, [dependencies.projectStore]);

  const filtered = useMemo(() => projects, [projects]);

  const selectedProject = filtered.find((project) => project.id === selectedProjectId) ?? filtered[0];

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

  const startProjectDrag = (event: ReactDragEvent<HTMLElement>, projectId: ProjectId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(PROJECT_DRAG_TYPE, projectId);
    event.dataTransfer.setData("text/plain", projectId);
    draggingProjectRef.current = projectId;
    setDraggingProject(true);
  };

  const endProjectDrag = () => {
    draggingProjectRef.current = undefined;
    setDraggingProject(false);
  };

  return (
    <main className="page home-page">
      <section className={`page-intro home-intro${projects.length === 0 ? " is-empty" : ""}`}>
        <h1 aria-label="Your Projects">
          Projects
          <button className="home-new-project" aria-label="New project" onClick={() => setShowDialog(true)}>+</button>
        </h1>
      </section>

      {error && <InlineError message={error} onRetry={() => window.location.reload()} />}
      {loading ? (
        <div className="project-grid" aria-label="项目加载中">
          {[1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}
        </div>
      ) : filtered.length && selectedProject ? (
        <section className="home-projects-view" aria-label="项目列表">
          <aside className="home-project-index" aria-label="项目索引">
            <div className="home-project-index-list">
              {filtered.map((project) => (
                <button
                  key={project.id}
                  className={`home-project-index-item${project.id === selectedProject.id ? " is-active" : ""}`}
                  draggable
                  onClick={() => setSelectedProjectId(project.id)}
                  onDragStart={(event) => startProjectDrag(event, project.id)}
                  onDragEnd={endProjectDrag}
                >
                  <strong>{project.name}</strong>
                </button>
              ))}
            </div>
          </aside>
          <article className="home-project-feature">
            <button
              className="home-project-feature-media"
              draggable
              data-project-id={selectedProject.id}
              onClick={() => navigate({ name: "table", projectId: selectedProject.id })}
              onDragStart={(event) => startProjectDrag(event, selectedProject.id)}
              onDragEnd={endProjectDrag}
              aria-label={`打开项目 ${selectedProject.name}`}
            >
              <div className="project-cover">
                <ProjectCover project={selectedProject} dependencies={dependencies} photoId={coverPhotoIds[selectedProject.id]} />
              </div>
            </button>
            <div className="home-project-feature-copy">
              <h2>{selectedProject.name}</h2>
              <span>Updated {formatUpdated(selectedProject.updatedAt)}</span>
            </div>
          </article>
        </section>
      ) : (
        <EmptyPanel eyebrow="NO PROJECTS YET" title="Begin your photo journey" />
      )}

      {projects.length > 0 && (
        <div
          className={`project-trash${draggingProject ? " is-dragging" : ""}`}
          onDragOver={(event) => {
            if (!draggingProjectRef.current && !event.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDragEnter={(event) => {
            if (!draggingProjectRef.current && !event.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return;
            event.preventDefault();
            setDraggingProject(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const projectId = draggingProjectRef.current || event.dataTransfer.getData(PROJECT_DRAG_TYPE) || event.dataTransfer.getData("text/plain");
            draggingProjectRef.current = undefined;
            setDraggingProject(false);
            const project = projects.find((item) => item.id === projectId);
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
          onCreated={(projectId) => navigate({ name: "table", projectId })}
        />
      )}
    </main>
  );
}

async function resolveHomeCoverPhoto(dependencies: AppDependencies, projectId: ProjectId): Promise<PhotoId | null> {
  const sequences = await dependencies.projectStore.listSequences(projectId);
  if (sequences.ok) {
    for (const summary of sequences.value) {
      const sequence = await dependencies.projectStore.loadSequence(summary.id);
      if (!sequence.ok) continue;
      const firstPhoto = sequence.value.items.find((item) => item.kind === "photo");
      if (firstPhoto?.kind === "photo") return firstPhoto.photoId;
    }
  }
  const workspace = await dependencies.projectStore.loadWorkspace(projectId);
  return workspace.ok ? workspace.value.worktableDraft.entryOrder[0] ?? null : null;
}

function ProjectCover({ project, dependencies, photoId }: { readonly project: ProjectSummary; readonly dependencies: AppDependencies; readonly photoId?: PhotoId | null }) {
  if (photoId) return <PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt={`${project.name} cover`} resolution="sequence" />;
  if (photoId === null) return <div className="home-no-photo">No Photo</div>;
  return <div className="home-cover-loading" aria-label={`${project.name} cover loading`}>Loading photo…</div>;
}
