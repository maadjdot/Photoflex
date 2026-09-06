import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PhotoId, ProjectId, SequenceId, SequenceItemId, SourceError } from "../contracts";
import { calculateSequenceStripVirtualRange, sequenceStripInsertionIndex, TABLE_SEQUENCE_STRIP_ITEM_GAP, TABLE_SEQUENCE_STRIP_ITEM_WIDTH } from "../modules/sequence";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { PhotoThumb } from "./PhotoThumb";
import type { ProjectWriteCoordinator } from "./projectWriteCoordinator";
import { useSequenceSession } from "./sequenceSession";

interface SequenceOrderPanelProps {
  readonly coordinator: ProjectWriteCoordinator;
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly sequenceId?: SequenceId;
  readonly navigate: (route: AppRoute) => void;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
  readonly onNotice: (message: string) => void;
}

/** Owns the sequence strip's local UI and sequence-session interaction. */
export function SequenceOrderPanel(props: SequenceOrderPanelProps) {
  const { sequenceId } = props;
  return sequenceId
    ? <ActiveSequenceOrderPanel {...props} sequenceId={sequenceId} />
    : <EmptySequenceOrderPanel />;
}

function EmptySequenceOrderPanel() {
  const [collapsed, setCollapsed] = useState(false);
  return <section className={`sequence-strip${collapsed ? " is-collapsed" : " is-empty"}`} aria-label="Sequence Order"><header><button onClick={() => setCollapsed((value) => !value)}>{collapsed ? "↑" : "↓"}</button><strong>SEQUENCE ORDER</strong><span>Select one Sequence Pile</span></header></section>;
}

function ActiveSequenceOrderPanel({ coordinator, dependencies, projectId, sequenceId, navigate, onPhotoError, onNotice }: SequenceOrderPanelProps & { readonly sequenceId: SequenceId }) {
  const sequenceSession = useSequenceSession(coordinator, projectId, sequenceId);
  const { sequence, execute } = sequenceSession;
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<SequenceItemId>();
  const [dropIndex, setDropIndex] = useState<number>();
  const [size, setSize] = useState({ width: 0, scrollLeft: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<SequenceItemId, HTMLButtonElement>());
  const positions = useRef(new Map<SequenceItemId, { left: number; top: number }>());
  const range = useMemo(() => calculateSequenceStripVirtualRange({ itemCount: sequence?.items.length ?? 0, viewportWidth: size.width, scrollLeft: size.scrollLeft, itemWidth: TABLE_SEQUENCE_STRIP_ITEM_WIDTH, itemGap: TABLE_SEQUENCE_STRIP_ITEM_GAP }), [sequence?.items.length, size]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setSize({ width: viewport.clientWidth || viewport.getBoundingClientRect().width, scrollLeft: viewport.scrollLeft });
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(viewport);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [collapsed, sequence?.id]);

  useLayoutEffect(() => {
    const next = new Map<SequenceItemId, { left: number; top: number }>();
    itemRefs.current.forEach((element, id) => {
      const rect = element.getBoundingClientRect();
      const old = positions.current.get(id);
      if (old && typeof element.animate === "function") element.animate([{ transform: `translate3d(${old.left - rect.left}px,${old.top - rect.top}px,0)` }, { transform: "translate3d(0,0,0)" }], { duration: 220, easing: "cubic-bezier(.2,.75,.25,1)" });
      next.set(id, { left: rect.left, top: rect.top });
    });
    positions.current = next;
  }, [sequence?.items]);

  const move = (to: number) => {
    if (!dragId || !sequence) return;
    const result = execute({ type: "move", itemIds: [dragId], to });
    if (!result.ok) onNotice("Sequence item could not be moved.");
    setDragId(undefined);
    setDropIndex(undefined);
  };
  const openSequence = () => {
    void sequenceSession.flush().then((result) => { if (result.ok) navigate({ name: "sequence", projectId, sequenceId }); else onNotice("Sequence changes could not be saved. Retry before opening."); });
  };

  return <section className={`sequence-strip${collapsed ? " is-collapsed" : ""}${sequence ? "" : " is-empty"}`} aria-label="Sequence Order"><header><button aria-label={collapsed ? "Expand Sequence Order" : "Collapse Sequence Order"} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "↑" : "↓"}</button><strong>Sequence Order</strong><span>{sequence ? `${sequence.name} · ${sequence.items.filter((item) => item.kind === "photo").length} photos` : "Select one Sequence Pile"}</span>{sequence && <><small>Drag to reorder</small><button className="sequence-strip-open" disabled={sequenceSession.saveState !== "idle"} onClick={openSequence}>Open Sequence →</button></>}</header>{sequenceSession.error && <p className="sequence-strip-error" role="alert">{sequenceSession.error} <button type="button" onClick={() => void sequenceSession.retry()}>Retry</button></p>}{!collapsed && sequence && <div ref={viewportRef} className="sequence-strip-items" onScroll={(event) => setSize({ width: event.currentTarget.clientWidth, scrollLeft: event.currentTarget.scrollLeft })} onDragOver={(event) => { if (!dragId || !viewportRef.current) return; event.preventDefault(); setDropIndex(sequenceStripInsertionIndex(event.clientX, viewportRef.current.getBoundingClientRect().left, viewportRef.current.scrollLeft, sequence.items.length, 16, TABLE_SEQUENCE_STRIP_ITEM_WIDTH, TABLE_SEQUENCE_STRIP_ITEM_GAP)); }} onDrop={(event) => { event.preventDefault(); if (dropIndex !== undefined) move(dropIndex); }}><div className="sequence-strip-track" style={{ width: range.totalWidth }}>{sequence.items.slice(range.startIndex, range.endIndex).map((item, offset) => { const index = range.startIndex + offset; return <button key={item.id} ref={(element) => { if (element) itemRefs.current.set(item.id, element); else itemRefs.current.delete(item.id); }} style={{ left: index * range.itemStride }} className={`sequence-strip-item${dragId === item.id ? " is-dragging" : ""}${dropIndex === index ? " is-drop-target" : ""}`} disabled={sequenceSession.saveState !== "idle"} draggable={sequenceSession.saveState === "idle"} onDragStart={() => { setDragId(item.id); setDropIndex(index); }} onDragOver={(event) => { event.preventDefault(); setDropIndex(index); }} onDrop={(event) => { event.stopPropagation(); move(index); }} onDragEnd={() => { setDragId(undefined); setDropIndex(undefined); }} onKeyDown={(event) => { if (event.key === "Home") { event.preventDefault(); move(0); } else if (event.key === "End") { event.preventDefault(); move(sequence.items.length); } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); if (event.altKey) move(Math.max(0, Math.min(sequence.items.length, index + (event.key === "ArrowLeft" ? -1 : 2)))); else { const next = Math.max(0, Math.min(sequence.items.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1))); itemRefs.current.get(sequence.items[next]?.id)?.focus(); } } else if (event.key === "Escape") { setDragId(undefined); setDropIndex(undefined); } }}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`Sequence ${index + 1}`} onError={onPhotoError} /> : <span className="sequence-blank-thumb">Blank</span>}<span>{String(index + 1).padStart(2, "0")} · {item.kind === "photo" ? item.photoId.slice(0, 8) : "Blank"}</span></button>; })}{dropIndex === sequence.items.length && dragId && <span className="sequence-strip-end-drop" style={{ left: range.totalWidth - range.itemStride + TABLE_SEQUENCE_STRIP_ITEM_WIDTH }} aria-label="Drop at end" />}</div></div>}</section>;
}
