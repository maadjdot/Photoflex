import type { ProjectId, SequenceId } from "../contracts";
import { AppHeader } from "./AppHeader";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { useProjectWorkspaceSession } from "./useProjectWorkspace";

export function TableHeader({ dependencies, projectId, lastSequenceId, navigate }: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly lastSequenceId?: SequenceId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { workspace, coordinator } = useProjectWorkspaceSession(dependencies, projectId);
  const { writeState } = coordinator.getSnapshot();
  return <AppHeader dependencies={dependencies} route={{ name: "table", projectId }} projectId={projectId} lastSequenceId={lastSequenceId} navigate={navigate} variant="table" projectLabel={workspace?.name ?? "Loading…"} actions={
    <div id="table-header-controls" className="table-header-controls">
      {writeState === "failed" && <button type="button" className="table-save-retry" onClick={() => void coordinator.retry({ kind: "workspace" })}>Changes not saved · Retry</button>}
    </div>
  } />;
}
