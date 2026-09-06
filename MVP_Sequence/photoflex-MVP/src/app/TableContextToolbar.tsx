import { useState, type ButtonHTMLAttributes } from "react";
import addToGroupIcon from "../assets/icons/table-add-to-group.svg";
import addToSequenceIcon from "../assets/icons/table-add-to-sequence.svg";
import alignIcon from "../assets/icons/table-align.svg";
import chevronDownIcon from "../assets/icons/table-chevron-down.svg";
import compareIcon from "../assets/icons/table-compare.svg";
import frontIcon from "../assets/icons/table-front.svg";
import gridIcon from "../assets/icons/table-grid.svg";
import groupIcon from "../assets/icons/table-group.svg";
import leaveGroupIcon from "../assets/icons/table-leave-group.svg";
import linkIcon from "../assets/icons/table-link.svg";
import previewIcon from "../assets/icons/table-preview.svg";
import redoIcon from "../assets/icons/table-redo.svg";
import removeIcon from "../assets/icons/table-remove.svg";
import rowIcon from "../assets/icons/table-row.svg";
import sequenceIcon from "../assets/icons/table-sequence.svg";
import undoIcon from "../assets/icons/table-undo.svg";
import type { PhotoId, ProjectId, SequenceId, WorktableAlignment, WorktableDraft, WorktableEditCommand } from "../contracts";
import type { TableActionState } from "./tableActionPolicy";

export interface TableContextToolbarProps {
  readonly projectName: string;
  readonly draft: WorktableDraft;
  readonly actions: TableActionState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canAddToSequence: boolean;
  readonly saving: boolean;
  readonly writeState: "idle" | "saving" | "failed";
  readonly onRetrySave: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onExecute: (command: WorktableEditCommand) => void;
  readonly onRequestSequence: (photoIds: readonly PhotoId[]) => void;
  readonly onAddToSequence: () => void;
  readonly onPreview: (photoId: PhotoId) => void;
  readonly onComparePhotos: (photoIds: readonly [PhotoId, PhotoId]) => void;
  readonly onCompareSequences: (sequenceIds: readonly [SequenceId, SequenceId]) => void;
  readonly onRemovePiles: (sequenceIds: readonly SequenceId[]) => void;
  readonly onRemovePhotos: (photoIds: readonly PhotoId[]) => void;
}

/** Table command surface. It renders policy results and emits intent only. */
export function TableContextToolbar({ projectName, draft, actions, canUndo, canRedo, canAddToSequence, saving, writeState, onRetrySave, onUndo, onRedo, onExecute, onRequestSequence, onAddToSequence, onPreview, onComparePhotos, onCompareSequences, onRemovePiles, onRemovePhotos }: TableContextToolbarProps) {
  const [alignment, setAlignment] = useState<WorktableAlignment | "">("");
  const { photoIds, pileIds, completeGroup: group, memberGroup, selectedLink } = actions;
  const arrange = (layout: WorktableEditCommand) => actions.canArrange && onExecute(layout);
  const compare = () => {
    if (actions.compareKind === "sequences") onCompareSequences([pileIds[0], pileIds[1]]);
    if (actions.compareKind === "photos") onComparePhotos([photoIds[0], photoIds[1]]);
  };
  const remove = () => pileIds.length ? onRemovePiles(pileIds) : onRemovePhotos(photoIds);

  return <div className="table-toolbar" aria-label="Table 工具栏">
    <span className="table-project-name" title={projectName}>{projectName}</span>
    <span className="table-toolbar-divider" />
    <div className="table-toolbar-group">
      <TableToolButton icon={undoIcon} label="Undo" disabled={!canUndo} onClick={onUndo} />
      <TableToolButton icon={redoIcon} label="Redo" disabled={!canRedo} onClick={onRedo} />
    </div>
    <span className="table-toolbar-divider" />
    <div className="table-toolbar-group">
      <TableToolButton icon={sequenceIcon} label="Sequence" disabled={!photoIds.length} onClick={() => onRequestSequence(photoIds)} />
      <TableToolButton icon={addToSequenceIcon} label="Add to Sequence" disabled={!canAddToSequence} onClick={onAddToSequence} />
    </div>
    <span className="table-toolbar-divider" />
    <div className="table-toolbar-group">
      <TableToolButton icon={groupIcon} label={group ? "Ungroup" : "Group"} disabled={!group && !actions.canGroup} onClick={() => group ? onExecute({ type: "remove-group", groupId: group.id }) : onExecute({ type: "create-group", photoIds })} />
      <TableToolButton icon={leaveGroupIcon} label="Leave" disabled={!memberGroup} onClick={() => memberGroup && onExecute({ type: "remove-from-group", photoId: photoIds[0] })} />
      <label className="table-tool-select"><img src={addToGroupIcon} alt="" /><select aria-label="Add to Group" value="" disabled={!actions.canJoinGroup} onChange={(event) => event.target.value && onExecute({ type: "add-to-group", groupId: event.target.value, photoId: photoIds[0] })}><option value="">Add to Group</option>{draft.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><img className="table-tool-chevron" src={chevronDownIcon} alt="" /></label>
    </div>
    <span className="table-toolbar-divider" />
    <div className="table-toolbar-group">
      <TableToolButton icon={linkIcon} label={selectedLink ? "Unlink" : "Link"} disabled={!selectedLink && !actions.canCreateLink} onClick={() => selectedLink ? onExecute({ type: "remove-link", linkId: selectedLink.id }) : onExecute({ type: "create-link", photoIds })} />
      <TableToolButton icon={compareIcon} label="Compare" title={actions.compareDisabledReason} disabled={!actions.canCompare} onClick={compare} />
    </div>
    <span className="table-toolbar-divider" />
    <div className="table-toolbar-group">
      <TableToolButton icon={previewIcon} label="Preview" disabled={!actions.canPreview} onClick={() => onPreview(photoIds[0])} />
      <TableToolButton icon={gridIcon} label="Grid" disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds, layout: { type: "grid" } })} />
      <TableToolButton icon={rowIcon} label="Row" disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds, layout: { type: "row" } })} />
      <label className="table-tool-select"><img src={alignIcon} alt="" /><select aria-label="Align selection" value={alignment} disabled={!actions.canArrange} onChange={(event) => { const edge = event.target.value as WorktableAlignment; arrange({ type: "arrange", photoIds, layout: { type: "align", edge } }); setAlignment(""); }}><option value="">Align</option><option value="left">Left</option><option value="center-x">Center</option><option value="right">Right</option><option value="top">Top</option><option value="center-y">Middle</option><option value="bottom">Bottom</option></select><img className="table-tool-chevron" src={chevronDownIcon} alt="" /></label>
    </div>
    <span className="table-toolbar-divider" />
    <div className="table-toolbar-group">
      <TableToolButton icon={frontIcon} label="Front" disabled={!actions.canBringToFront} onClick={() => pileIds.length ? onExecute({ type: "bring-sequence-piles-to-front", sequenceIds: pileIds }) : onExecute({ type: "bring-to-front", photoIds })} />
      <TableToolButton className={pileIds.length ? "is-danger" : ""} icon={removeIcon} label={pileIds.length ? pileIds.length > 1 ? "Delete Sequences…" : "Delete Sequence…" : "Remove from Table"} disabled={!actions.canRemove} onClick={remove} />
    </div>
    <span className="table-toolbar-spacer" />
    <div className="table-toolbar-status"><span>{pileIds.length ? `${pileIds.length} piles selected` : photoIds.length ? `${photoIds.length} selected` : `${draft.entryOrder.length} photos · ${draft.pileOrder.length} piles`}</span><span className={`table-save-state is-${writeState}`}>{saving ? "Saving…" : writeState === "failed" ? "Changes not saved" : "All changes saved"}</span>{writeState === "failed" && <button type="button" className="table-save-retry" onClick={onRetrySave}>Retry</button>}</div>
  </div>;
}

function TableToolButton({ icon, label, className = "", ...props }: { icon: string; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button className={`table-tool-button${className ? ` ${className}` : ""}`} {...props}><img src={icon} alt="" /><span>{label}</span></button>;
}
