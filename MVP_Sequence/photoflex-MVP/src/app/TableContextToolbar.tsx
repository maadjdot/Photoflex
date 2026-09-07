import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import addToGroupIcon from "../assets/icons/table-add-to-group.svg";
import addToSequenceIcon from "../assets/icons/table-add-to-sequence.svg";
import alignIcon from "../assets/icons/table-align.svg";
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
import type { PhotoId, SequenceId, WorktableAlignment, WorktableDraft, WorktableEditCommand } from "../contracts";
import type { TableActionState } from "./tableActionPolicy";

interface TableFloatingToolbarProps {
  readonly storageKey?: string;
  readonly actions: TableActionState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onExecute: (command: WorktableEditCommand) => void;
}

export function TableFloatingToolbar({ storageKey = "photoflex:table-toolbar", actions, canUndo, canRedo, onUndo, onRedo, onExecute }: TableFloatingToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetY: number } | undefined>(undefined);
  const [top, setTop] = useState(() => readToolbarTop(storageKey));
  const arrange = (layout: WorktableEditCommand) => actions.canArrange && onExecute(layout);
  const clampTop = (value: number) => {
    const toolbar = toolbarRef.current;
    const parent = toolbar?.parentElement;
    if (!toolbar || !parent) return Math.max(12, value);
    return Math.max(12, Math.min(Math.max(12, parent.clientHeight - toolbar.offsetHeight - 12), value));
  };
  useEffect(() => { setTop(readToolbarTop(storageKey)); }, [storageKey]);
  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey, String(Math.round(top))); } catch { /* Position is disposable UI state. */ }
  }, [storageKey, top]);
  useLayoutEffect(() => {
    const parent = toolbarRef.current?.parentElement;
    if (!parent) return;
    const keepInCanvas = () => setTop((value) => clampTop(value));
    keepInCanvas();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(keepInCanvas);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const onDragStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const rect = toolbarRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { pointerId: event.pointerId, offsetY: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const parent = toolbarRef.current?.parentElement;
    if (!drag || drag.pointerId !== event.pointerId || !parent) return;
    setTop(clampTop(event.clientY - parent.getBoundingClientRect().top - drag.offsetY));
  };
  const onDragEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
  };
  const onDragKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 32 : 8;
    if (event.key === "ArrowUp") { event.preventDefault(); setTop((value) => clampTop(value - step)); }
    if (event.key === "ArrowDown") { event.preventDefault(); setTop((value) => clampTop(value + step)); }
    if (event.key === "Home") { event.preventDefault(); setTop(12); }
    if (event.key === "End") { event.preventDefault(); setTop(Number.MAX_SAFE_INTEGER); }
  };
  const style = { top: `${top}px` } as CSSProperties;
  return <div ref={toolbarRef} className="table-floating-toolbar" role="group" aria-label="Table arrangement tools" style={style}>
    <button type="button" className="table-floating-drag-handle" aria-label="Move toolbar vertically" title="Drag to move toolbar" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} onKeyDown={onDragKeyDown}><span aria-hidden="true" /></button>
    <TableToolButton iconOnly icon={undoIcon} label="Undo" disabled={!canUndo} onClick={onUndo} />
    <TableToolButton iconOnly icon={redoIcon} label="Redo" disabled={!canRedo} onClick={onRedo} />
    <span className="table-floating-divider" />
    <TableToolButton iconOnly icon={gridIcon} label="Grid" disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds: actions.photoIds, layout: { type: "grid" } })} />
    <TableToolButton iconOnly icon={rowIcon} label="Row" disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds: actions.photoIds, layout: { type: "row" } })} />
    <label className={`table-floating-align${actions.canArrange ? "" : " is-disabled"}`} title="Align selection"><img src={alignIcon} alt="" /><select aria-label="Align selection" value="" disabled={!actions.canArrange} onChange={(event) => { const edge = event.target.value as WorktableAlignment; if (edge) arrange({ type: "arrange", photoIds: actions.photoIds, layout: { type: "align", edge } }); }}><option value="">Align</option><option value="left">Left</option><option value="center-x">Center</option><option value="right">Right</option><option value="top">Top</option><option value="center-y">Middle</option><option value="bottom">Bottom</option></select></label>
  </div>;
}

function readToolbarTop(storageKey: string): number {
  try {
    const stored = Number(window.sessionStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored >= 12 ? stored : 240;
  } catch { return 240; }
}

export interface TableContextToolbarProps {
  readonly draft: WorktableDraft;
  readonly actions: TableActionState;
  readonly canAddToSequence: boolean;
  readonly onExecute: (command: WorktableEditCommand) => void;
  readonly onRequestSequence: (photoIds: readonly PhotoId[]) => void;
  readonly onAddToSequence: () => void;
  readonly onPreview: (photoId: PhotoId) => void;
  readonly onComparePhotos: (photoIds: readonly [PhotoId, PhotoId]) => void;
  readonly onCompareSequences: (sequenceIds: readonly [SequenceId, SequenceId]) => void;
  readonly onRemovePiles: (sequenceIds: readonly SequenceId[]) => void;
  readonly onRemovePhotos: (photoIds: readonly PhotoId[]) => void;
  readonly onClearSelection: () => void;
}

/** Both command surfaces emit the same intents as before; the canvas owns selection. */
export function TableContextToolbar({ draft, actions, canAddToSequence, onExecute, onRequestSequence, onAddToSequence, onPreview, onComparePhotos, onCompareSequences, onRemovePiles, onRemovePhotos, onClearSelection }: TableContextToolbarProps) {
  const { photoIds, pileIds, selectedGroup: group, memberGroup, selectedLink } = actions;
  const compare = () => {
    if (actions.compareKind === "sequences") onCompareSequences([pileIds[0], pileIds[1]]);
    if (actions.compareKind === "photos") onComparePhotos([photoIds[0], photoIds[1]]);
  };
  if (!photoIds.length && !pileIds.length) return null;
  return <div className="table-context-toolbar-position"><div className="table-context-toolbar" role="group" aria-label="Table selection actions">
    {photoIds.length > 0 && <>
      {actions.canPreview && <TableToolButton icon={previewIcon} label="Preview" onClick={() => onPreview(photoIds[0])} />}
      <TableToolButton icon={groupIcon} label={group ? "Ungroup" : "Group"} title={group ? `Ungroup ${group.name} · ${group.photoIds.length} photos` : "Select two or more ungrouped photos"} disabled={!group && !actions.canGroup} onClick={() => group ? onExecute({ type: "remove-group", groupId: group.id }) : onExecute({ type: "create-group", photoIds })} />
      <TableToolButton icon={linkIcon} label={selectedLink ? "Unlink" : "Link"} title={selectedLink ? `Unlink ${selectedLink.name} · ${selectedLink.photoIds.length} photos` : "Select 2–6 photos to link"} disabled={!selectedLink && !actions.canCreateLink} onClick={() => selectedLink ? onExecute({ type: "remove-link", linkId: selectedLink.id }) : onExecute({ type: "create-link", photoIds })} />
    </>}
    <TableToolButton icon={compareIcon} label="Compare" title={actions.compareDisabledReason} disabled={!actions.canCompare} onClick={compare} />
    {photoIds.length > 0 && <>
      <TableToolButton icon={addToSequenceIcon} label="Add to Sequence" disabled={!canAddToSequence} onClick={onAddToSequence} />
      <TableToolButton icon={sequenceIcon} label="Create Sequence" onClick={() => onRequestSequence(photoIds)} />
    </>}
    <TableToolButton className={pileIds.length ? "is-danger" : ""} icon={removeIcon} label={pileIds.length ? pileIds.length > 1 ? "Delete Sequences…" : "Delete Sequence…" : "Remove from Table"} disabled={!actions.canRemove} onClick={() => pileIds.length ? onRemovePiles(pileIds) : onRemovePhotos(photoIds)} />
    {photoIds.length > 0 && <>
      {memberGroup && <TableToolButton icon={leaveGroupIcon} label="Leave Group" title="Remove only this photo from its group" onClick={() => onExecute({ type: "remove-from-group", photoId: photoIds[0] })} />}
      {actions.canJoinGroup && <label className="table-tool-select"><img src={addToGroupIcon} alt="" /><select aria-label="Add to Group" value="" onChange={(event) => { if (event.target.value) onExecute({ type: "add-to-group", groupId: event.target.value, photoId: photoIds[0] }); }}><option value="">Add to Group ▾</option>{draft.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {!selectedLink && actions.matchingLinks.length > 1 && <label className="table-tool-select"><img src={linkIcon} alt="" /><select aria-label="Unlink relation" value="" onChange={(event) => { if (event.target.value) onExecute({ type: "remove-link", linkId: event.target.value }); }}><option value="">Unlink… ▾</option>{actions.matchingLinks.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.photoIds.length} photos</option>)}</select></label>}
    </>}
    <TableToolButton icon={frontIcon} label="Front" disabled={!actions.canBringToFront} onClick={() => onExecute(pileIds.length ? { type: "bring-sequence-piles-to-front", sequenceIds: pileIds } : { type: "bring-to-front", photoIds })} />
    <span className="table-selection-summary">{pileIds.length ? `${pileIds.length} piles selected` : `${photoIds.length} selected`}</span>
    <button type="button" className="table-clear-selection" onClick={onClearSelection}>Clear</button>
  </div></div>;
}

function TableToolButton({ icon, label, iconOnly = false, className = "", title, ...props }: { icon: string; label: string; iconOnly?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button type="button" className={`table-tool-button${iconOnly ? " is-icon-only" : ""}${className ? ` ${className}` : ""}`} aria-label={label} title={title ?? (iconOnly ? label : undefined)} {...props}><img src={icon} alt="" />{!iconOnly && <span>{label}</span>}</button>;
}
