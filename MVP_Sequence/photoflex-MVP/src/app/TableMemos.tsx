import { lazy, Suspense, useContext, useEffect, useRef, useState, type PointerEvent } from "react";
import type { WorktableDraft, WorktableEditCommand, WorktableMemo } from "../contracts";
import { useLocale } from "./locale";
import { TableResearchContext } from "./research/TableResearch";
import { ResearchImageView } from "./research/ResearchImageView";
import { TableToolbarIcon } from "./TableToolbarIcon";

type MemoGeometry = Pick<WorktableMemo, "x" | "y" | "width" | "height">;
const TableNoteEditor = lazy(() => import("./research/TableNoteEditor"));

export function TableMemos({ draft, zoom, selectedId, newNoteCardId, onSelect, onExecute, disabled, onGeometryPreview }: {
  readonly draft: WorktableDraft;
  readonly zoom: number;
  readonly selectedId?: string;
  readonly newNoteCardId?: string;
  readonly onSelect: (id: string) => void;
  readonly onExecute: (command: WorktableEditCommand) => void;
  readonly disabled: boolean;
  readonly onGeometryPreview?: (id: string, rect?: MemoGeometry) => void;
}) {
  const graphicZ = Math.max(-1, ...Object.values(draft.placements).map((item) => item.z), ...Object.values(draft.pilePlacements).map((item) => item.z));
  return <>{(draft.memos ?? []).map((memo, index) => <MemoCard key={memo.id} memo={memo} z={memo.z ?? graphicZ + index + 1} draft={draft} zoom={zoom} selected={memo.id === selectedId} autoFocusNote={memo.id === newNoteCardId && memo.id === selectedId} onSelect={() => onSelect(memo.id)} onExecute={onExecute} disabled={disabled} onGeometryPreview={onGeometryPreview} />)}</>;
}

function MemoCard({ memo, z, draft, zoom, selected, autoFocusNote, onSelect, onExecute, disabled, onGeometryPreview }: {
  memo: WorktableMemo; z: number; draft: WorktableDraft; zoom: number; selected: boolean; autoFocusNote: boolean; onSelect: () => void;
  onExecute: (command: WorktableEditCommand) => void; disabled: boolean;
  onGeometryPreview?: (id: string, rect?: MemoGeometry) => void;
}) {
  const { t } = useLocale();
  const research = useContext(TableResearchContext);
  const researchNoteId = memo.researchNoteId;
  const researchNote = researchNoteId ? research?.notes.get(researchNoteId) : undefined;
  const noteTitle = researchNote?.title.trim() || t(researchNote || !research?.loaded ? "research.untitled" : "research.noteMissing");
  const extract = memo.extractId ? research?.extracts.get(memo.extractId) : undefined;
  const source = extract && research?.notes.get(extract.noteId);
  const snapshot = extract?.snapshot ?? memo.text;
  const [preview, setPreview] = useState<WorktableMemo>();
  const gesture = useRef<{ pointerId: number; x: number; y: number; start: WorktableMemo; kind: "move" | "resize" } | undefined>(undefined);
  const shown = preview ?? memo;
  useEffect(() => () => onGeometryPreview?.(memo.id), [memo.id, onGeometryPreview]);
  const start = (event: PointerEvent<HTMLElement>, kind: "move" | "resize") => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    onSelect();
    if (researchNoteId) event.currentTarget.focus({ preventScroll: true });
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: memo, kind };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = (event.clientX - g.x) / zoom, dy = (event.clientY - g.y) / zoom;
    const next = g.kind === "move" ? { ...g.start, x: g.start.x + dx, y: g.start.y + dy } : { ...g.start, width: Math.max(120, g.start.width + dx), height: Math.max(80, g.start.height + dy) };
    setPreview(next);
    onGeometryPreview?.(memo.id, next);
  };
  const finish = (event: PointerEvent<HTMLElement>, cancel = false) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
    if (!cancel && preview) onExecute({ type: "update-memo", memoId: memo.id, changes: { x: preview.x, y: preview.y, width: preview.width, height: preview.height } });
    gesture.current = undefined;
    setPreview(undefined);
    onGeometryPreview?.(memo.id);
  };
  const handleKeys = (event: React.KeyboardEvent<HTMLButtonElement>, kind: "move" | "resize") => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction || disabled) return;
    event.preventDefault();
    const step = event.shiftKey ? 20 : 4;
    onExecute({ type: "update-memo", memoId: memo.id, changes: kind === "move" ? { x: memo.x + direction[0] * step, y: memo.y + direction[1] * step } : { width: Math.max(120, memo.width + direction[0] * step), height: Math.max(80, memo.height + direction[1] * step) } });
  };
  return <>
    <svg className="memo-links" aria-hidden="true">{memo.photoIds.map((id) => {
      const photo = draft.placements[id];
      if (!photo) return null;
      const startX = shown.x + shown.width / 2, startY = shown.y + shown.height / 2;
      const endX = photo.x + photo.width / 2, endY = photo.y + photo.height / 2;
      return <line key={id} x1={startX} y1={startY} x2={endX} y2={endY} />;
    })}</svg>
    <article className={`table-memo${researchNoteId ? " table-research-card" : ""}${selected ? " is-selected" : ""}`} aria-label={researchNoteId ? `${t("research.noteCard")} · ${noteTitle}` : `${t("nav.table")} ${t("table.memo")}`} tabIndex={researchNoteId ? -1 : undefined}
      style={{ left: shown.x, top: shown.y, zIndex: z, width: shown.width, height: shown.height }} onPointerDown={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onSelect();
        if (researchNoteId && !(event.target as Element).closest("button, input, [contenteditable]")) event.currentTarget.focus({ preventScroll: true });
      }} onFocus={researchNoteId && !disabled ? onSelect : undefined} onPointerMove={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (!researchNoteId || event.key !== "Delete") event.stopPropagation(); }}>
      <header><button type="button" className="memo-drag" aria-label={t(researchNoteId ? "research.moveCard" : "table.moveMemo")} title={t(researchNoteId ? "research.moveCard" : "table.dragMoveMemo")} disabled={disabled} onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event, true)} onKeyDown={(event) => handleKeys(event, "move")}>
        {researchNoteId ? <><TableToolbarIcon name="memo" />{t("research.noteCard")}</> : <span aria-hidden="true">⠿</span>}
      </button><button type="button" className="memo-delete" aria-label={t(researchNoteId ? "research.deleteNote" : "table.deleteMemo")} title={t(researchNoteId ? "research.deleteNote" : "table.deleteMemo")}
        disabled={disabled || Boolean(researchNoteId && !research)} onClick={() => {
          if (researchNoteId) research?.requestDelete(researchNoteId);
          else onExecute({ type: "remove-memo", memoId: memo.id });
        }}>×</button></header>
      {researchNoteId ? <>
        {research && <Suspense fallback={<p className="table-note-status">{t("common.loading")}</p>}>
          <TableNoteEditor id={researchNoteId} autoFocus={autoFocusNote} disabled={disabled} />
        </Suspense>}
        {researchNote && <footer>
          <div className="table-note-attachments">{researchNote.cover && <ResearchImageView key={`${researchNote.cover.kind}:${researchNote.cover.id}`} kind={researchNote.cover.kind} id={researchNote.cover.id} alt="" fit="cover" />}
            {researchNote.imageCount ? t(researchNote.imageCount === 1 ? "research.oneImage" : "research.imageCount", { count: researchNote.imageCount }) : null}</div>
          <button type="button" onClick={() => research?.openNote(researchNoteId)}>{t("research.openNote")} <span aria-hidden="true">↗</span></button>
        </footer>}
      </> : memo.extractId ? <div className="table-extract-content">
        <blockquote style={{ fontSize: memo.fontSize }}>{snapshot}</blockquote>
        {extract?.deletedAt ? <small>{t("research.deletedExtract")}</small> : <>
          {(memo.extractMode ?? "compact") !== "minimal" && <small>{source ? source.title.trim() || t("research.untitled") : t("research.sourceUnavailable")}</small>}
          {memo.extractMode === "expanded" && extract?.note && <p>{extract.note}</p>}
          {(selected || memo.extractMode !== "minimal") && extract && <button type="button" onClick={() => research?.openSource(extract)}>{t("research.openSource")}</button>}
        </>}
        {selected && <div className="table-extract-actions">
          <select aria-label={t("research.extractMode")} disabled={disabled} value={memo.extractMode ?? "compact"} onChange={(event) =>
            onExecute({ type: "update-memo", memoId: memo.id, changes: { extractMode: event.target.value as WorktableMemo["extractMode"] } })}>
            {(["minimal", "compact", "expanded"] as const).map((mode) => <option key={mode} value={mode}>{t(`research.${mode}`)}</option>)}
          </select>
          <button type="button" disabled={disabled} onClick={() => onExecute({ type: "update-memo", memoId: memo.id,
            changes: { extractId: undefined, extractMode: undefined, text: snapshot } })}>{t("research.convertMemo")}</button>
        </div>}
      </div> : <textarea autoFocus={selected && !memo.text} aria-label={t("table.memoText")} placeholder={t("table.memoPlaceholder")} value={memo.text} disabled={disabled} style={{ fontSize: memo.fontSize }} onFocus={onSelect} onChange={(event) => onExecute({ type: "update-memo", memoId: memo.id, changes: { text: event.target.value } })} />}
      <button type="button" className="memo-resize" aria-label={t(researchNoteId ? "research.resizeCard" : "table.resizeMemo")} title={t(researchNoteId ? "research.resizeCard" : "table.dragResizeMemo")} disabled={disabled} onPointerDown={(event) => start(event, "resize")} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event, true)} onKeyDown={(event) => handleKeys(event, "resize")} />
    </article>
  </>;
}
