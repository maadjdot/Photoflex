import type { ProjectId, SequenceId } from "../contracts";
import { AppHeader } from "./AppHeader";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { useProjectWorkspaceSession } from "./useProjectWorkspace";
import { useLocale } from "./locale";

export function TableHeader({ dependencies, projectId, lastSequenceId, navigate }: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly lastSequenceId?: SequenceId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { t } = useLocale();
  const { workspace, coordinator } = useProjectWorkspaceSession(dependencies, projectId);
  const { writeState } = coordinator.getSnapshot();
  return <AppHeader dependencies={dependencies} route={{ name: "table", projectId }} projectId={projectId} lastSequenceId={lastSequenceId} navigate={navigate} variant="table" projectLabel={workspace?.name ?? t("common.loading")} actions={
    <div id="table-header-controls" className="table-header-controls">
      {writeState === "failed" && <button type="button" className="table-save-retry" onClick={() => void coordinator.retry({ kind: "workspace" })}>{t("status.changesNotSaved")}</button>}
    </div>
  } />;
}
