import { useRef, useState } from "react";
import type { ProjectId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { useProjectWorkspaceSession } from "./useProjectWorkspace";
import { useLocale } from "./locale";

export function downloadBackup(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[<>:"/\\|?*]/g, "-")}.photoflex.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportBackupButton({ dependencies, onRestored }: { dependencies: AppDependencies; onRestored: (projectId: ProjectId) => void }) {
  const { locale, t } = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const restore = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await dependencies.projectStore.importBackup(new Uint8Array(await file.arrayBuffer()));
      if (result.ok) onRestored(result.value);
      else setError(result.error.kind === "invalid-backup" ? result.error.reason : result.error.kind === "unsupported-schema" ? (locale === "zh-CN" ? "不支持此备份版本。" : "This backup version is not supported.") : (locale === "zh-CN" ? "无法恢复备份，请检查可用存储空间后重试。" : "The backup could not be restored. Check available storage and try again."));
    } catch { setError(locale === "zh-CN" ? "无法读取备份文件。" : "The backup file could not be read."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return <div className="backup-import"><button className="button button-secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? t("project.restoring") : t("project.restoreBackup")}</button><input ref={input} type="file" accept=".json,application/json" aria-label={t("project.backupFile")} hidden onChange={(event) => void restore(event.target.files?.[0])} />{error && <p role="alert">{error}</p>}</div>;
}

export function ProjectBackupControls({ dependencies, projectId, name }: { dependencies: AppDependencies; projectId: ProjectId; name: string }) {
  const { t } = useLocale();
  const { coordinator } = useProjectWorkspaceSession(dependencies, projectId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const exportProject = async () => {
    setBusy(true);
    try {
      await coordinator.flushAll();
      const result = await coordinator.exportRecoveryBackup();
      if (result.ok) { downloadBackup(result.value, name); setMessage(t("project.backupStarted")); }
      else setMessage(t("project.backupFailed"));
    } finally { setBusy(false); }
  };
  return <section className="project-backup-controls" aria-label={t("project.backup")}><div><strong>{t("project.backup")}</strong><p>{t("project.backupDescription")}</p></div><button className="button button-secondary" disabled={busy} onClick={() => void exportProject()}>{busy ? t("project.preparing") : t("project.exportBackup")}</button>{message && <p role="status">{message}</p>}</section>;
}
