import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type Ref } from "react";
import addToGroupIcon from "../assets/icons/table-add-to-group.svg";
import compareIcon from "../assets/icons/table-compare.svg";
import frontIcon from "../assets/icons/table-front.svg";
import leaveGroupIcon from "../assets/icons/table-leave-group.svg";
import linkIcon from "../assets/icons/table-link.svg";
import lockIcon from "../assets/icons/table-lock.svg";
import previewIcon from "../assets/icons/table-preview.svg";
import removeIcon from "../assets/icons/table-remove.svg";
import sequenceIcon from "../assets/icons/table-sequence.svg";
import type { FrameTemplateFamily, FrameTemplateId, PhotoId, SequenceId, WorktableAlignment, WorktableDraft, WorktableEditCommand, WorktableItemId, WorktableMemo } from "../contracts";
import { FRAME_FAMILIES, FRAME_TEMPLATE_LABELS, frameCapacity, frameTemplateNote } from "../modules/worktable/frameLayout";
import { FrameTemplatePreview } from "./FrameTemplatePreview";
import { TableHeaderControl } from "./TableHeaderControl";
import { TableToolbarIcon, type TableToolbarIconName } from "./TableToolbarIcon";
import type { TableActionState } from "./tableActionPolicy";
import { useLocale } from "./locale";

interface TableFloatingToolbarProps {
  readonly connectorToolActive?: boolean;
  readonly onToggleConnectorTool?: () => void;
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
}

export function TableFloatingToolbar({ connectorToolActive, onToggleConnectorTool, storageKey = "photoflex:table-toolbar", actions, canUndo, canRedo, onUndo, onRedo, onExecute, onAddMemo, onCreateFrame, selectedPhotoCount = 0, selectedMemo }: TableFloatingToolbarProps) {
  const { t } = useLocale();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => readToolbarVisible(storageKey));
  const [frameOpen, setFrameOpen] = useState(false);
  const [frameAbove, setFrameAbove] = useState(false);
  const [frameCategory, setFrameCategory] = useState<FrameTemplateFamily>();
  const frameButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setVisible(readToolbarVisible(storageKey)); setFrameOpen(false); }, [storageKey]);
  useEffect(() => {
    if (!frameOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!frameButtonRef.current?.contains(target) && !toolbarRef.current?.querySelector(".table-frame-popover")?.contains(target)) setFrameOpen(false);
    };
    const closeEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setFrameOpen(false); frameButtonRef.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape, true);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape, true); };
  }, [frameOpen]);
  const toggleFrame = () => {
    if (!frameOpen) { setFrameCategory(undefined); setFrameAbove((frameButtonRef.current?.getBoundingClientRect().bottom ?? 0) + 410 > window.innerHeight); }
    setFrameOpen((open) => !open);
  };
  useEffect(() => {
    try { window.sessionStorage.setItem(`${storageKey}:visible`, String(visible)); } catch { /* Visibility is disposable UI state. */ }
  }, [storageKey, visible]);
  return <><TableHeaderControl targetId="table-header-toolbar-toggle"><TableRailButton icon={visible ? "hide" : "show"} label={t(visible ? "table.hideTools" : "table.showTools")} aria-expanded={visible} className="table-rail-toggle" tooltipBelow onClick={() => { setFrameOpen(false); setVisible((value) => !value); }} /></TableHeaderControl>
  {visible && <div ref={toolbarRef} className="table-tools-rail"><div className="table-rail-creation" role="group" aria-label={t("table.creationTools")}>
    {onAddMemo && <TableRailButton icon="memo" label={t("table.addMemo")} tooltip={t("table.memo")} shortcut="M" active={Boolean(selectedMemo)} onClick={() => { setFrameOpen(false); onAddMemo(); }} />}
    {onToggleConnectorTool && <TableRailButton icon="link" label={t("table.drawLine")} tooltip={t("table.link")} shortcut="L" active={connectorToolActive} onClick={() => { setFrameOpen(false); onToggleConnectorTool(); }} />}
    {onCreateFrame && <div className="table-rail-frame"><TableRailButton ref={frameButtonRef} icon="frame" label="Frame templates" tooltip={t("table.frame")} active={frameOpen} aria-expanded={frameOpen} aria-haspopup="dialog" onClick={toggleFrame} />{frameOpen && <div className={`table-frame-popover${frameAbove ? " is-above" : ""}`} role="dialog" aria-label="Frame templates">
      <header>{frameCategory ? <button type="button" className="table-frame-back" aria-label="Back to template families" onClick={() => setFrameCategory(undefined)}>‹ Templates</button> : <span>Frame templates</span>}<small>{frameCategory ? FRAME_FAMILIES.find((family) => family.id === frameCategory)?.label : `${FRAME_FAMILIES.length} families`}</small></header>
      {!frameCategory ? <nav className="table-frame-family-menu" aria-label="Template families">{FRAME_FAMILIES.map((family) => <button key={family.id} type="button" onClick={() => setFrameCategory(family.id)}><FrameTemplatePreview id={family.templateIds[0]} /><span><strong>{family.label}</strong><small>{family.description}</small></span><span aria-hidden="true">›</span></button>)}</nav>
        : <div className="table-frame-template-choices">{FRAME_FAMILIES.find((family) => family.id === frameCategory)!.templateIds.map((id) => { const capacity = frameCapacity(id); const overflow = selectedPhotoCount > capacity; return <div className="table-frame-template-choice" key={id}><button type="button" onClick={() => { if (onCreateFrame(id)) setFrameOpen(false); }}><FrameTemplatePreview id={id} /><strong>{FRAME_TEMPLATE_LABELS[id]}</strong><small>{frameTemplateNote(id)}</small></button>{overflow && <button type="button" className="table-frame-use-first" onClick={() => { if (onCreateFrame(id, true)) setFrameOpen(false); }}>Use first {capacity} of {selectedPhotoCount}</button>}</div>; })}</div>}
    </div>}</div>}

    {selectedMemo && <div className="memo-toolbar-controls"><label>Size<input type="number" aria-label="Memo font size" min={10} max={72} value={selectedMemo.fontSize} onChange={(event) => { const size = Number(event.target.value); if (size >= 10 && size <= 72) onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { fontSize: size } }); }} /></label><TableToolButton icon={linkIcon} label="Link memo to selected photos" text="Link" disabled={!actions.mutablePhotoIds.length} onClick={() => onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { photoIds: [...new Set([...selectedMemo.photoIds, ...actions.mutablePhotoIds])] } })} />{selectedMemo.photoIds.length > 0 && <button type="button" className="memo-unlink" onClick={() => onExecute({ type: "update-memo", memoId: selectedMemo.id, changes: { photoIds: [] } })}>Unlink</button>}</div>}
  </div>
    <TableArrangementTools actions={actions} onExecute={onExecute} />
    <div className="table-history-controls" role="group" aria-label={`${t("table.undo")} / ${t("table.redo")}`}>
      <TableRailButton icon="undo" label={t("table.undo")} shortcut="Ctrl/Cmd+Z" disabled={!canUndo} onClick={onUndo} />
      <TableRailButton icon="redo" label={t("table.redo")} shortcut="Ctrl/Cmd+Shift+Z" disabled={!canRedo} onClick={onRedo} />
    </div>
  </div>}</>;
}

function TableArrangementTools({ actions, onExecute }: { readonly actions: TableActionState; readonly onExecute: (command: WorktableEditCommand) => void }) {
  const { t } = useLocale();
  const [gridOpen, setGridOpen] = useState(false);
  const [gridColumns, setGridColumns] = useState(2);
  const [activeArrangement, setActiveArrangement] = useState<TableToolbarIconName>();
  const alignTooltipId = useId();
  const gridButtonRef = useRef<HTMLButtonElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const selectedPhotoCount = actions.mutablePhotoIds.length;
  const arrange = (command: WorktableEditCommand, tool: TableToolbarIconName) => {
    if (!actions.canArrange) return;
    setActiveArrangement(tool);
    onExecute(command);
  };
  useEffect(() => {
    if (!gridOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!toolsRef.current?.contains(event.target as Node)) setGridOpen(false); };
    const closeEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setGridOpen(false); gridButtonRef.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape, true);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape, true); };
  }, [gridOpen]);
  useEffect(() => { setGridOpen(false); }, [selectedPhotoCount]);
  const toggleGrid = () => {
    setGridColumns(Math.min(selectedPhotoCount, Math.ceil(Math.sqrt(selectedPhotoCount))));
    setGridOpen((open) => !open);
  };
  const applyGrid = (columns: number) => {
    if (!Number.isInteger(columns) || columns < 1 || columns > selectedPhotoCount || !actions.canArrange) return;
    arrange({ type: "arrange", photoIds: actions.mutablePhotoIds, layout: { type: "grid", columns } }, "grid");
    setGridOpen(false);
  };
  return <div ref={toolsRef} className="table-arrangement-tools" role="group" aria-label={t("table.arrangementTools")}>
    <TableRailButton ref={gridButtonRef} icon="grid" label={t("table.grid")} shortcut="Y" active={actions.canArrange && (gridOpen || activeArrangement === "grid")} aria-expanded={gridOpen} aria-haspopup="dialog" disabled={!actions.canArrange} onClick={toggleGrid} />
    {gridOpen && <div className="table-grid-popover" role="dialog" aria-label={t("table.gridSettings")}><header>{t("table.gridSettings")}<small>{t("common.photoCount", { count: selectedPhotoCount })}</small></header><div className="table-grid-choices">{Array.from({ length: Math.min(4, selectedPhotoCount) }, (_, index) => index + 1).map((columns) => <button key={columns} type="button" onClick={() => applyGrid(columns)} aria-label={t("table.gridColumns", { count: columns })}><span className="table-grid-mini" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }} aria-hidden="true">{Array.from({ length: columns }, (_, index) => <i key={index} />)}</span><strong>{columns}</strong></button>)}</div><form onSubmit={(event) => { event.preventDefault(); applyGrid(gridColumns); }}><label>{t("table.photosPerRow")}<input type="number" min={1} max={selectedPhotoCount} step={1} value={gridColumns} onChange={(event) => setGridColumns(Number(event.target.value))} /></label><button type="submit" disabled={!Number.isInteger(gridColumns) || gridColumns < 1 || gridColumns > selectedPhotoCount}>{t("table.applyGrid")}</button></form></div>}
    <TableRailButton icon="row" label={t("table.row")} shortcut="R" active={actions.canArrange && !gridOpen && activeArrangement === "row"} disabled={!actions.canArrange} onClick={() => arrange({ type: "arrange", photoIds: actions.mutablePhotoIds, layout: { type: "row" } }, "row")} />
    <TableRailButton icon="shuffle" label={t("table.shuffle")} shortcut="H" active={actions.canArrange && !gridOpen && activeArrangement === "shuffle"} disabled={!actions.canArrange} onClick={() => arrange({ type: "shuffle", photoIds: actions.photoIds }, "shuffle")} />
    <div className="table-rail-tool"><label className={`table-rail-button table-rail-select${actions.canArrange ? "" : " is-disabled"}${actions.canArrange && !gridOpen && activeArrangement === "align" ? " is-active" : ""}`}><TableToolbarIcon name="align" /><select aria-label={t("table.align")} aria-describedby={alignTooltipId} value="" disabled={!actions.canArrange} onChange={(event) => { const edge = event.target.value as WorktableAlignment; if (edge) arrange({ type: "arrange", photoIds: actions.mutablePhotoIds, layout: { type: "align", edge } }, "align"); }}><option value="">{t("table.align")}</option><option value="left">{t("table.alignLeft")}</option><option value="center-x">{t("table.alignCenter")}</option><option value="right">{t("table.alignRight")}</option><option value="top">{t("table.alignTop")}</option><option value="center-y">{t("table.alignMiddle")}</option><option value="bottom">{t("table.alignBottom")}</option></select></label><TableRailTooltip id={alignTooltipId} label={t("table.align")} shortcut="A / Shift+A" /></div>
    <TableRailButton icon="group" label={actions.selectedGroup ? t("table.ungroupSelection") : t("table.groupSelection")} tooltip={actions.selectedGroup ? t("table.ungroup") : t("table.group")} shortcut="G" active={Boolean(actions.selectedGroup)} disabled={(!actions.selectedGroup && !actions.canGroup) || actions.selectedGroupLocked} onClick={() => { setActiveArrangement(undefined); actions.selectedGroup ? onExecute({ type: "remove-group", groupId: actions.selectedGroup.id }) : onExecute({ type: "create-group", photoIds: actions.mutablePhotoIds }); }} />
  </div>;
}

function readToolbarVisible(storageKey: string): boolean {
  try { return window.sessionStorage.getItem(`${storageKey}:visible`) !== "false"; } catch { return true; }
}

function TableRailButton({ icon, label, tooltip = label, shortcut, active, tooltipBelow, className = "", ref, ...props }: {
  readonly icon: TableToolbarIconName;
  readonly label: string;
  readonly tooltip?: string;
  readonly shortcut?: string;
  readonly active?: boolean;
  readonly tooltipBelow?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const tooltipId = useId();
  return <div className={`table-rail-tool${tooltipBelow ? " is-tooltip-below" : ""}${className ? ` ${className}` : ""}`}><button ref={ref} type="button" className={`table-rail-button${active ? " is-active" : ""}`} aria-label={label} aria-describedby={tooltipId} aria-pressed={active} {...props}><TableToolbarIcon name={icon} /></button><TableRailTooltip id={tooltipId} label={tooltip} shortcut={shortcut} /></div>;
}

function TableRailTooltip({ id, label, shortcut }: { readonly id: string; readonly label: string; readonly shortcut?: string }) {
  return <span id={id} className="table-rail-tooltip" role="tooltip">{label}{shortcut && <kbd>{shortcut}</kbd>}</span>;
}

export interface TableContextToolbarProps {
  readonly selectedConnectorId?: string;
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
export function TableContextToolbar({ selectedConnectorId, draft, actions, onExecute, onRequestSequence, onPreview, onComparePhotos, onCompareSequences, onRemovePiles }: TableContextToolbarProps) {
  const { t } = useLocale();
  const { photoIds, mutablePhotoIds, pileIds, memberGroup, selectedLink } = actions;
  const sourcePhotoIds = mutablePhotoIds.map((id) => draft.placements[id].photoId);
  const compare = () => {
    if (actions.compareKind === "sequences") onCompareSequences([pileIds[0], pileIds[1]]);
    if (actions.compareKind === "photos") onComparePhotos([sourcePhotoIds[0], sourcePhotoIds[1]]);
  };
  if (selectedConnectorId) return <div className="table-context-toolbar-position"><div className="table-context-toolbar" role="group" aria-label={t("table.selectionActions")}>
    <TableToolButton icon={removeIcon} label={t("table.unlink")} shortcut="Delete" onClick={() => onExecute({ type: "remove-connector", connectorId: selectedConnectorId })} />
  </div></div>;
  if (!photoIds.length && !pileIds.length) return null;
  if (actions.hasLockedPhoto && !mutablePhotoIds.length) return <div className="table-context-toolbar-position"><div className="table-context-toolbar" role="group" aria-label={t("table.selectionActions")}>
    <TableToolButton icon={lockIcon} label={t("table.unlock")} shortcut="K" onClick={() => onExecute({ type: "set-locked", photoIds: actions.lockedPhotoIds, locked: false })} />
    <span className="table-selection-summary">{t("common.photoCount", { count: photoIds.length })}</span>
  </div></div>;
  return <div className="table-context-toolbar-position"><div className="table-context-toolbar" role="group" aria-label={t("table.selectionActions")}>
    <span className="table-selection-summary">{pileIds.length ? t("common.sequenceCount", { count: pileIds.length }) : t("common.photoCount", { count: photoIds.length })}</span>
    {mutablePhotoIds.length > 0 && <>
      {actions.canPreview && <TableToolButton icon={previewIcon} label={t("table.preview")} shortcut="P / Space" onClick={() => onPreview(sourcePhotoIds[0])} />}
      {selectedLink && <TableToolButton icon={linkIcon} label={t("table.unlink")} shortcut="Shift+L" onClick={() => onExecute({ type: "remove-link", linkId: selectedLink.id })} />}
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
    {mutablePhotoIds.length > 0 && <TableToolButton className="is-primary" icon={sequenceIcon} label={t("table.createSequence")} shortcut="S" title={t("table.sequenceHint")} onClick={() => onRequestSequence(mutablePhotoIds)} />}
  </div></div>;
}

function TableToolButton({ icon, label, text = label, iconOnly = false, className = "", title, shortcut, ...props }: { icon: string; label: string; text?: string; iconOnly?: boolean; shortcut?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button type="button" className={`table-tool-button${iconOnly ? " is-icon-only" : ""}${className ? ` ${className}` : ""}`} aria-label={label} title={title ?? (shortcut ? `${label} · ${shortcut}` : iconOnly ? label : undefined)} {...props}><img src={icon} alt="" />{!iconOnly && <span>{text}</span>}</button>;
}
