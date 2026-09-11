import { useRef, useState, type PointerEvent } from "react";
import type { WorktableDraft, WorktableEditCommand, WorktableMemo } from "../contracts";
import { useLocale } from "./locale";

export function TableMemos({ draft, zoom, selectedId, onSelect, onExecute, disabled }: {
  readonly draft: WorktableDraft;
  readonly zoom: number;
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
  readonly onExecute: (command: WorktableEditCommand) => void;
  readonly disabled: boolean;
}) {
  const graphicZ = Math.max(-1, ...Object.values(draft.placements).map((item) => item.z), ...Object.values(draft.pilePlacements).map((item) => item.z));
  return <>{(draft.memos ?? []).map((memo, index) => <MemoCard key={memo.id} memo={memo} z={memo.z ?? graphicZ + index + 1} draft={draft} zoom={zoom} selected={memo.id === selectedId} onSelect={() => onSelect(memo.id)} onExecute={onExecute} disabled={disabled} />)}</>;
}

function MemoCard({ memo, z, draft, zoom, selected, onSelect, onExecute, disabled }: {
  memo: WorktableMemo; z: number; draft: WorktableDraft; zoom: number; selected: boolean; onSelect: () => void;
  onExecute: (command: WorktableEditCommand) => void; disabled: boolean;
}) {
  const { t } = useLocale();
  const [preview, setPreview] = useState<WorktableMemo>();
  const gesture = useRef<{ pointerId: number; x: number; y: number; start: WorktableMemo; kind: "move" | "resize" } | undefined>(undefined);
  const shown = preview ?? memo;
  const start = (event: PointerEvent<HTMLButtonElement>, kind: "move" | "resize") => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    onSelect();
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: memo, kind };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = (event.clientX - g.x) / zoom, dy = (event.clientY - g.y) / zoom;
    setPreview(g.kind === "move" ? { ...g.start, x: g.start.x + dx, y: g.start.y + dy } : { ...g.start, width: Math.max(120, g.start.width + dx), height: Math.max(80, g.start.height + dy) });
  };
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
    if (!cancel && preview) onExecute({ type: "update-memo", memoId: memo.id, changes: { x: preview.x, y: preview.y, width: preview.width, height: preview.height } });
    gesture.current = undefined;
    setPreview(undefined);
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
    <article className={`table-memo${selected ? " is-selected" : ""}`} aria-label={`${t("nav.table")} ${t("table.memo")}`} style={{ left: shown.x, top: shown.y, zIndex: z, width: shown.width, height: shown.height }} onPointerDown={(event) => { event.stopPropagation(); if (!disabled) onSelect(); }} onPointerMove={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <header><button type="button" className="memo-drag" aria-label={t("table.moveMemo")} title={t("table.dragMoveMemo")} disabled={disabled} onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event, true)} onKeyDown={(event) => handleKeys(event, "move")}><span aria-hidden="true">⠿</span></button><button type="button" className="memo-delete" aria-label={t("table.deleteMemo")} title={t("table.deleteMemo")} disabled={disabled} onClick={() => onExecute({ type: "remove-memo", memoId: memo.id })}>×</button></header>
      <textarea autoFocus={selected && !memo.text} aria-label={t("table.memoText")} placeholder={t("table.memoPlaceholder")} value={memo.text} disabled={disabled} style={{ fontSize: memo.fontSize }} onFocus={onSelect} onChange={(event) => onExecute({ type: "update-memo", memoId: memo.id, changes: { text: event.target.value } })} />
      <button type="button" className="memo-resize" aria-label={t("table.resizeMemo")} title={t("table.dragResizeMemo")} disabled={disabled} onPointerDown={(event) => start(event, "resize")} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event, true)} onKeyDown={(event) => handleKeys(event, "resize")} />
    </article>
  </>;
}
