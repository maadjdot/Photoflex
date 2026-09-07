import { useEffect, useRef, useState } from "react";
import shortcutsIcon from "../assets/icons/table-shortcuts.svg";
import type { ProjectId, SequenceId } from "../contracts";
import { AppHeader } from "./AppHeader";
import { useDialogKeyboard } from "./AppPrimitives";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { useProjectWorkspaceSession } from "./useProjectWorkspace";

export function TableHeader({ dependencies, projectId, lastSequenceId, navigate }: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly lastSequenceId?: SequenceId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { workspace, coordinator, loading } = useProjectWorkspaceSession(dependencies, projectId);
  const { saving, writeState } = coordinator.getSnapshot();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  return <>
    <AppHeader dependencies={dependencies} route={{ name: "table", projectId }} projectId={projectId} lastSequenceId={lastSequenceId} navigate={navigate} variant="table" projectLabel={workspace?.name ?? "Loading…"} actions={
      <div className="table-header-actions">
        <button type="button" className="table-shortcuts-button" onClick={() => setShortcutsOpen(true)}><img src={shortcutsIcon} alt="" />Shortcuts</button>
        <span className={`table-header-save is-${writeState}`} role="status"><span aria-hidden="true" />{loading ? "Loading…" : saving ? "Saving…" : writeState === "failed" ? "Changes not saved" : "All changes saved"}</span>
        {writeState === "failed" && <button type="button" className="table-save-retry" onClick={() => void coordinator.retry({ kind: "workspace" })}>Retry</button>}
      </div>
    } />
    {shortcutsOpen && <TableShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
  </>;
}

function TableShortcutsDialog({ onClose }: { readonly onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useDialogKeyboard(ref, onClose);
  useEffect(() => { ref.current?.querySelector("button")?.focus(); }, []);
  return <div className="table-shortcuts-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} className="table-shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="table-shortcuts-title">
      <header><h2 id="table-shortcuts-title">Table shortcuts</h2><button type="button" aria-label="Close shortcuts" onClick={onClose}>×</button></header>
      <p>With the canvas focused</p>
      <dl>
        <div><dt>Pan canvas</dt><dd>Right-drag or scroll</dd></div>
        <div><dt>Zoom canvas</dt><dd>Ctrl / ⌘ + scroll</dd></div>
        <div><dt>Select multiple</dt><dd>Shift / Ctrl / ⌘ + click</dd></div>
        <div><dt>Select all photos</dt><dd>Ctrl / ⌘ + A</dd></div>
        <div><dt>Undo</dt><dd>Ctrl / ⌘ + Z</dd></div>
        <div><dt>Redo</dt><dd>Ctrl / ⌘ + Shift + Z</dd></div>
        <div><dt>Group / Ungroup</dt><dd>G / Shift + G</dd></div>
        <div><dt>Link / Unlink</dt><dd>L / Shift + L</dd></div>
        <div><dt>Create Sequence</dt><dd>S</dd></div>
        <div><dt>Remove selection</dt><dd>Delete / Backspace</dd></div>
        <div><dt>Clear selection</dt><dd>Esc</dd></div>
        <div><dt>Preview photo / open pile</dt><dd>Double-click</dd></div>
      </dl>
    </section>
  </div>;
}
