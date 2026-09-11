import { useRef, useState } from "react";
import type { ProjectId, SourceGrant, SourceRecord } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { createErrorMessage, now, sourceErrorMessage, useDialogKeyboard } from "./AppPrimitives";
import { useLocale } from "./locale";

export function NewProjectDialog({
  dependencies,
  onClose,
  onCreated,
}: {
  readonly dependencies: AppDependencies;
  readonly onClose: () => void;
  readonly onCreated: (projectId: ProjectId) => void;
}) {
  const { locale, t } = useLocale();
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [expected, setExpected] = useState("");
  const [grant, setGrant] = useState<SourceGrant>();
  const [error, setError] = useState<string>();
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogKeyboard(dialogRef, onClose);

  const chooseFolder = async () => {
    setError(undefined);
    setChoosingFolder(true);
    try {
    const result = await dependencies.photoSource.chooseFolder([]);
    if (result.ok) setGrant(result.value);
    else if (result.error.kind !== "cancelled") setError(sourceErrorMessage(result.error.kind, locale));
    } finally { setChoosingFolder(false); }
  };

  const create = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("project.enterName"));
      return;
    }
    if (!grant) {
      setError(t("project.chooseFolder"));
      return;
    }
    const expectedCount = expected.trim() ? Number(expected) : null;
    if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount <= 0)) {
      setError(t("project.invalidExpectedCount"));
      return;
    }
    setBusy(true);
    const createdAt = now();
    const projectId = crypto.randomUUID() as ProjectId;
    const source: SourceRecord = {
      id: grant.sourceId,
      displayName: grant.displayName,
      createdAt,
    };
    const result = await dependencies.projectStore.createProject({
      id: projectId,
      name: trimmedName,
      memo,
      expectedPhotoCount: expectedCount,
      createdAt,
      initialSource: source,
    });
    if (result.ok) onCreated(projectId);
    else {
      setBusy(false);
      setError(createErrorMessage(result.error.kind, locale));
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>×</button>
        <header className="modal-header">
          <h2 id="new-project-title">{t("project.newProject")}</h2>
          <p>{t("project.createSubtitle")}</p>
        </header>
        <div className="modal-divider" />
        <div className="modal-fields">
          <label className="field-label"><span>{t("project.name")}</span><input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t("project.untitled")} /></label>
          <div className="field-label"><span>{t("project.photoFolder")}</span>
            <span className="folder-row"><span className="folder-value">{grant ? grant.displayName : t("project.noFolder")}</span><button className="folder-picker" type="button" disabled={choosingFolder || busy} onClick={chooseFolder}>{t("project.browseFolder")}</button></span>
          </div>
          <label className="field-label expected-field"><span>{t("project.expectedCount")}</span><input inputMode="numeric" value={expected} onChange={(event) => setExpected(event.target.value.replace(/[^0-9]/g, ""))} placeholder={t("project.expectedExample")} /></label>
          <label className="field-label"><span>{t("project.memoField")}</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder={t("project.memoExample")} rows={3} /></label>
        </div>
        {(choosingFolder || busy) && <div className="source-loading-status" role="status"><span className="loading-mark" aria-hidden="true" />{choosingFolder ? t("project.connecting") : t("project.creatingPreparing")}</div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-footer">
          <p className="modal-safe">{t("project.originalFilesNote")}</p>
          <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>{t("common.cancel")}</button><button className="button button-primary" disabled={busy || choosingFolder || !name.trim() || !grant} onClick={create}>{busy ? t("project.creating") : t("project.createProject")}</button></div>
        </footer>
      </section>
    </div>
  );
}
