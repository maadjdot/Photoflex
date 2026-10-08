import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { FrameCrop, FrameEditCommand, FrameId, FrameRect, FrameSlot, FrameSlotId, FrameTextBox, LayoutObjectId, PhotoId, PhotoSource, SourceError, WorktableFrame } from "../contracts";
import { FRAME_MM_TO_PT, frameFamily, framePaper, frameWorldSize, resolveFramePhoto } from "../modules/worktable/frameLayout";
import { isDarkLayoutPaper } from "../modules/layout/layoutPaper";
import { LayoutPaperBackdrop } from "./LayoutPaperBackdrop";
import { alignFrameRect, type FrameAlignmentGuide } from "../modules/worktable/frameAlignment";
import { frameEdgeStyle, frameInnerEdge } from "../modules/worktable/frameAppearance";
import { createFrameTextBox } from "../modules/worktable/frameText";
import { LayoutTextView } from "./LayoutTextView";
import { useLocale } from "./locale";
import { layoutFontCssStack } from "../modules/layout/layoutFonts";
import { FrameEdge, FramePhotoEdge } from "./FrameEdges";
import { FrameSettingsPanel } from "./FrameSettingsPanel";
import { zoomImageCropAtPoint } from "../modules/layout/layoutImages";
import { FrameJpegExportButton } from "./FrameJpegExportButton";

interface FrameCardProps {
  readonly frame: WorktableFrame;
  readonly layerZ: number;
  readonly selected: boolean;
  readonly settingsHost?: HTMLElement | null;
  readonly selectedSlotId?: FrameSlotId;
  readonly onSelectSlot: (id: FrameSlotId | undefined) => void;
  readonly selectedTextId?: LayoutObjectId;
  readonly onSelectText: (id: LayoutObjectId | undefined) => void;
  readonly viewportZoom: number;
  readonly photoSource: PhotoSource;
  readonly sourceRevision?: number;
  readonly missingPhotoIds: ReadonlySet<PhotoId>;
  readonly onPhotoError: (id: PhotoId, error: SourceError) => void;
  readonly onSelect: (id: FrameId) => void;
  readonly onClose: () => void;
  readonly onExecute: (command: FrameEditCommand) => void;
  readonly dropTarget?: boolean;
  readonly onGeometryPreview?: (id: FrameId, rect?: FrameRect) => void;
}

type DragState = { kind: "frame" | "scale" | "slot" | "resize-slot" | "crop" | "text" | "resize-text"; pointerId: number; captureTarget: Element; startX: number; startY: number; slotId?: FrameSlotId; textId?: LayoutObjectId; handle?: string; baseRect?: FrameRect; baseCrop?: FrameCrop };
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

function FrameImage({ photoId, slot, preview, origin, onSize, missing }: { photoId: PhotoId; slot: FrameSlot; preview?: FramePreview; origin: { x: number; y: number }; onSize: (id: PhotoId, size: { width: number; height: number }) => void; missing: boolean }) {
  if (missing) return <span className="table-frame-missing">Photo unavailable</span>;
  const image = preview?.size ? resolveFramePhoto(preview.size, slot.rect, slot.crop) : undefined;
  return <>{preview?.url && <img src={preview.url} alt="" draggable={false} className={image ? "table-frame-image-enter" : undefined} onLoad={(event) => {
    const next = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
    if (next.width > 0 && next.height > 0) onSize(photoId, next);
  }} style={image ? { position: "absolute", left: image.x - origin.x, top: image.y - origin.y, width: image.width, height: image.height } : { visibility: "hidden" }} />}{!image && <span className="table-frame-loading">Loading photo…</span>}</>;
}

export function TableFrameCard({ frame, layerZ, selected, settingsHost, selectedSlotId, onSelectSlot, selectedTextId, onSelectText, viewportZoom, photoSource, sourceRevision, missingPhotoIds, onPhotoError, onSelect, onClose, onExecute, dropTarget, onGeometryPreview }: FrameCardProps) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const [cropDraft, setCropDraft] = useState<FrameCrop>();
  const [drawingText, setDrawingText] = useState(false);
  const [drawnTextRect, setDrawnTextRect] = useState<FrameRect>();
  const [editingTextId, setEditingTextId] = useState<LayoutObjectId>();
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const drawing = useRef<{ pointerId: number; target: Element; start: { x: number; y: number }; rect?: FrameRect } | undefined>(undefined);
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
  const pageRef = useRef<HTMLDivElement>(null);
  previewRef.current = preview;
  cropDraftRef.current = cropDraft;
  const size = frameWorldSize(frame);
  const family = frameFamily(frame.page.templateSource.id).id;
  const paper = framePaper(frame.page);
  const darkPaper = isDarkLayoutPaper(paper);
  const film = family === "sheets";
  const texts = frame.page.textBoxes ?? [];
  const textBox = selected && texts.find((box) => box.id === selectedTextId) || undefined;
  const innerEdge = frameInnerEdge(frame.page);
  const edge = frameEdgeStyle(frame.page);
  useEffect(() => () => onGeometryPreview?.(frame.id), [frame.id, onGeometryPreview]);
  const slot = frame.page.slots.find((item) => item.id === selectedSlotId);
  const finishTextEditing = (cancelled = false) => {
    const box = texts.find((item) => item.id === editingTextId);
    if (!cancelled && box && textInputRef.current && textInputRef.current.value !== box.text) onExecute({ type: "upsert-frame-text", frameId: frame.id, textBox: { ...box, text: textInputRef.current.value } });
    setEditingTextId(undefined);
  };
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const wheel = (event: WheelEvent) => {
      const draft = cropDraftRef.current;
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-frame-slot-id]");
      if (!selected || !draft || !slot?.photoId || target?.dataset.frameSlotId !== slot.id) return;
      event.preventDefault(); event.stopPropagation();
      const photoSize = previews[slot.photoId]?.size;
      if (!photoSize) return;
      const bounds = target.getBoundingClientRect();
      const next = zoomImageCropAtPoint(draft, photoSize, slot.rect, draft.zoom * Math.exp(-event.deltaY * .002), {
        x: (event.clientX - bounds.left) * slot.rect.width / bounds.width,
        y: (event.clientY - bounds.top) * slot.rect.height / bounds.height,
      });
      cropDraftRef.current = next;
      setCropDraft(next);
    };
    article.addEventListener("wheel", wheel, { passive: false });
    return () => article.removeEventListener("wheel", wheel);
  }, [selected, slot, previews]);
  const selectSlot = (nextSlotId: FrameSlotId | undefined) => {
    finishTextEditing();
    if (nextSlotId !== selectedSlotId) {
      cropDraftRef.current = undefined;
      setCropDraft(undefined);
    }
    onSelectSlot(nextSlotId);
  };
  const selectText = (nextId: LayoutObjectId | undefined) => {
    if (nextId !== editingTextId) finishTextEditing();
    onSelectText(nextId);
  };
  useEffect(() => { if (!selected) { finishTextEditing(); setCropDraft(undefined); setDrawingText(false); drawing.current = undefined; setDrawnTextRect(undefined); } }, [selected]);
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
  const begin = (event: ReactPointerEvent, kind: DragState["kind"], targetSlot?: FrameSlot, handle?: string, targetText?: FrameTextBox) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    onSelect(frame.id);
    if (kind === "frame") { selectSlot(undefined); selectText(undefined); }
    else if (targetText) { selectSlot(undefined); selectText(targetText.id); }
    else if (kind !== "scale") { selectText(undefined); selectSlot(targetSlot?.id); }
    drag.current = { kind, pointerId: event.pointerId, captureTarget: event.currentTarget, startX: event.clientX, startY: event.clientY, slotId: targetSlot?.id, textId: targetText?.id, handle, baseRect: targetText?.rect ?? targetSlot?.rect, baseCrop: kind === "crop" ? cropDraft : undefined };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pagePoint = (event: ReactPointerEvent) => {
    const bounds = pageRef.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) * frame.page.widthPt / bounds.width, 0, frame.page.widthPt), y: clamp((event.clientY - bounds.top) * frame.page.heightPt / bounds.height, 0, frame.page.heightPt) };
  };
  const startDrawingText = (event: ReactPointerEvent) => {
    if (!selected || !drawingText || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    drawing.current = { pointerId: event.pointerId, target: event.currentTarget, start: pagePoint(event) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent) => {
    const textDraw = drawing.current;
    if (textDraw && textDraw.pointerId === event.pointerId) {
      const point = pagePoint(event);
      const rect = { x: Math.min(point.x, textDraw.start.x), y: Math.min(point.y, textDraw.start.y), width: Math.abs(point.x - textDraw.start.x), height: Math.abs(point.y - textDraw.start.y) };
      drawing.current = { ...textDraw, rect }; setDrawnTextRect(rect); return;
    }
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const worldDx = (event.clientX - current.startX) / viewportZoom, worldDy = (event.clientY - current.startY) / viewportZoom;
    const pageDx = worldDx / frame.displayScale, pageDy = worldDy / frame.displayScale;
    if (current.kind === "frame") {
      setPreview({ dx: worldDx, dy: worldDy });
      onGeometryPreview?.(frame.id, { x: frame.x + worldDx, y: frame.y + worldDy, ...size });
    }
    else if (current.kind === "scale") {
      const scale = clamp((size.width + worldDx) / frame.page.widthPt, .1, 4);
      setPreview({ dx: 0, dy: 0, scale });
      onGeometryPreview?.(frame.id, { x: frame.x, y: frame.y, width: frame.page.widthPt * scale, height: frame.page.heightPt * scale });
    }
    else if (current.kind === "text" && current.baseRect) {
      const rect = { ...current.baseRect, x: clamp(current.baseRect.x + pageDx, 0, frame.page.widthPt - Math.min(current.baseRect.width, frame.page.widthPt)), y: clamp(current.baseRect.y + pageDy, 0, frame.page.heightPt - Math.min(current.baseRect.height, frame.page.heightPt)) };
      const aligned = alignFrameRect(rect, frame.page, [...frame.page.slots.map((item) => item.rect), ...texts.filter((item) => item.id !== current.textId).map((item) => item.rect)], 8 / (viewportZoom * frame.displayScale));
      setPreview({ dx: 0, dy: 0, rect: aligned.rect, guides: aligned.guides });
    }
    else if (current.kind === "slot" && current.baseRect) {
      const candidate = { ...current.baseRect, x: current.baseRect.x + pageDx, y: current.baseRect.y + pageDy };
      const aligned = alignFrameRect(candidate, frame.page, frame.page.slots.filter((item) => item.id !== current.slotId).map((item) => item.rect), 8 / (viewportZoom * frame.displayScale));
      setPreview({ dx: 0, dy: 0, rect: aligned.rect, guides: aligned.guides });
    }
    else if ((current.kind === "resize-slot" || current.kind === "resize-text") && current.baseRect) setPreview({ dx: 0, dy: 0, rect: resizeSlot(current.baseRect, pageDx, pageDy, current.handle ?? "se", event.shiftKey) });
    else if (current.kind === "crop") {
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
    const textDraw = drawing.current;
    if (textDraw && textDraw.pointerId === event.pointerId) {
      if (textDraw.target.hasPointerCapture(event.pointerId)) textDraw.target.releasePointerCapture(event.pointerId);
      drawing.current = undefined; setDrawnTextRect(undefined);
      if (!cancelled && textDraw.rect && textDraw.rect.width >= FRAME_MM_TO_PT && textDraw.rect.height >= FRAME_MM_TO_PT) {
        const box = createFrameTextBox(frame.page, crypto.randomUUID() as LayoutObjectId, textDraw.rect);
        onExecute({ type: "upsert-frame-text", frameId: frame.id, textBox: box });
        selectSlot(undefined); selectText(box.id); setDrawingText(false); setEditingTextId(box.id);
      }
      return;
    }
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.captureTarget.hasPointerCapture(event.pointerId)) current.captureTarget.releasePointerCapture(event.pointerId);
    drag.current = undefined;
    const value = previewRef.current;
    if (!cancelled && current.kind === "frame" && (Math.abs(value.dx) > .25 || Math.abs(value.dy) > .25)) onExecute({ type: "move-frame", frameId: frame.id, by: { x: value.dx, y: value.dy } });
    if (!cancelled && current.kind === "scale" && value.scale && Math.abs(value.scale - frame.displayScale) > .001) onExecute({ type: "scale-frame", frameId: frame.id, displayScale: value.scale });
    if (!cancelled && (current.kind === "slot" || current.kind === "resize-slot") && value.rect && current.slotId && JSON.stringify(value.rect) !== JSON.stringify(current.baseRect)) {
      onExecute({ type: "transform-frame-slot", frameId: frame.id, slotId: current.slotId, rect: value.rect });
    }
    if (!cancelled && (current.kind === "text" || current.kind === "resize-text") && value.rect && JSON.stringify(value.rect) !== JSON.stringify(current.baseRect)) {
      const box = texts.find((item) => item.id === current.textId);
      if (box) onExecute({ type: "upsert-frame-text", frameId: frame.id, textBox: { ...box, rect: value.rect } });
    }
    if (cancelled && current.kind === "crop" && current.baseCrop) { cropDraftRef.current = current.baseCrop; setCropDraft(current.baseCrop); }
    setPreview({ dx: 0, dy: 0 });
    onGeometryPreview?.(frame.id);
  };
  const finishCrop = () => { if (slot && cropDraft) onExecute({ type: "set-frame-photo-crop", frameId: frame.id, slotId: slot.id, crop: cropDraft }); setCropDraft(undefined); };
  return <article ref={articleRef} data-frame-id={frame.id} className={`table-frame${selected ? " is-selected" : ""}${dropTarget ? " is-drop-target" : ""}`}
    style={{ width: size.width, height: size.height, zIndex: layerZ, transform: `translate3d(${frame.x + preview.dx}px,${frame.y + preview.dy}px,0)` }}
    onPointerMove={move} onPointerUp={end} onPointerCancel={(event) => end(event, true)} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      if (drawingText) { event.preventDefault(); event.stopPropagation(); setDrawingText(false); drawing.current = undefined; setDrawnTextRect(undefined); }
      else if (cropDraft) { event.stopPropagation(); setCropDraft(undefined); }
      else if (drag.current) { event.stopPropagation(); drag.current = undefined; setPreview({ dx: 0, dy: 0 }); onGeometryPreview?.(frame.id); }
    }} onContextMenu={(event) => event.preventDefault()}>
    {(frame.page.bleedPt ?? 0) > 0 && <div className="table-frame-bleed-guide" aria-hidden="true" style={{
      left: -(frame.page.bleedPt ?? 0) * (preview.scale ?? frame.displayScale), top: -(frame.page.bleedPt ?? 0) * (preview.scale ?? frame.displayScale),
      width: (frame.page.widthPt + 2 * (frame.page.bleedPt ?? 0)) * (preview.scale ?? frame.displayScale),
      height: (frame.page.heightPt + 2 * (frame.page.bleedPt ?? 0)) * (preview.scale ?? frame.displayScale),
    }} />}
    <div ref={pageRef} className={`table-frame-page frame-family-${family} frame-style-${frame.page.templateSource.id}${darkPaper ? " is-black" : ""}${drawingText ? " is-drawing-text" : ""}`} style={{ width: frame.page.widthPt, height: frame.page.heightPt, backgroundColor: paper.color, boxShadow: family === "frames" ? edge.shadowStrength ? `0 ${frame.page.widthPt * .02}px ${frame.page.widthPt * .065}px rgb(0 0 0 / ${edge.shadowStrength * .65})` : "none" : undefined, transform: `scale(${preview.scale ?? frame.displayScale})` }}
      onPointerDownCapture={startDrawingText} onPointerDown={(event) => begin(event, "frame")}>
      <LayoutPaperBackdrop paper={paper} />
      {film && <><div className="table-frame-film-surface" aria-hidden="true" /><div className="table-frame-film-heading" style={{ fontSize: frame.page.widthPt * .007 }}>{frame.page.templateSource.id === "sheet-bw" ? "FULL FRAME / CONTACT" : "CONTACT / 01"}<span>{frame.page.templateSource.id === "sheet-bw" ? "B&W · PROOF" : "35 MM · KODAK PORTRA 400"}</span></div></>}
      {family === "frames" && <FrameEdge page={frame.page} />}
      {frame.page.slots.map((item, index) => {
        const chosen = selected && selectedSlotId === item.id;
        const drawn = preview.rect && chosen ? preview.rect : item.rect;
        const displayed = cropDraft && chosen ? { ...item, crop: cropDraft } : item;
        const photoSize = item.photoId ? previews[item.photoId]?.size : undefined;
        const image = photoSize ? resolveFramePhoto(photoSize, drawn, displayed.crop) : undefined;
        const imageX = Math.max(0, image?.x ?? 0), imageY = Math.max(0, image?.y ?? 0);
        const photoRect = { x: imageX, y: imageY, width: Math.min(drawn.width, image ? image.x + image.width : drawn.width) - imageX,
          height: Math.min(drawn.height, image ? image.y + image.height : drawn.height) - imageY };
        return <div key={item.id} data-frame-slot-id={item.id} className={`table-frame-slot${chosen ? " is-selected" : ""}${item.photoId ? " has-photo" : ""}`}
          style={{ left: drawn.x, top: drawn.y, width: drawn.width, height: drawn.height, borderRadius: item.cornerRadiusPt ?? frame.page.cornerRadiusPt ?? 0, boxShadow: family !== "sheets" ? "none" : undefined }}
          onPointerDown={(event) => { event.stopPropagation(); if (event.button !== 0) return; begin(event, cropDraft && chosen ? "crop" : "slot", item); }}
          onContextMenu={(event) => { if (item.photoId && item.crop.mode === "fill") event.preventDefault(); }}
          >
          {item.photoId && (item.photoElevationPt ?? edge.photoElevationPt) > 0 && <span className="table-frame-photo-elevation" aria-hidden="true" style={{ left: photoRect.x, top: photoRect.y, width: photoRect.width, height: photoRect.height,
            borderRadius: item.cornerRadiusPt ?? frame.page.cornerRadiusPt ?? 0, boxShadow: `0 ${item.photoElevationPt ?? edge.photoElevationPt}px ${(item.photoElevationPt ?? edge.photoElevationPt) * 2.5}px rgb(0 0 0 / .3)` }} />}
          <div className="table-frame-photo-clip" style={{ left: photoRect.x, top: photoRect.y, width: photoRect.width, height: photoRect.height, borderRadius: item.cornerRadiusPt ?? frame.page.cornerRadiusPt ?? 0 }}>{item.photoId ? <FrameImage photoId={item.photoId} slot={{ ...displayed, rect: drawn }} preview={previews[item.photoId]} origin={photoRect} onSize={(id, next) => setPreviews((current) => !current[id] || (current[id].size?.width === next.width && current[id].size?.height === next.height) ? current : { ...current, [id]: { ...current[id], size: next } })} missing={missingPhotoIds.has(item.photoId)} /> : <span className="table-frame-empty-slot">{String(index + 1).padStart(2, "0")}<small>DROP PHOTO</small></span>}</div>
          {film && <div className="table-frame-film-code" aria-hidden="true" style={{ height: frame.page.widthPt * (frame.page.templateSource.id === "sheet-proof" ? .025 : .012), fontSize: frame.page.widthPt * (frame.page.templateSource.id === "sheet-proof" ? .006 : .0045) }}><b>{String(index + 1).padStart(2, "0")}</b><span>{frame.page.templateSource.id === "sheet-bw" ? `F${index % 2 ? "11" : "8"} ◃` : "KODAK PORTRA 400"}</span><i>{index + 1}A</i></div>}
          <FramePhotoEdge edge={item.innerEdge ?? innerEdge} rect={photoRect} cornerRadiusPt={item.cornerRadiusPt ?? frame.page.cornerRadiusPt ?? 0} />
          {chosen && !cropDraft && handles.map((handle) => <button key={handle} type="button" className={`table-frame-slot-handle handle-${handle}`} aria-label={`Resize photo frame ${handle}`} onPointerDown={(event) => begin(event, "resize-slot", item, handle)} />)}
        </div>;
      })}
      {texts.map((box) => {
        const chosen = selected && selectedTextId === box.id;
        const rect = chosen && preview.rect && (drag.current?.kind === "text" || drag.current?.kind === "resize-text") ? preview.rect : box.rect;
        const shown = { ...box, rect };
        return <div key={box.id} data-frame-text-id={box.id} className={`table-frame-text-box${chosen ? " is-selected" : ""}${editingTextId === box.id ? " is-editing" : ""}`} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          onPointerDown={(event) => begin(event, "text", undefined, undefined, box)} onDoubleClick={(event) => { event.stopPropagation(); onSelect(frame.id); selectSlot(undefined); selectText(box.id); setEditingTextId(box.id); }}>
          {editingTextId === box.id && chosen ? <textarea ref={textInputRef} autoFocus className="table-frame-text-input" aria-label={zh ? "在文字框内编辑" : "Edit Frame text"} defaultValue={box.text} spellCheck={false}
            style={{ color: box.style.color, fontFamily: layoutFontCssStack(box.style.fontFamily), fontWeight: box.style.fontWeight === "bold" ? 700 : 400, fontStyle: box.style.fontStyle ?? "normal", fontSize: box.style.fontSizePt, lineHeight: `${box.style.fontSizePt * box.style.lineHeight}px`, textAlign: box.style.align }}
            onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onBlur={() => finishTextEditing()}
            onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) { event.preventDefault(); finishTextEditing(event.key === "Escape"); } }} /> : <LayoutTextView box={shown} scale={1} />}
          {chosen && editingTextId !== box.id && handles.map((handle) => <button key={handle} type="button" className={`table-frame-slot-handle table-frame-text-handle handle-${handle}`} aria-label={`Resize text box ${handle}`} onPointerDown={(event) => begin(event, "resize-text", undefined, handle, box)} />)}
        </div>;
      })}
      {drawnTextRect && <div className="table-frame-text-draw-preview" aria-hidden="true" style={{ left: drawnTextRect.x, top: drawnTextRect.y, width: drawnTextRect.width, height: drawnTextRect.height }} />}
      {film && <div className="table-frame-film-grain" aria-hidden="true" />}
      {preview.guides?.length ? <svg className="table-frame-alignment-guides" width={frame.page.widthPt} height={frame.page.heightPt} aria-hidden="true">{preview.guides.map((guide) => guide.axis === "x" ? <line key="x" x1={guide.value} y1={0} x2={guide.value} y2={frame.page.heightPt} /> : <line key="y" x1={0} y1={guide.value} x2={frame.page.widthPt} y2={guide.value} />)}</svg> : null}
    </div>
    <div className="table-frame-title" onPointerDown={(event) => begin(event, "frame")}><strong>{frame.name}</strong><span>{Math.round(frame.page.widthPt / FRAME_MM_TO_PT)} × {Math.round(frame.page.heightPt / FRAME_MM_TO_PT)} mm</span></div>
    {selected && <button type="button" className="table-frame-scale-handle" aria-label="Resize Frame display" onPointerDown={(event) => begin(event, "scale")}>◢</button>}
    {selected && settingsHost && createPortal(<FrameSettingsPanel frame={frame} slot={slot} textBox={textBox} drawingText={drawingText} onStartText={() => { finishTextEditing(); selectSlot(undefined); selectText(undefined); setCropDraft(undefined); setDrawingText((active) => !active); }} cropDraft={cropDraft} onCropDraft={setCropDraft} onFinishCrop={finishCrop} onSelectSlot={selectSlot} onSelectText={selectText} onClose={onClose} onExecute={onExecute}
      exportButton={<FrameJpegExportButton frame={cropDraft && slot ? { ...frame, page: { ...frame.page, slots: frame.page.slots.map((item) => item.id === slot.id ? { ...item, crop: cropDraft } : item) } } : frame} pageRef={pageRef} photoSource={photoSource} />} />, settingsHost)}
  </article>;
}
