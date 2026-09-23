import memoIcon from "../assets/icons/table-memo.svg";
import { TableHeaderControl } from "./TableHeaderControl";
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import addToGroupIcon from "../assets/icons/table-add-to-group.svg";
import alignIcon from "../assets/icons/table-align.svg";
import compareIcon from "../assets/icons/table-compare.svg";
import frontIcon from "../assets/icons/table-front.svg";
import gridIcon from "../assets/icons/table-grid.svg";
import groupIcon from "../assets/icons/table-group.svg";
import leaveGroupIcon from "../assets/icons/table-leave-group.svg";
import linkIcon from "../assets/icons/table-link.svg";
import lockIcon from "../assets/icons/table-lock.svg";
import previewIcon from "../assets/icons/table-preview.svg";
import redoIcon from "../assets/icons/table-redo.svg";
import removeIcon from "../assets/icons/table-remove.svg";
import rowIcon from "../assets/icons/table-row.svg";
import sequenceIcon from "../assets/icons/table-sequence.svg";
import shuffleIcon from "../assets/icons/table-swap.svg";
import undoIcon from "../assets/icons/table-undo.svg";
import type { FrameTemplateId, PhotoId, SequenceId, WorktableAlignment, WorktableDraft, WorktableEditCommand, WorktableItemId, WorktableMemo } from "../contracts";
import { FRAME_TEMPLATE_LABELS, FRAME_TEMPLATES } from "../modules/worktable/frameLayout";
import type { TableActionState } from "./tableActionPolicy";
import { useLocale } from "./locale";

interface TableFloatingToolbarProps {
  readonly storageKey?: string;
  readonly onAddMemo?: () => void;
  readonly onCreateFrame?: (template: FrameTemplateId, useFirst?: boolean) => boolean;
  readonly selectedPhotoCount?: number;
  readonly selectedMemo?: WorktableMemo;
  readonly actions: TableActionState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onExecute: (command: WorktableEditCommand) => void;
  readonly onRequestSequence?: (photoIds: readonly WorktableItemId[]) => void;
}

export function TableFloatingToolbar({ storageKey = "photoflex:table-toolbar", actions, canUndo, canRedo, onUndo, onRedo, onExecute, onAddMemo, onCreateFrame, selectedPhotoCount = 0, selectedMemo, onRequestSequence }: TableFloatingToolbarProps) {
  const { t } = useLocale();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetY: number } | undefined>(undefined);
  const [top, setTop] = useState(() => readToolbarTop(storageKey));
  const [frameOpen, setFrameOpen] = useState(false);
  const [frameAbove, setFrameAbove] = useState(false);
  const frameButtonRef = useRef<HTMLButtonElement>(null);
  const arrange = (layout: WorktableEditCommand) => actions.canArrange && onExecute(layout);
  const clampTop = (value: number) => {
    const toolbar = toolbarRef.current;
    const parent = toolbar?.parentElement;
    if (!toolbar || !parent) return Math.max(12, value);
    return Math.max(12, Math.min(Math.max(12, parent.clientHeight - toolbar.offsetHeight - 12), value));
  };
  useEffect(() => { setTop(readToolbarTop(storageKey)); }, [storageKey]);
  useEffect(() => {
    if (!frameOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!toolbarRef.current?.contains(event.target as Node)) setFrameOpen(false); };
    const closeEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setFrameOpen(false); frameButtonRef.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape, true);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape, true); };
  }, [frameOpen]);
  const toggleFrame = () => {
    if (!frameOpen) setFrameAbove((frameButtonRef.current?.getBoundingClientRect().bottom ?? 0) + 320 > window.innerHeight);
    setFrameOpen((open) => !open);
  };
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
  return <><TableHeaderControl><div className="table-history-controls" role="group" aria-label={`${t("table.undo")} / ${t("table.redo")}`}><TableToolButton icon={undoIcon} label={t("table.undo")} shortcut="Ctrl/Cmd+Z" disabled={!canUndo} onClick={onUndo} /><TableToolButton icon={redoIcon} label={t("table.redo")} shortcut="Ctrl/Cmd+Shift+Z" disabled={!canRedo} onClick={onRedo} /></div></TableHeaderControl><div ref={toolbarRef} className="table-floating-toolbar" role="group" aria-label={t("table.arrangementTools")} style={style}>
    <button type="button" className="table-floating-drag-handle" aria-label="Move toolbar vertically" title="Drag to move toolbar" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} onKeyDown={onDragKeyDown}><span aria-hidden="true" /></button>
    {onAddMemo && <TableToolButton icon={memoIcon} label={t("table.addMemo")} text={t("table.memo")} shortcut="M" onClick={onAddMemo} />}
    {onCreateFrame && <><button ref={frameButtonRef} type="button" className={`table-tool-button table-frame-tool${frameOpen ? " is-active" : ""}`} aria-label="Frame templates" aria-expanded={frameOpen} onClick={toggleFrame}><span aria-hidden="true" className="table-frame-tool-glyph">▣</span><span>Frame</span></button>{frameOpen && <div className={`table-frame-popover${frameAbove ? " is-above" : ""}`} role="dialog" aria-label="Frame templates"><header>Frame templates <small>{FRAME_TEMPLATES.length} layouts</small></header><div>{FRAME_TEMPLATES.map((id) => { const capacity = id === "square-nine-grid" ? 9 : id === "quad-grid" ? 4 : id === "triptych" ? 3 : id === "diptych" ? 2 : 1; const overflow = selectedPhotoCount > capacity; return <div className="table-frame-template-choice" key={id}><button type="button" onClick={() => { if (onCreateFrame(id)) setFrameOpen(false); }}><span className={`table-frame-mini mini-${id}`} aria-hidden="true" /><strong>{FRAME_TEMPLATE_LABELS[id]}</strong><small>{capacity} slots</small></button>{overflow && <button type="button" className="table-frame-use-first" onClick={() => { if (onCreateFrame(id, true)) setFrameOpen(false); }}>Use first {capacity} of {selectedPhotoCount}</button>}</div>; })}</div></div>}</>}
    {selectedMemo && <div className="memo-toolbar-controls"><label>Size<input type="number" aria-label="Memo font size" min={10} max={72} value={selectedMemo.fontSize} onChange={(event) => { const size = Number(event.target.value); if (size >= 10 && size <= 72) onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { fontSize: size } }); }} /></label><TableToolButton icon={linkIcon} label="Link memo to selected photos" text="Link" disabled={!actions.mutablePhotoIds.length} onClick={() => onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { photoIds: [...new Set([...selectedMemo.photoIds, ...actions.mutablePhotoIds])] } })} />{selectedMemo.photoIds.length > 0 && <button type="button" className="memo-unlink" onClick={() => onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { photoIds: [] } })}>Unlink</button>}</div>}
    <TableToolButton icon={gridIcon} label={t("table.grid")} shortcut="Y" disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds: actions.mutablePhotoIds, layout: { type: "grid" } })} />
    <TableToolButton icon={rowIcon} label={t("table.row")} shortcut="R" disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds: actions.mutablePhotoIds, layout: { type: "row" } })} />
    <TableToolButton icon={shuffleIcon} label={t("table.shuffle")} shortcut="H" disabled={!actions.canArrange} onClick={() => arrange({ type: "shuffle", photoIds: actions.photoIds })} />
    <label className={`table-floating-align${actions.canArrange ? "" : " is-disabled"}`} title={`${t("table.align")} · A / Shift+A`}><img src={alignIcon} alt="" /><span>{t("table.align")}</span><select aria-label={t("table.align")} value="" disabled={!actions.canArrange} onChange={(event) => { const edge = event.target.value as WorktableAlignment; if (edge) arrange({ type: "arrange", photoIds: actions.mutablePhotoIds, layout: { type: "align", edge } }); }}><option value="">{t("table.align")}</option><option value="left">{t("table.alignLeft")}</option><option value="center-x">{t("table.alignCenter")}</option><option value="right">{t("table.alignRight")}</option><option value="top">{t("table.alignTop")}</option><option value="center-y">{t("table.alignMiddle")}</option><option value="bottom">{t("table.alignBottom")}</option></select></label>
    <TableToolButton icon={groupIcon} label={actions.selectedGroup ? t("table.ungroupSelection") : t("table.groupSelection")} text={actions.selectedGroup ? t("table.ungroup") : t("table.group")} shortcut="G" disabled={(!actions.selectedGroup && !actions.canGroup) || actions.selectedGroupLocked} onClick={() => actions.selectedGroup ? onExecute({ type: "remove-group", groupId: actions.selectedGroup.id }) : onExecute({ type: "create-group", photoIds: actions.mutablePhotoIds })} />
    {onRequestSequence && <TableToolButton icon={sequenceIcon} label={t("table.createSequence")} text={t("table.createSequence")} shortcut="S" disabled={!actions.mutablePhotoIds.length} onClick={() => onRequestSequence(actions.mutablePhotoIds)} />}
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
  readonly onExecute: (command: WorktableEditCommand) => void;
  readonly onRequestSequence: (photoIds: readonly WorktableItemId[]) => void;
  readonly onPreview: (photoId: PhotoId) => void;
  readonly onComparePhotos: (photoIds: readonly [PhotoId, PhotoId]) => void;
  readonly onCompareSequences: (sequenceIds: readonly [SequenceId, SequenceId]) => void;
  readonly onRemovePiles: (sequenceIds: readonly SequenceId[]) => void;
}

/** Both command surfaces emit the same intents as before; the canvas owns selection. */
export function TableContextToolbar({ draft, actions, onExecute, onRequestSequence, onPreview, onComparePhotos, onCompareSequences, onRemovePiles }: TableContextToolbarProps) {
  const { t } = useLocale();
  const { photoIds, mutablePhotoIds, pileIds, memberGroup, selectedLink } = actions;
  const sourcePhotoIds = mutablePhotoIds.map((id) => draft.placements[id].photoId);
  const compare = () => {
    if (actions.compareKind === "sequences") onCompareSequences([pileIds[0], pileIds[1]]);
    if (actions.compareKind === "photos") onComparePhotos([sourcePhotoIds[0], sourcePhotoIds[1]]);
  };
  if (!photoIds.length && !pileIds.length) return null;
  if (actions.hasLockedPhoto && !mutablePhotoIds.length) return <div className="table-context-toolbar-position"><div className="table-context-toolbar" role="group" aria-label={t("table.selectionActions")}>
    <TableToolButton icon={lockIcon} label={t("table.unlock")} shortcut="K" onClick={() => onExecute({ type: "set-locked", photoIds: actions.lockedPhotoIds, locked: false })} />
    <span className="table-selection-summary">{t("common.photoCount", { count: photoIds.length })}</span>
  </div></div>;
  return <div className="table-context-toolbar-position"><div className="table-context-toolbar" role="group" aria-label={t("table.selectionActions")}>
    {mutablePhotoIds.length > 0 && <>
      {actions.canPreview && <TableToolButton icon={previewIcon} label={t("table.preview")} shortcut="P / Space" onClick={() => onPreview(sourcePhotoIds[0])} />}
      <TableToolButton icon={linkIcon} label={selectedLink ? t("table.unlink") : t("table.link")} shortcut="L" disabled={!selectedLink && !actions.canCreateLink} onClick={() => selectedLink ? onExecute({ type: "remove-link", linkId: selectedLink.id }) : onExecute({ type: "create-link", photoIds: mutablePhotoIds })} />
      <TableToolButton icon={lockIcon} label={t("table.lock")} shortcut="K" onClick={() => onExecute({ type: "set-locked", photoIds: mutablePhotoIds, locked: true })} />
    </>}
    {actions.lockedPhotoIds.length > 0 && <TableToolButton icon={lockIcon} label={t("table.unlock")} shortcut="Shift+K" onClick={() => onExecute({ type: "set-locked", photoIds: actions.lockedPhotoIds, locked: false })} />}
    <TableToolButton icon={compareIcon} label={t("table.compare")} shortcut="C" title={actions.compareDisabledReason} disabled={!actions.canCompare} onClick={compare} />
    {pileIds.length > 0 && <TableToolButton className="is-danger" icon={removeIcon} label={pileIds.length > 1 ? t("table.deleteSequences") : t("table.deleteSequence")} text={t("common.delete")} shortcut="Delete" disabled={!actions.canRemove} onClick={() => onRemovePiles(pileIds)} />}
    {mutablePhotoIds.length > 0 && <>
      {memberGroup && <TableToolButton icon={leaveGroupIcon} label={t("table.leaveGroup")} text={t("table.leaveGroup")} shortcut="Shift+G" title={t("table.removeOnlyFromGroup")} disabled={actions.memberGroupLocked} onClick={() => onExecute({ type: "remove-from-group", photoId: mutablePhotoIds[0] })} />}
      {actions.canJoinGroup && <label className="table-tool-select"><img src={addToGroupIcon} alt="" /><select aria-label={t("table.addToGroup")} value="" onChange={(event) => { if (event.target.value) onExecute({ type: "add-to-group", groupId: event.target.value, photoId: mutablePhotoIds[0] }); }}><option value="">{t("table.addToGroup")} ▾</option>{draft.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {!selectedLink && actions.matchingLinks.length > 1 && <label className="table-tool-select"><img src={linkIcon} alt="" /><select aria-label="Unlink relation" value="" onChange={(event) => { if (event.target.value) onExecute({ type: "remove-link", linkId: event.target.value }); }}><option value="">Unlink… ▾</option>{actions.matchingLinks.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.photoIds.length} photos</option>)}</select></label>}
    </>}
    <TableToolButton icon={frontIcon} label={t("table.front")} shortcut="F" disabled={!actions.canBringToFront} onClick={() => onExecute(pileIds.length ? { type: "bring-sequence-piles-to-front", sequenceIds: pileIds } : { type: "bring-to-front", photoIds: mutablePhotoIds })} />
    <span className="table-selection-summary">{pileIds.length ? t("common.sequenceCount", { count: pileIds.length }) : t("common.photoCount", { count: photoIds.length })}</span>
  </div></div>;
}

function TableToolButton({ icon, label, text = label, iconOnly = false, className = "", title, shortcut, ...props }: { icon: string; label: string; text?: string; iconOnly?: boolean; shortcut?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button type="button" className={`table-tool-button${iconOnly ? " is-icon-only" : ""}${className ? ` ${className}` : ""}`} aria-label={label} title={title ?? (shortcut ? `${label} · ${shortcut}` : iconOnly ? label : undefined)} {...props}><img src={icon} alt="" />{!iconOnly && <span>{text}</span>}</button>;
}
