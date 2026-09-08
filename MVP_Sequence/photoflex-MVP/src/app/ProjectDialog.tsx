import { useRef, useState } from "react";
import type { ProjectId, SourceGrant, SourceRecord } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { createErrorMessage, now, sourceErrorMessage, useDialogKeyboard } from "./AppPrimitives";

export function NewProjectDialog({
  dependencies,
  onClose,
  onCreated,
}: {
  readonly dependencies: AppDependencies;
  readonly onClose: () => void;
  readonly onCreated: (projectId: ProjectId) => void;
}) {
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
    else if (result.error.kind !== "cancelled") setError(sourceErrorMessage(result.error.kind));
    } finally { setChoosingFolder(false); }
  };

  const create = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a project name");
      return;
    }
    if (!grant) {
      setError("Choose a photo folder");
      return;
    }
    const expectedCount = expected.trim() ? Number(expected) : null;
    if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount <= 0)) {
      setError("Expected photo count must be a positive integer");
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
      setError(createErrorMessage(result.error.kind));
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        <header className="modal-header">
          <h2 id="new-project-title">New Project</h2>
          <p>创建新的摄影项目</p>
        </header>
        <div className="modal-divider" />
        <div className="modal-fields">
          <label className="field-label"><span>Project name <small>项目名称</small></span><input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Untitled project" /></label>
          <div className="field-label"><span>Photo folder <small>项目照片资料夹</small></span>
            <span className="folder-row"><span className="folder-value">{grant ? grant.displayName : "No folder selected"}</span><button className="folder-picker" type="button" disabled={choosingFolder || busy} onClick={chooseFolder}>Browse folder</button></span>
          </div>
          <label className="field-label expected-field"><span>Expected photo count <small>预期照片张数</small></span><input inputMode="numeric" value={expected} onChange={(event) => setExpected(event.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 60" /></label>
          <label className="field-label"><span>Project memo <small>项目 Memo</small></span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Shooting theme, inspirations, destinations, etc." rows={3} /></label>
        </div>
        {(choosingFolder || busy) && <div className="source-loading-status" role="status"><span className="loading-mark" aria-hidden="true" />{choosingFolder ? "Connecting photo folder…" : "Creating project and preparing photos…"}</div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-footer">
          <p className="modal-safe">Original files will never be moved or modified. <span>原片不会被移动或修改。</span></p>
          <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || choosingFolder || !name.trim() || !grant} onClick={create}>{busy ? "Creating…" : "Create project"}</button></div>
        </footer>
      </section>
    </div>
  );
}
