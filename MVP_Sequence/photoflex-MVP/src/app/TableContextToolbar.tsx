import memoIcon from "../assets/icons/table-memo.svg";
import { TableHeaderControl } from "./TableHeaderControl";
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
import shuffleIcon from "../assets/icons/table-swap.svg";
import undoIcon from "../assets/icons/table-undo.svg";
import type { PhotoId, SequenceId, WorktableAlignment, WorktableDraft, WorktableEditCommand, WorktableItemId, WorktableMemo } from "../contracts";
import type { TableActionState } from "./tableActionPolicy";
import { useLocale } from "./locale";

interface TableFloatingToolbarProps {
  readonly storageKey?: string;
  readonly onAddMemo?: () => void;
  readonly selectedMemo?: WorktableMemo;
  readonly actions: TableActionState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onExecute: (command: WorktableEditCommand) => void;
  readonly canAddToSequence?: boolean;
  readonly onAddToSequence?: () => void;
  readonly onRequestSequence?: (photoIds: readonly WorktableItemId[]) => void;
}

export function TableFloatingToolbar({ storageKey = "photoflex:table-toolbar", actions, canUndo, canRedo, onUndo, onRedo, onExecute, onAddMemo, selectedMemo, canAddToSequence = false, onAddToSequence, onRequestSequence }: TableFloatingToolbarProps) {
  const { t } = useLocale();
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
    if (toolbarRef.current) observer.observe(toolbarRef.current);
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
  return <><TableHeaderControl><div className="table-history-controls" role="group" aria-label={`${t("table.undo")} / ${t("table.redo")}`}><TableToolButton icon={undoIcon} label={t("table.undo")} disabled={!canUndo} onClick={onUndo} /><TableToolButton icon={redoIcon} label={t("table.redo")} disabled={!canRedo} onClick={onRedo} /></div></TableHeaderControl><div ref={toolbarRef} className="table-floating-toolbar" role="group" aria-label={t("table.arrangementTools")} style={style}>
    <button type="button" className="table-floating-drag-handle" aria-label="Move toolbar vertically" title="Drag to move toolbar" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} onKeyDown={onDragKeyDown}><span aria-hidden="true" /></button>
    {onAddMemo && <TableToolButton icon={memoIcon} label={t("table.addMemo")} text={t("table.memo")} onClick={onAddMemo} />}
    {selectedMemo && <div className="memo-toolbar-controls"><label>Size<input type="number" aria-label="Memo font size" min={10} max={72} value={selectedMemo.fontSize} onChange={(event) => { const size = Number(event.target.value); if (size >= 10 && size <= 72) onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { fontSize: size } }); }} /></label><TableToolButton icon={linkIcon} label="Link memo to selected photos" text="Link" disabled={!actions.photoIds.length} onClick={() => onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { photoIds: [...new Set([...selectedMemo.photoIds, ...actions.photoIds])] } })} />{selectedMemo.photoIds.length > 0 && <button type="button" className="memo-unlink" onClick={() => onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { photoIds: [] } })}>Unlink</button>}</div>}
    <TableToolButton icon={gridIcon} label={t("table.grid")} disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds: actions.photoIds, layout: { type: "grid" } })} />
    <TableToolButton icon={rowIcon} label={t("table.row")} disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds: actions.photoIds, layout: { type: "row" } })} />
    <TableToolButton icon={shuffleIcon} label={t("table.shuffle")} disabled={!actions.canArrange} onClick={() => arrange({ type: "shuffle", photoIds: actions.photoIds })} />
    <label className={`table-floating-align${actions.canArrange ? "" : " is-disabled"}`} title={t("table.align")}><img src={alignIcon} alt="" /><span>{t("table.align")}</span><select aria-label={t("table.align")} value="" disabled={!actions.canArrange} onChange={(event) => { const edge = event.target.value as WorktableAlignment; if (edge) arrange({ type: "arrange", photoIds: actions.photoIds, layout: { type: "align", edge } }); }}><option value="">{t("table.align")}</option><option value="left">{t("table.alignLeft")}</option><option value="center-x">{t("table.alignCenter")}</option><option value="right">{t("table.alignRight")}</option><option value="top">{t("table.alignTop")}</option><option value="center-y">{t("table.alignMiddle")}</option><option value="bottom">{t("table.alignBottom")}</option></select></label>
    <TableToolButton icon={groupIcon} label={actions.selectedGroup ? t("table.ungroupSelection") : t("table.groupSelection")} text={actions.selectedGroup ? t("table.ungroup") : t("table.group")} disabled={!actions.selectedGroup && !actions.canGroup} onClick={() => actions.selectedGroup ? onExecute({ type: "remove-group", groupId: actions.selectedGroup.id }) : onExecute({ type: "create-group", photoIds: actions.photoIds })} />
    {onAddToSequence && <TableToolButton icon={addToSequenceIcon} label={t("table.addToSequence")} text={t("table.addToSequence")} disabled={!actions.photoIds.length || !canAddToSequence} onClick={onAddToSequence} />}
    {onRequestSequence && <TableToolButton icon={sequenceIcon} label={t("table.createSequence")} text={t("table.createSequence")} disabled={!actions.photoIds.length} onClick={() => onRequestSequence(actions.photoIds)} />}
  </div></>;
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
  readonly onRequestSequence: (photoIds: readonly WorktableItemId[]) => void;
  readonly onAddToSequence: () => void;
  readonly onPreview: (photoId: PhotoId) => void;
  readonly onComparePhotos: (photoIds: readonly [PhotoId, PhotoId]) => void;
  readonly onCompareSequences: (sequenceIds: readonly [SequenceId, SequenceId]) => void;
  readonly onRemovePiles: (sequenceIds: readonly SequenceId[]) => void;
  readonly onRemovePhotos: (photoIds: readonly WorktableItemId[]) => void;
}

/** Both command surfaces emit the same intents as before; the canvas owns selection. */
export function TableContextToolbar({ draft, actions, canAddToSequence, onExecute, onRequestSequence, onAddToSequence, onPreview, onComparePhotos, onCompareSequences, onRemovePiles, onRemovePhotos }: TableContextToolbarProps) {
  const { t } = useLocale();
  const { photoIds, pileIds, selectedGroup: group, memberGroup, selectedLink } = actions;
  const sourcePhotoIds = photoIds.map((id) => draft.placements[id].photoId);
  const compare = () => {
    if (actions.compareKind === "sequences") onCompareSequences([pileIds[0], pileIds[1]]);
    if (actions.compareKind === "photos") onComparePhotos([sourcePhotoIds[0], sourcePhotoIds[1]]);
  };
  if (!photoIds.length && !pileIds.length) return null;
  return <div className="table-context-toolbar-position"><div className="table-context-toolbar" role="group" aria-label={t("table.selectionActions")}>
    {photoIds.length > 0 && <>
      {actions.canPreview && <TableToolButton icon={previewIcon} label={t("table.preview")} onClick={() => onPreview(sourcePhotoIds[0])} />}
      <TableToolButton icon={groupIcon} label={group ? t("table.ungroup") : t("table.group")} disabled={!group && !actions.canGroup} onClick={() => group ? onExecute({ type: "remove-group", groupId: group.id }) : onExecute({ type: "create-group", photoIds })} />
      <TableToolButton icon={linkIcon} label={selectedLink ? t("table.unlink") : t("table.link")} disabled={!selectedLink && !actions.canCreateLink} onClick={() => selectedLink ? onExecute({ type: "remove-link", linkId: selectedLink.id }) : onExecute({ type: "create-link", photoIds })} />
    </>}
    <TableToolButton icon={compareIcon} label={t("table.compare")} title={actions.compareDisabledReason} disabled={!actions.canCompare} onClick={compare} />
    <TableToolButton className={pileIds.length ? "is-danger" : ""} icon={removeIcon} label={pileIds.length ? pileIds.length > 1 ? t("table.deleteSequences") : t("table.deleteSequence") : t("table.remove")} text={pileIds.length ? t("common.delete") : t("table.remove")} disabled={!actions.canRemove} onClick={() => pileIds.length ? onRemovePiles(pileIds) : onRemovePhotos(photoIds)} />
    {photoIds.length > 0 && <>
      {memberGroup && <TableToolButton icon={leaveGroupIcon} label={t("table.leaveGroup")} text={t("table.leaveGroup")} title={t("table.removeOnlyFromGroup")} onClick={() => onExecute({ type: "remove-from-group", photoId: photoIds[0] })} />}
      {actions.canJoinGroup && <label className="table-tool-select"><img src={addToGroupIcon} alt="" /><select aria-label={t("table.addToGroup")} value="" onChange={(event) => { if (event.target.value) onExecute({ type: "add-to-group", groupId: event.target.value, photoId: photoIds[0] }); }}><option value="">{t("table.addToGroup")} ▾</option>{draft.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {!selectedLink && actions.matchingLinks.length > 1 && <label className="table-tool-select"><img src={linkIcon} alt="" /><select aria-label="Unlink relation" value="" onChange={(event) => { if (event.target.value) onExecute({ type: "remove-link", linkId: event.target.value }); }}><option value="">Unlink… ▾</option>{actions.matchingLinks.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.photoIds.length} photos</option>)}</select></label>}
    </>}
    <TableToolButton icon={frontIcon} label={t("table.front")} disabled={!actions.canBringToFront} onClick={() => onExecute(pileIds.length ? { type: "bring-sequence-piles-to-front", sequenceIds: pileIds } : { type: "bring-to-front", photoIds })} />
    <span className="table-selection-summary">{pileIds.length ? t("common.sequenceCount", { count: pileIds.length }) : t("common.photoCount", { count: photoIds.length })}</span>
  </div></div>;
}

function TableToolButton({ icon, label, text = label, iconOnly = false, className = "", title, ...props }: { icon: string; label: string; text?: string; iconOnly?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button type="button" className={`table-tool-button${iconOnly ? " is-icon-only" : ""}${className ? ` ${className}` : ""}`} aria-label={label} title={title ?? (iconOnly ? label : undefined)} {...props}><img src={icon} alt="" />{!iconOnly && <span>{text}</span>}</button>;
}
