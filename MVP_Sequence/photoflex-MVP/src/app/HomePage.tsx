import { useEffect, useState } from "react";
import type { ProjectId, ProjectSummary } from "../contracts";
import { PhotoThumb } from "./PhotoThumb";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { formatUpdated, InlineError, EmptyPanel } from "./AppPrimitives";
import { NewProjectDialog } from "./ProjectDialog";
import { deleteProjectWorkspace, projectDeletionErrorMessage, resumePendingProjectDeletions } from "./ProjectWorkspaceActions";
import { createHomeGallery, type HomeGalleryPhoto } from "./homeGallery";
import { useLocale } from "./locale";

interface GalleryPhoto extends HomeGalleryPhoto {
  readonly isPortrait: boolean;
}

export function HomePage({
  dependencies,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { locale, t } = useLocale();
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [showDialog, setShowDialog] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<ProjectId>();
  const [renamingProjectId, setRenamingProjectId] = useState<ProjectId>();
  const [editingProjectId, setEditingProjectId] = useState<ProjectId>();
  const [renameDraft, setRenameDraft] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>();
  const [gallery, setGallery] = useState<{ projectId: ProjectId; rows: GalleryPhoto[][] }>();

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
      else setError(t("home.projectListFailed"));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [dependencies, t]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const activeProjectId = selectedProject?.id;
  const rows = gallery?.projectId === activeProjectId ? gallery?.rows : undefined;

  useEffect(() => {
    if (!activeProjectId) return;
    let active = true;
    void dependencies.projectStore.loadWorkspace(activeProjectId).then(async (result) => {
      if (!active) return;
      if (!result.ok) setError(t("home.projectPhotosFailed"));
      if (!result.ok) {
        setGallery({ projectId: activeProjectId, rows: [] });
        return;
      }
      const workspace = result.value;
      const rows = await Promise.all(createHomeGallery(workspace.worktableDraft.entryOrder.map((itemId) => workspace.worktableDraft.placements[itemId].photoId)).map((row) =>
        Promise.all(row.map(async (item) => {
          const photo = await dependencies.photoSource.getPhoto(item.photoId);
          const fallback = workspace.worktableDraft.entryOrder.map((itemId) => workspace.worktableDraft.placements[itemId]).find((placement) => placement.photoId === item.photoId);
          const width = photo.ok ? photo.value.width : fallback?.width ?? 1;
          const height = photo.ok ? photo.value.height : fallback?.height ?? 1;
          return { ...item, isPortrait: height > width };
        })),
      ));
      if (active) setGallery({ projectId: activeProjectId, rows });
    });
    return () => { active = false; };
  }, [activeProjectId, dependencies.photoSource, dependencies.projectStore, t]);

  const deleteProject = async (project: ProjectSummary) => {
    if (!window.confirm(t("home.deleteConfirm", { name: project.name }))) return;
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

  const beginRename = (project: ProjectSummary) => {
    setSelectedProjectId(project.id);
    setEditingProjectId(project.id);
    setRenameDraft(project.name);
  };

  const renameProject = async (project: ProjectSummary) => {
    const name = renameDraft.trim();
    if (!name) {
      setError(t("project.enterName"));
      return;
    }
    if (name === project.name) {
      setEditingProjectId(undefined);
      return;
    }
    setRenamingProjectId(project.id);
    setError(undefined);
    const loaded = await dependencies.projectStore.loadWorkspace(project.id);
    if (!loaded.ok) {
      setError(t("home.renameFailed"));
      setRenamingProjectId(undefined);
      return;
    }
    const updatedAt = new Date().toISOString();
    const saved = await dependencies.projectStore.saveWorkspace(
      { ...loaded.value, name, updatedAt },
      loaded.value.revision,
    );
    if (!saved.ok) {
      setError(t("home.renameFailed"));
      setRenamingProjectId(undefined);
      return;
    }
    setProjects((current) => current.map((item) => item.id === project.id ? { ...item, name, updatedAt } : item));
    setEditingProjectId(undefined);
    setRenamingProjectId(undefined);
  };

  return (
    <main className="page home-page">
      <aside className="home-project-index" aria-label={t("home.projectIndex")}>
        <section className={`page-intro home-intro${projects.length === 0 ? " is-empty" : ""}`}>
          <h1 aria-label={t("home.yourProjects")}>{t("home.projects")}</h1>
          <button className="home-new-project" aria-label={t("home.newProject")} onClick={() => setShowDialog(true)}>+</button>
        </section>
        {loading ? (
          <div className="home-project-index-skeleton" aria-label={t("home.loadingProjects")}>
            {[1, 2, 3, 4].map((item) => <span key={item} />)}
          </div>
        ) : (
          <ul className="home-project-index-list">
            {projects.map((project) => (
              <li key={project.id} className={`home-project-index-item${project.id === selectedProject?.id ? " is-active" : ""}`}>
                {editingProjectId === project.id ? (
                  <input
                    className="home-project-rename-input"
                    autoFocus
                    value={renameDraft}
                    maxLength={80}
                    aria-label={`${t("home.renameProject")} ${project.name}`}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); void renameProject(project); }
                      if (event.key === "Escape") { setEditingProjectId(undefined); setRenameDraft(project.name); }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="home-project-select"
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    {project.name}
                  </button>
                )}
                {editingProjectId === project.id ? (
                  <button
                    type="button"
                    className="home-project-save-name"
                    title={t("common.save")}
                    aria-label={`${t("common.save")} ${project.name}`}
                    disabled={renamingProjectId === project.id || !renameDraft.trim()}
                    onClick={() => void renameProject(project)}
                  >✓</button>
                ) : (
                  <button
                    type="button"
                    className="home-project-rename"
                    title={t("home.renameProject")}
                    aria-label={`${t("home.renameProject")} ${project.name}`}
                    onClick={() => beginRename(project)}
                  >✎</button>
                )}
                <button
                  type="button"
                  className="home-project-delete"
                  title={t("home.deleteProject")}
                  aria-label={`${t("home.deleteProject")} ${project.name}`}
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
          <div className="home-gallery-loading" role="status">{t("home.loadingPhotos")}</div>
        ) : selectedProject ? (
          <article className="home-project-feature">
            {!rows ? <div className="home-gallery-loading" role="status">{t("home.loadingPhotos")}</div> : rows.length ? (
              <div className="home-gallery" aria-label={`${selectedProject.name} ${t("common.photos")}`}>
                {rows.map((row, rowIndex) => (
                  <div className="home-gallery-row" key={rowIndex}>
                    <div className="home-gallery-strip">
                    {row.map(({ photoId, column, isPortrait }) => (
                      <button
                        key={photoId}
                        type="button"
                        className={`home-gallery-photo${isPortrait ? " is-portrait" : ""}`}
                        style={{ gridColumn: column }}
                        data-project-id={selectedProject.id}
                        data-photo-id={photoId}
                        onClick={() => navigate({ name: "table", projectId: selectedProject.id })}
                        aria-label={`${t("home.openProject", { name: selectedProject.name })} — ${photoId}`}
                      >
                        <PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt={t("home.projectPhoto", { name: selectedProject.name })} eager />
                      </button>
                    ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="home-gallery-empty">
                <p>{t("home.noPhotos")}</p>
              </div>
            )}
            <div className="home-project-feature-copy">
              <span>{t("home.updatedAt", { time: formatUpdated(selectedProject.updatedAt, locale) })}</span>
              <button className="button button-secondary" onClick={() => navigate({ name: "table", projectId: selectedProject.id })} aria-label={t("home.openProject", { name: selectedProject.name })}>{t("home.openTable")}</button>
            </div>
          </article>
        ) : (
          <EmptyPanel eyebrow={t("home.noProjects")} title={t("home.beginJourney")}>
            <button type="button" className="button button-primary home-empty-create" onClick={() => setShowDialog(true)}>{t("home.createProject")}</button>
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
