import { AppHeader } from "./AppHeader";
import { ContactSheetPage } from "./ContactSheetPage";
import type { AppDependencies } from "./dependencies";
import { HomePage } from "./HomePage";
import { ProjectPage } from "./ProjectPage";
import { SequenceComparePage, SequencePage, VersionComparePage } from "./SequencePage";
import { TablePage } from "./TablePage";
import { useAppRoute } from "./router";
import { useAppNavigationState } from "./useAppNavigationState";
import { ProjectWorkspaceProvider } from "./useProjectWorkspace";

export { VirtualPhotoGrid } from "./VirtualPhotoGrid";

interface AppProps {
  readonly dependencies: AppDependencies;
}

export function M1App({ dependencies }: AppProps) {
  const [route, navigate] = useAppRoute();
  const { currentProjectId, contactSourceId, lastSequenceId } = useAppNavigationState(dependencies, route);

  const projectContent = currentProjectId ? (
    <ProjectWorkspaceProvider dependencies={dependencies} projectId={currentProjectId}>
      {route.name === "project" && <ProjectPage dependencies={dependencies} projectId={route.projectId} navigate={navigate} />}
      {route.name === "contact-sheet" && <ContactSheetPage dependencies={dependencies} projectId={route.projectId} sourceId={route.sourceId} navigate={navigate} />}
      {route.name === "table" && <TablePage dependencies={dependencies} projectId={route.projectId} navigate={navigate} />}
      {route.name === "sequence" && <SequencePage dependencies={dependencies} projectId={route.projectId} sequenceId={route.sequenceId} openVersionId={route.openVersionId} navigate={navigate} />}
      {route.name === "sequence-compare" && <SequenceComparePage dependencies={dependencies} projectId={route.projectId} leftSequenceId={route.leftSequenceId} rightSequenceId={route.rightSequenceId} navigate={navigate} />}
      {route.name === "version-compare" && <VersionComparePage dependencies={dependencies} projectId={route.projectId} leftVersionId={route.leftVersionId} rightVersionId={route.rightVersionId} navigate={navigate} />}
    </ProjectWorkspaceProvider>
  ) : (
    <HomePage dependencies={dependencies} navigate={navigate} />
  );

  return (
    <div className="app-shell">
      <AppHeader dependencies={dependencies} route={route} projectId={currentProjectId} contactSourceId={contactSourceId} lastSequenceId={lastSequenceId} navigate={navigate} />
      {projectContent}
    </div>
  );
}
