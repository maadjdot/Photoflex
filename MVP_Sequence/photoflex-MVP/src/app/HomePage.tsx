import { useEffect, useMemo, useState } from "react";
import type { PhotoId, ProjectId, ProjectSummary } from "../contracts";
import { PhotoThumb } from "./PhotoThumb";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { formatUpdated, InlineError, EmptyPanel } from "./AppPrimitives";
import { NewProjectDialog } from "./ProjectDialog";
import { deleteProjectWorkspace, projectDeletionErrorMessage, resumePendingProjectDeletions } from "./ProjectWorkspaceActions";

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
  const [coverPhotoIds, setCoverPhotoIds] = useState<Record<string, PhotoId | null>>({});

  useEffect(() => {
    let active = true;
    void dependencies.projectStore.listProjects().then(async (result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        const recovery = await resumePendingProjectDeletions(dependencies, result.value);
        if (!active) return;
        if (recovery.failures.length) setError(projectDeletionErrorMessage(recovery.failures[0].error));
        setProjects(recovery.projects);
        setCoverPhotoIds({});
        void Promise.all(recovery.projects.map(async (project) => [project.id, await resolveHomeCoverPhoto(dependencies, project.id)] as const)).then((covers) => {
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
            {filtered.map((project) => (
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
          <div className="home-feature-skeleton" aria-hidden="true" />
        ) : filtered.length && selectedProject ? (
          <article className="home-project-feature">
            <button
              className={`home-project-feature-media${coverPhotoIds[selectedProject.id] ? " has-photo" : ""}`}
              data-project-id={selectedProject.id}
              onClick={() => navigate({ name: "table", projectId: selectedProject.id })}
              aria-label={`打开项目 ${selectedProject.name}`}
            >
              <div className="project-cover">
                <ProjectCover project={selectedProject} dependencies={dependencies} photoId={coverPhotoIds[selectedProject.id]} />
              </div>
            </button>
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
