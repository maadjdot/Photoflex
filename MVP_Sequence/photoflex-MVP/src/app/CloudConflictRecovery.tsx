import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ProjectId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { downloadRecoveryBackup } from "./downloadRecoveryBackup";
import { useLocale } from "./locale";

export function CloudConflictRecovery({ dependencies, projectId, beforeRecovery, onOpenCopy, onReloadCloud }: {
  readonly dependencies: AppDependencies; readonly projectId?: ProjectId;
  readonly beforeRecovery: () => Promise<boolean>;
  readonly onOpenCopy: (id: ProjectId) => void;
  readonly onReloadCloud: (id: ProjectId) => void;
}) {
  const { t } = useLocale(), save = dependencies.cloudSave;
  const subscribe = useCallback((listener: () => void) => save?.subscribe(listener) ?? (() => {}), [save]);
  const snapshot = useCallback(() => JSON.stringify(save?.getConflictProjectIds?.()
    ?? (projectId && save?.getStatus(projectId) === "conflict" ? [projectId] : [])), [projectId, save]);
  const conflicts = JSON.parse(useSyncExternalStore(subscribe, snapshot, snapshot)) as ProjectId[];
  const target = projectId && conflicts.includes(projectId) ? projectId : conflicts[0];
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [recoveryCopyId, setRecoveryCopyId] = useState<ProjectId>();
  useEffect(() => {
    let active = true; setName(""); setError(undefined);
    if (target) void dependencies.projectStore.loadWorkspace(target).then((result) => { if (active && result.ok) setName(result.value.name); });
    return () => { active = false; };
  }, [dependencies.projectStore, target]);

  const recover = async (action: "download" | "copy" | "reload") => {
    if (!target || busy || !save) return;
    setBusy(true); setError(undefined);
    try {
      if (!(await beforeRecovery())) return;
      if (action === "download") {
        const backup = await dependencies.projectStore.exportBackup(target);
        if (!backup.ok) { setError(t("cloud.conflict.failed")); return; }
        downloadRecoveryBackup(backup.value);
      } else {
        const result = action === "copy" ? await save.saveConflictCopy?.(target) : await save.resolveConflict?.(target);
        if (!result?.ok) { setError(t("cloud.conflict.failed")); return; }
        setRecoveryCopyId(result.value);
        if (action === "copy") onOpenCopy(result.value);
        // A user can keep typing while the cloud request is in flight. Keep
        // those drafts open if the final local save barrier rejects them.
        else if (await beforeRecovery()) onReloadCloud(target);
      }
    } catch { setError(t("cloud.conflict.failed")); }
    finally { setBusy(false); }
  };
  if (!save) return null;
  if (!target) return recoveryCopyId ? <div className="cloud-conflict-recovered" role="status"><span>{t("cloud.conflict.copySaved")}</span><button onClick={() => onOpenCopy(recoveryCopyId)}>{t("cloud.conflict.openCopy")}</button></div> : null;
  return <div className="cloud-conflict-recovery" role="alert">
    <strong>{t("cloud.conflict.title")}{name ? ` · ${name}` : ""}</strong>
    <p>{t("cloud.conflict.detail")}</p>
    <div className="cloud-conflict-actions">
      <button disabled={busy} onClick={() => void recover("download")}>{t("backup.downloadRecovery")}</button>
      {save.saveConflictCopy && <button disabled={busy} onClick={() => void recover("copy")}>{t("cloud.conflict.saveCopy")}</button>}
      {save.resolveConflict && <button disabled={busy} onClick={() => void recover("reload")}>{t("cloud.conflict.reload")}</button>}
    </div>
    {error && <p>{error}</p>}
  </div>;
}
