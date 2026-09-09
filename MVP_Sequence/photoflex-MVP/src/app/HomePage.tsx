import { useEffect, useState } from "react";
import type { ProjectId, ProjectSummary } from "../contracts";
import { PhotoThumb } from "./PhotoThumb";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { formatUpdated, InlineError, EmptyPanel } from "./AppPrimitives";
import { NewProjectDialog } from "./ProjectDialog";
import { deleteProjectWorkspace, projectDeletionErrorMessage, resumePendingProjectDeletions } from "./ProjectWorkspaceActions";
import { createHomeGallery, type HomeGalleryPhoto } from "./homeGallery";

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
  const [deletingProjectId, setDeletingProjectId] = useState<ProjectId>();
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>();
  const [gallery, setGallery] = useState<{ projectId: ProjectId; rows: HomeGalleryPhoto[][] }>();

  useEffect(() => {
    let active = true;
    void dependencies.projectStore.listProjects().then(async (result) => {
      if (!active) return;
      if (result.ok) {
        const recovery = await resumePendingProjectDeletions(dependencies, result.value);
        if (!active) return;
        if (recovery.failures.length) setError(projectDeletionErrorMessage(recovery.failures[0].error));
        setProjects(recovery.projects);
      }
      else setError("项目列表暂时无法读取，请重试。");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [dependencies.projectStore]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const activeProjectId = selectedProject?.id;
  const rows = gallery?.projectId === activeProjectId ? gallery?.rows : undefined;

  useEffect(() => {
    if (!activeProjectId) return;
    let active = true;
    void dependencies.projectStore.loadWorkspace(activeProjectId).then((result) => {
      if (!active) return;
      if (!result.ok) setError("项目照片暂时无法读取，请重试。");
      setGallery({ projectId: activeProjectId, rows: result.ok ? createHomeGallery(result.value.worktableDraft.entryOrder) : [] });
    });
    return () => { active = false; };
  }, [activeProjectId, dependencies.projectStore]);

  const deleteProject = async (project: ProjectSummary) => {
    if (!window.confirm(`Delete project “${project.name}”? Original photos will not be deleted.`)) return;
    setDeletingProjectId(project.id);
    const deleted = await deleteProjectWorkspace(dependencies, project.id);
    if (!deleted.ok) {
      setError(projectDeletionErrorMessage(deleted.error));
      setDeletingProjectId(undefined);
      return;
    }
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setDeletingProjectId(undefined);
  };

  return (
    <main className="page home-page">
      <aside className="home-project-index" aria-label="项目索引">
        <section className={`page-intro home-intro${projects.length === 0 ? " is-empty" : ""}`}>
          <h1 aria-label="Your Projects">Projects</h1>
          <button className="home-new-project" aria-label="New project" onClick={() => setShowDialog(true)}>+</button>
        </section>
        {loading ? (
          <div className="home-project-index-skeleton" aria-label="项目加载中">
            {[1, 2, 3, 4].map((item) => <span key={item} />)}
          </div>
        ) : (
          <ul className="home-project-index-list">
            {projects.map((project) => (
              <li key={project.id} className={`home-project-index-item${project.id === selectedProject?.id ? " is-active" : ""}`}>
                <button
                  type="button"
                  className="home-project-select"
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  {project.name}
                </button>
                <button
                  type="button"
                  className="home-project-delete"
                  title="Delete project"
                  aria-label={`Delete project ${project.name}`}
                  disabled={deletingProjectId === project.id}
                  onClick={() => void deleteProject(project)}
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="home-project-stage">
        {error && <InlineError message={error} onRetry={() => window.location.reload()} />}
        {loading ? (
          <div className="home-gallery-loading" role="status">Loading photos…</div>
        ) : selectedProject ? (
          <article className="home-project-feature">
            {!rows ? <div className="home-gallery-loading" role="status">Loading photos…</div> : rows.length ? (
              <div className="home-gallery" aria-label={`${selectedProject.name} photos`}>
                {rows.map((row, rowIndex) => (
                  <div className="home-gallery-row" key={rowIndex}>
                    <div className="home-gallery-strip">
                    {row.map(({ photoId, column }) => (
                      <button
                        key={photoId}
                        type="button"
                        className="home-gallery-photo"
                        style={{ gridColumn: column }}
                        data-project-id={selectedProject.id}
                        data-photo-id={photoId}
                        onClick={() => navigate({ name: "table", projectId: selectedProject.id })}
                        aria-label={`Open ${selectedProject.name} Table — photo ${photoId}`}
                      >
                        <PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt={`${selectedProject.name} photograph`} eager />
                      </button>
                    ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="home-gallery-empty">
                <p>No photos on this Table yet</p>
                <button className="button button-secondary" onClick={() => navigate({ name: "table", projectId: selectedProject.id })} aria-label={`打开项目 ${selectedProject.name}`}>Open Table</button>
              </div>
            )}
            <div className="home-project-feature-copy">
              <span>Updated {formatUpdated(selectedProject.updatedAt)}</span>
            </div>
          </article>
        ) : (
          <EmptyPanel eyebrow="NO PROJECTS YET" title="Begin your photo journey">
            <button type="button" className="button button-primary home-empty-create" onClick={() => setShowDialog(true)}>Create a project</button>
          </EmptyPanel>
        )}
      </section>

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
