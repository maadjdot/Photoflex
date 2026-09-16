import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createProjectWriteCoordinator, type ProjectWriteCoordinator } from "./projectWriteCoordinator";
import { downloadRecoveryBackup } from "./downloadRecoveryBackup";
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
import { LocaleProvider, useLocale } from "./locale";
import { AccountWorkspaceGate } from "./AccountWorkspaceGate";

export { VirtualPhotoGrid } from "./VirtualPhotoGrid";

const SequenceComparePage = lazy(() => import("./SequenceComparePages").then((module) => ({ default: module.SequenceComparePage })));
const VersionComparePage = lazy(() => import("./SequenceComparePages").then((module) => ({ default: module.VersionComparePage })));

interface AppProps {
  readonly dependencies: AppDependencies;
}

export function M1App(props: AppProps) {
  return <LocaleProvider><AccountWorkspaceGate dependencies={props.dependencies}>{(dependencies) => <M1AppContent dependencies={dependencies} />}</AccountWorkspaceGate></LocaleProvider>;
}

function M1AppContent({ dependencies }: AppProps) {
  const { locale, t } = useLocale();
  const coordinatorRef = useRef<ProjectWriteCoordinator | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string>();
  const [route, navigate] = useAppRoute(async () => {
    const current = coordinatorRef.current;
    if (!current?.hasUnsavedWork()) return true;
    const result = await current.flushAll();
    if (!result.ok) setRecovery(true);
    return result.ok;
  });
  const { currentProjectId, contactSourceId, lastSequenceId } = useAppNavigationState(dependencies, route);
  const coordinator = useMemo(() => currentProjectId ? createProjectWriteCoordinator(dependencies, currentProjectId) : undefined, [dependencies, currentProjectId]);
  coordinatorRef.current = coordinator;
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (coordinatorRef.current?.hasUnsavedWork() || dependencies.cloudSave?.hasPending?.()) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dependencies.cloudSave]);
  const recover = async (asFile: boolean) => {
    if (!coordinator || recovering) return;
    setRecovering(true);
    setRecoveryError(undefined);
    try {
      if (asFile) {
        const result = await coordinator.exportRecoveryBackup();
        if (result.ok) downloadRecoveryBackup(result.value);
        else setRecoveryError(locale === "zh-CN" ? "无法创建恢复备份，草稿仍保持打开。" : "Recovery backup could not be created. Your draft is still open.");
      } else {
        const result = await coordinator.restoreRecoveryCopy();
        if (result.ok) { setRecovery(false); navigate({ name: "project", projectId: result.value }); }
        else setRecoveryError(locale === "zh-CN" ? "无法保存恢复副本。请下载恢复备份或重试保存。" : "The recovery copy could not be saved. Download a recovery backup or retry saving.");
      }
    } finally { setRecovering(false); }
  };
  const usesTableChrome = route.name === "home" || route.name === "table" || route.name === "contact-sheet" || route.name === "sequence" || route.name === "sequence-compare" || route.name === "version-compare";

  const projectContent = currentProjectId ? (
    <ProjectWorkspaceProvider dependencies={dependencies} projectId={currentProjectId} coordinator={coordinator}>
      {(route.name === "table" || route.name === "sequence") && <TableHeader dependencies={dependencies} projectId={route.projectId} lastSequenceId={lastSequenceId} navigate={navigate} />}
      {route.name === "project" && <ProjectPage dependencies={dependencies} projectId={route.projectId} navigate={navigate} />}
      {route.name === "contact-sheet" && <ContactSheetPage dependencies={dependencies} projectId={route.projectId} sourceId={route.sourceId} navigate={navigate} />}
      {(route.name === "table" || route.name === "sequence") && <TablePage dependencies={dependencies} projectId={route.projectId} navigate={navigate} sequenceOverlay={route.name === "sequence" ? { sequenceId: route.sequenceId, openVersionId: route.openVersionId } : undefined} />}
      <Suspense fallback={<main className="page centered-state"><div className="loading-mark" /><p>{t("status.loadingWorkspace")}</p></main>}>
        {route.name === "sequence-compare" && <SequenceComparePage dependencies={dependencies} projectId={route.projectId} leftSequenceId={route.leftSequenceId} rightSequenceId={route.rightSequenceId} navigate={navigate} />}
        {route.name === "version-compare" && <VersionComparePage dependencies={dependencies} projectId={route.projectId} leftVersionId={route.leftVersionId} rightVersionId={route.rightVersionId} navigate={navigate} />}
      </Suspense>
    </ProjectWorkspaceProvider>
  ) : (
    <HomePage dependencies={dependencies} navigate={navigate} />
  );

  return (
    <div className={`app-shell${usesTableChrome ? " is-table" : ""}`}>
      {route.name !== "table" && route.name !== "sequence" && <AppHeader dependencies={dependencies} route={route} projectId={currentProjectId} contactSourceId={contactSourceId} lastSequenceId={lastSequenceId} navigate={navigate} variant={usesTableChrome ? "table" : "default"} />}
      {projectContent}
      {recovery && <div className="draft-recovery" role="alert"><strong>{t("backup.unsavedTitle")}</strong><p>{t("backup.unsavedDetail")}</p><div><button disabled={recovering} onClick={() => setRecovery(false)}>{t("backup.keepEditing")}</button><button disabled={recovering} onClick={() => void recover(true)}>{t("backup.downloadRecovery")}</button><button disabled={recovering} onClick={() => void recover(false)}>{recovering ? t("project.preparing") : t("backup.saveRecoveryCopy")}</button></div>{recoveryError && <p>{recoveryError}</p>}</div>}
    </div>
  );
}
