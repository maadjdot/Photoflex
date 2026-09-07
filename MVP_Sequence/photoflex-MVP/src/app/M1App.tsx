import { lazy, Suspense } from "react";
import { AppHeader } from "./AppHeader";
import { ContactSheetPage } from "./ContactSheetPage";
import type { AppDependencies } from "./dependencies";
import { HomePage } from "./HomePage";
import { ProjectPage } from "./ProjectPage";
import { TablePage } from "./TablePage";
import { TableHeader } from "./TableHeader";
import { useAppRoute } from "./router";
import { useAppNavigationState } from "./useAppNavigationState";
import { ProjectWorkspaceProvider } from "./useProjectWorkspace";

export { VirtualPhotoGrid } from "./VirtualPhotoGrid";

const SequencePage = lazy(() => import("./SequencePage").then((module) => ({ default: module.SequencePage })));
const SequenceComparePage = lazy(() => import("./SequenceComparePages").then((module) => ({ default: module.SequenceComparePage })));
const VersionComparePage = lazy(() => import("./SequenceComparePages").then((module) => ({ default: module.VersionComparePage })));

interface AppProps {
  readonly dependencies: AppDependencies;
}

export function M1App({ dependencies }: AppProps) {
  const [route, navigate] = useAppRoute();
  const { currentProjectId, contactSourceId, lastSequenceId } = useAppNavigationState(dependencies, route);
  const usesTableChrome = route.name === "home" || route.name === "table" || route.name === "contact-sheet" || route.name === "sequence" || route.name === "sequence-compare" || route.name === "version-compare";

  const projectContent = currentProjectId ? (
    <ProjectWorkspaceProvider dependencies={dependencies} projectId={currentProjectId}>
      {route.name === "table" && <TableHeader dependencies={dependencies} projectId={route.projectId} lastSequenceId={lastSequenceId} navigate={navigate} />}
      {route.name === "project" && <ProjectPage dependencies={dependencies} projectId={route.projectId} navigate={navigate} />}
      {route.name === "contact-sheet" && <ContactSheetPage dependencies={dependencies} projectId={route.projectId} sourceId={route.sourceId} navigate={navigate} />}
      {route.name === "table" && <TablePage dependencies={dependencies} projectId={route.projectId} navigate={navigate} />}
      <Suspense fallback={<main className="page centered-state"><div className="loading-mark" /><p>Loading workspace…</p></main>}>
        {route.name === "sequence" && <SequencePage dependencies={dependencies} projectId={route.projectId} sequenceId={route.sequenceId} openVersionId={route.openVersionId} navigate={navigate} />}
        {route.name === "sequence-compare" && <SequenceComparePage dependencies={dependencies} projectId={route.projectId} leftSequenceId={route.leftSequenceId} rightSequenceId={route.rightSequenceId} navigate={navigate} />}
        {route.name === "version-compare" && <VersionComparePage dependencies={dependencies} projectId={route.projectId} leftVersionId={route.leftVersionId} rightVersionId={route.rightVersionId} navigate={navigate} />}
      </Suspense>
    </ProjectWorkspaceProvider>
  ) : (
    <HomePage dependencies={dependencies} navigate={navigate} />
  );

  return (
    <div className={`app-shell${usesTableChrome ? " is-table" : ""}`}>
      {route.name !== "table" && <AppHeader dependencies={dependencies} route={route} projectId={currentProjectId} contactSourceId={contactSourceId} lastSequenceId={lastSequenceId} navigate={navigate} variant={usesTableChrome ? "table" : "default"} />}
      {projectContent}
    </div>
  );
}
