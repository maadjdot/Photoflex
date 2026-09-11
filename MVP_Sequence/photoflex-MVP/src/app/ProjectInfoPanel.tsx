import type { ReactNode } from "react";
import type { ProjectWorkspace } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { InlineTitle, MemoCard } from "./AppPrimitives";
import { PhotoThumb } from "./PhotoThumb";
import { useLocale } from "./locale";

interface ProjectInfoPanelProps {
  readonly workspace: ProjectWorkspace;
  readonly photoSource: AppDependencies["photoSource"];
  readonly deleting: boolean;
  readonly onUpdateName: (name: string) => Promise<void>;
  readonly onUpdateMemo: (memo: string) => void;
  readonly onDelete: () => void;
  readonly onAddSource: () => void;
  readonly children: ReactNode;
}

/** Project metadata seam. It commits only through the callbacks supplied by the project session. */
export function ProjectInfoPanel({ workspace, photoSource, deleting, onUpdateName, onUpdateMemo, onDelete, onAddSource, children }: ProjectInfoPanelProps) {
  const { t } = useLocale();
  return <section className="workspace-main">
    <div className="workspace-heading">
      <div className="project-info-heading"><InlineTitle value={workspace.name} onSave={onUpdateName} /><p className="subtitle">{t("project.manageSubtitle")}</p>{workspace.coverPhotoId && <div className="project-info-cover" aria-label={t("project.cover")}><PhotoThumb photoSource={photoSource} photoId={workspace.coverPhotoId} alt={`${workspace.name} ${t("project.cover")}`} resolution="sequence" /></div>}</div>
      <div className="workspace-actions">
        <button className="button button-danger" disabled={deleting} onClick={onDelete}>{deleting ? t("project.deleting") : t("project.deleteProject")}</button>
        <button className="button button-primary" onClick={onAddSource}>{t("project.addFolder")}</button>
      </div>
    </div>
    {children}
    <MemoCard value={workspace.memo} onChange={onUpdateMemo} />
  </section>;
}
