import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { FrameCrop, FrameEditCommand, FrameId, FrameRect, FrameSlot, FrameSlotId, PhotoId, PhotoSource, SourceError, WorktableFrame } from "../contracts";
import { FRAME_MM_TO_PT, frameWorldSize, resolveFramePhoto } from "../modules/worktable/frameLayout";
import { alignFrameRect, type FrameAlignmentGuide } from "../modules/worktable/frameAlignment";
import { FrameSettingsPanel } from "./FrameSettingsPanel";

interface FrameCardProps {
  readonly frame: WorktableFrame;
  readonly layerZ: number;
  readonly selected: boolean;
  readonly settingsHost?: HTMLElement | null;
  readonly selectedSlotId?: FrameSlotId;
  readonly onSelectSlot: (id: FrameSlotId | undefined) => void;
  readonly viewportZoom: number;
  readonly photoSource: PhotoSource;
  readonly sourceRevision?: number;
  readonly missingPhotoIds: ReadonlySet<PhotoId>;
  readonly onPhotoError: (id: PhotoId, error: SourceError) => void;
  readonly onSelect: (id: FrameId) => void;
  readonly onClose: () => void;
  readonly onExecute: (command: FrameEditCommand) => void;
  readonly dropTarget?: boolean;
}

type DragState = { kind: "frame" | "scale" | "slot" | "resize-slot" | "crop" | "quick-crop"; pointerId: number; startX: number; startY: number; slotId?: FrameSlotId; handle?: string; baseRect?: FrameRect; baseCrop?: FrameCrop };
const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function resizeSlot(rect: FrameRect, dx: number, dy: number, handle: string, keepRatio = false): FrameRect {
  let x = rect.x, y = rect.y, width = rect.width, height = rect.height;
  if (handle.includes("w")) { x += dx; width -= dx; }
  if (handle.includes("e")) width += dx;
  if (handle.includes("n")) { y += dy; height -= dy; }
  if (handle.includes("s")) height += dy;
  if (width < FRAME_MM_TO_PT) { if (handle.includes("w")) x -= FRAME_MM_TO_PT - width; width = FRAME_MM_TO_PT; }
  if (height < FRAME_MM_TO_PT) { if (handle.includes("n")) y -= FRAME_MM_TO_PT - height; height = FRAME_MM_TO_PT; }
  if (keepRatio) {
    const horizontal = handle.includes("w") || handle.includes("e");
    const vertical = handle.includes("n") || handle.includes("s");
    if (horizontal && vertical) {
      if (Math.abs(dx / rect.width) >= Math.abs(dy / rect.height)) height = Math.max(FRAME_MM_TO_PT, width * rect.height / rect.width);
      else width = Math.max(FRAME_MM_TO_PT, height * rect.width / rect.height);
    } else if (horizontal) height = Math.max(FRAME_MM_TO_PT, width * rect.height / rect.width);
    else if (vertical) width = Math.max(FRAME_MM_TO_PT, height * rect.width / rect.height);
    x = handle.includes("w") ? rect.x + rect.width - width : horizontal ? rect.x : rect.x + (rect.width - width) / 2;
    y = handle.includes("n") ? rect.y + rect.height - height : vertical ? rect.y : rect.y + (rect.height - height) / 2;
  }
  return { x, y, width, height };
}

type FramePreview = { url: string; size?: { width: number; height: number } };

function FrameImage({ photoId, slot, preview, onSize, missing }: { photoId: PhotoId; slot: FrameSlot; preview?: FramePreview; onSize: (id: PhotoId, size: { width: number; height: number }) => void; missing: boolean }) {
  if (missing) return <span className="table-frame-missing">Photo unavailable</span>;
  const image = preview?.size ? resolveFramePhoto(preview.size, slot.rect, slot.crop) : undefined;
  return <>{preview?.url && <img src={preview.url} alt="" draggable={false} className={image ? "table-frame-image-enter" : undefined} onLoad={(event) => {
    const next = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
    if (next.width > 0 && next.height > 0) onSize(photoId, next);
  }} style={image ? { position: "absolute", left: image.x, top: image.y, width: image.width, height: image.height } : { visibility: "hidden" }} />}{!image && <span className="table-frame-loading">Loading photo…</span>}</>;
}

export function TableFrameCard({ frame, layerZ, selected, settingsHost, selectedSlotId, onSelectSlot, viewportZoom, photoSource, sourceRevision, missingPhotoIds, onPhotoError, onSelect, onClose, onExecute, dropTarget }: FrameCardProps) {
  const [cropDraft, setCropDraft] = useState<FrameCrop>();
  const [preview, setPreview] = useState<{ dx: number; dy: number; scale?: number; rect?: FrameRect; guides?: readonly FrameAlignmentGuide[] }>({ dx: 0, dy: 0 });
  const [previews, setPreviews] = useState<Partial<Record<PhotoId, FramePreview>>>({});
  const previewLeases = useRef(new Map<PhotoId, { source: PhotoSource; revision?: number; active: boolean; release?: () => void }>());
  const photoIds = [...new Set(frame.page.slots.map((item) => item.photoId).filter((id): id is PhotoId => Boolean(id)))].sort();
  const photoIdsKey = photoIds.join("\u0000");
  useEffect(() => {
    const wanted = new Set(photoIdsKey ? photoIdsKey.split("\u0000") as PhotoId[] : []);
    for (const [id, lease] of previewLeases.current) {
      if (wanted.has(id) && lease.source === photoSource && lease.revision === sourceRevision) continue;
      lease.active = false;
      lease.release?.();
      previewLeases.current.delete(id);
      setPreviews((current) => { const next = { ...current }; delete next[id]; return next; });
    }
    for (const id of wanted) {
      if (previewLeases.current.has(id)) continue;
      const lease = { source: photoSource, revision: sourceRevision, active: true, release: undefined as (() => void) | undefined };
      previewLeases.current.set(id, lease);
      void photoSource.derivedPreview(id, 1536).then((result) => {
        if (!result.ok) { if (lease.active) onPhotoError(id, result.error); return; }
        if (!lease.active) { result.value.release(); return; }
        lease.release = () => result.value.release();
        setPreviews((current) => ({ ...current, [id]: { url: result.value.url } }));
      });
    }
  }, [photoIdsKey, photoSource, sourceRevision, onPhotoError]);
  useEffect(() => () => {
    for (const lease of previewLeases.current.values()) { lease.active = false; lease.release?.(); }
    previewLeases.current.clear();
  }, []);
  const drag = useRef<DragState | undefined>(undefined);
  const previewRef = useRef(preview);
  const cropDraftRef = useRef(cropDraft);
  const articleRef = useRef<HTMLElement>(null);
  previewRef.current = preview;
  cropDraftRef.current = cropDraft;
  const size = frameWorldSize(frame);
  const slot = frame.page.slots.find((item) => item.id === selectedSlotId);
  useEffect(() => { if (!selected) setCropDraft(undefined); }, [selected]);
  useEffect(() => {
    if (!cropDraft) return;
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Enter") return;
      if (event.key === "Enter" && (event.target as HTMLElement).matches("input, textarea, select")) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Escape") setCropDraft(undefined);
      else if (slot) { onExecute({ type: "set-frame-photo-crop", frameId: frame.id, slotId: slot.id, crop: cropDraft }); setCropDraft(undefined); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, [cropDraft, frame.id, onExecute, slot]);
  const begin = (event: ReactPointerEvent, kind: DragState["kind"], targetSlot?: FrameSlot, handle?: string) => {
    if (event.button !== (kind === "quick-crop" ? 2 : 0)) return;
    event.preventDefault(); event.stopPropagation();
    onSelect(frame.id);
    if (kind === "frame") onSelectSlot(undefined);
    else if (kind !== "scale") onSelectSlot(targetSlot?.id);
    if (kind === "quick-crop") { cropDraftRef.current = targetSlot?.crop; setCropDraft(targetSlot?.crop); }
    drag.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, slotId: targetSlot?.id, handle, baseRect: targetSlot?.rect, baseCrop: kind === "quick-crop" ? targetSlot?.crop : kind === "crop" ? cropDraft : undefined };
    articleRef.current?.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const worldDx = (event.clientX - current.startX) / viewportZoom, worldDy = (event.clientY - current.startY) / viewportZoom;
    const pageDx = worldDx / frame.displayScale, pageDy = worldDy / frame.displayScale;
    if (current.kind === "frame") setPreview({ dx: worldDx, dy: worldDy });
    else if (current.kind === "scale") setPreview({ dx: 0, dy: 0, scale: clamp((size.width + worldDx) / frame.page.widthPt, .1, 4) });
    else if (current.kind === "slot" && current.baseRect) {
      const candidate = { ...current.baseRect, x: current.baseRect.x + pageDx, y: current.baseRect.y + pageDy };
      const aligned = alignFrameRect(candidate, frame.page, frame.page.slots.filter((item) => item.id !== current.slotId).map((item) => item.rect), 8 / (viewportZoom * frame.displayScale));
      setPreview({ dx: 0, dy: 0, rect: aligned.rect, guides: aligned.guides });
    }
    else if (current.kind === "resize-slot" && current.baseRect) setPreview({ dx: 0, dy: 0, rect: resizeSlot(current.baseRect, pageDx, pageDy, current.handle ?? "se", event.shiftKey) });
    else if (current.kind === "crop" || current.kind === "quick-crop") {
      const cropSlot = frame.page.slots.find((item) => item.id === current.slotId);
      const draft = cropDraftRef.current;
      if (!cropSlot || !draft) return;
      const imageSize = cropSlot.photoId ? previews[cropSlot.photoId]?.size : undefined;
      const rendered = resolveFramePhoto(imageSize ?? { width: cropSlot.rect.width, height: cropSlot.rect.height }, cropSlot.rect, draft);
      const next = { ...draft, focal: { x: clamp(draft.focal.x - pageDx / rendered.width, 0, 1), y: clamp(draft.focal.y - pageDy / rendered.height, 0, 1) } };
      cropDraftRef.current = next;
      setCropDraft(next);
      drag.current = { ...current, startX: event.clientX, startY: event.clientY };
    }
  };
  const end = (event: ReactPointerEvent, cancelled = false) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (articleRef.current?.hasPointerCapture(event.pointerId)) articleRef.current.releasePointerCapture(event.pointerId);
    drag.current = undefined;
    const value = previewRef.current;
    if (!cancelled && current.kind === "frame" && (Math.abs(value.dx) > .25 || Math.abs(value.dy) > .25)) onExecute({ type: "move-frame", frameId: frame.id, by: { x: value.dx, y: value.dy } });
    if (!cancelled && current.kind === "scale" && value.scale && Math.abs(value.scale - frame.displayScale) > .001) onExecute({ type: "scale-frame", frameId: frame.id, displayScale: value.scale });
    if (!cancelled && (current.kind === "slot" || current.kind === "resize-slot") && value.rect && current.slotId && JSON.stringify(value.rect) !== JSON.stringify(current.baseRect)) {
      onExecute({ type: "transform-frame-slot", frameId: frame.id, slotId: current.slotId, rect: value.rect });
    }
    if (current.kind === "quick-crop") {
      const crop = cropDraftRef.current;
      if (!cancelled && crop && current.slotId && JSON.stringify(crop) !== JSON.stringify(current.baseCrop)) onExecute({ type: "set-frame-photo-crop", frameId: frame.id, slotId: current.slotId, crop });
      cropDraftRef.current = undefined;
      setCropDraft(undefined);
    }
    if (cancelled && current.kind === "crop" && current.baseCrop) { cropDraftRef.current = current.baseCrop; setCropDraft(current.baseCrop); }
    setPreview({ dx: 0, dy: 0 });
  };
  const finishCrop = () => { if (slot && cropDraft) onExecute({ type: "set-frame-photo-crop", frameId: frame.id, slotId: slot.id, crop: cropDraft }); setCropDraft(undefined); };
  return <article ref={articleRef} data-frame-id={frame.id} className={`table-frame${selected ? " is-selected" : ""}${dropTarget ? " is-drop-target" : ""}`}
    style={{ width: size.width, height: size.height, zIndex: layerZ, transform: `translate3d(${frame.x + preview.dx}px,${frame.y + preview.dy}px,0)` }}
    onPointerMove={move} onPointerUp={end} onPointerCancel={(event) => end(event, true)} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      if (cropDraft) { event.stopPropagation(); setCropDraft(undefined); }
      else if (drag.current) { event.stopPropagation(); drag.current = undefined; setPreview({ dx: 0, dy: 0 }); }
    }} onContextMenu={(event) => event.preventDefault()}>
    {(frame.page.bleedPt ?? 0) > 0 && <div className="table-frame-bleed-guide" aria-hidden="true" style={{
      left: -(frame.page.bleedPt ?? 0) * (preview.scale ?? frame.displayScale), top: -(frame.page.bleedPt ?? 0) * (preview.scale ?? frame.displayScale),
      width: (frame.page.widthPt + 2 * (frame.page.bleedPt ?? 0)) * (preview.scale ?? frame.displayScale),
      height: (frame.page.heightPt + 2 * (frame.page.bleedPt ?? 0)) * (preview.scale ?? frame.displayScale),
    }} />}
    <div className={`table-frame-page${frame.page.background === "black" ? " is-black" : ""}`} style={{ width: frame.page.widthPt, height: frame.page.heightPt, backgroundColor: frame.page.background === "black" ? "#161616" : "#fff", transform: `scale(${preview.scale ?? frame.displayScale})` }}
      onPointerDown={(event) => begin(event, "frame")}>
      {frame.page.slots.map((item, index) => {
        const chosen = selected && selectedSlotId === item.id;
        const drawn = preview.rect && chosen ? preview.rect : item.rect;
        const displayed = cropDraft && chosen ? { ...item, crop: cropDraft } : item;
        return <div key={item.id} data-frame-slot-id={item.id} className={`table-frame-slot${chosen ? " is-selected" : ""}${item.photoId ? " has-photo" : ""}`}
          style={{ left: drawn.x, top: drawn.y, width: drawn.width, height: drawn.height, borderRadius: item.cornerRadiusPt ?? frame.page.cornerRadiusPt ?? 0 }}
          onPointerDown={(event) => { event.stopPropagation(); if (event.button === 2 && item.photoId && item.crop.mode === "fill") { begin(event, "quick-crop", item); return; } if (!selected) { onSelect(frame.id); return; } begin(event, cropDraft && chosen ? "crop" : "slot", item); }}
          onContextMenu={(event) => { if (item.photoId && item.crop.mode === "fill") event.preventDefault(); }}
          onDoubleClick={(event) => { event.stopPropagation(); onSelect(frame.id); onSelectSlot(item.id); if (item.photoId) setCropDraft(item.crop); }}>
          <div className="table-frame-photo-clip" style={{ borderRadius: item.cornerRadiusPt ?? frame.page.cornerRadiusPt ?? 0 }}>{item.photoId ? <FrameImage photoId={item.photoId} slot={displayed} preview={previews[item.photoId]} onSize={(id, next) => setPreviews((current) => !current[id] || (current[id].size?.width === next.width && current[id].size?.height === next.height) ? current : { ...current, [id]: { ...current[id], size: next } })} missing={missingPhotoIds.has(item.photoId)} /> : <span className="table-frame-empty-slot">{String(index + 1).padStart(2, "0")}<small>DROP PHOTO</small></span>}</div>
          {chosen && !cropDraft && handles.map((handle) => <button key={handle} type="button" className={`table-frame-slot-handle handle-${handle}`} aria-label={`Resize photo frame ${handle}`} onPointerDown={(event) => begin(event, "resize-slot", item, handle)} />)}
        </div>;
      })}
      {preview.guides?.length ? <svg className="table-frame-alignment-guides" width={frame.page.widthPt} height={frame.page.heightPt} aria-hidden="true">{preview.guides.map((guide) => guide.axis === "x" ? <line key="x" x1={guide.value} y1={0} x2={guide.value} y2={frame.page.heightPt} /> : <line key="y" x1={0} y1={guide.value} x2={frame.page.widthPt} y2={guide.value} />)}</svg> : null}
    </div>
    <div className="table-frame-title" onPointerDown={(event) => begin(event, "frame")}><strong>{frame.name}</strong><span>{Math.round(frame.page.widthPt / FRAME_MM_TO_PT)} × {Math.round(frame.page.heightPt / FRAME_MM_TO_PT)} mm</span></div>
    {selected && <button type="button" className="table-frame-scale-handle" aria-label="Resize Frame display" onPointerDown={(event) => begin(event, "scale")}>◢</button>}
    {selected && settingsHost && createPortal(<FrameSettingsPanel frame={frame} slot={slot} cropDraft={cropDraft} onCropDraft={setCropDraft} onFinishCrop={finishCrop} onSelectSlot={onSelectSlot} onClose={onClose} onExecute={onExecute} />, settingsHost)}
  </article>;
}
