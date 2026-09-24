import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { LayoutDocument, LayoutEditCommand, LayoutImageFrame, LayoutObjectId, LayoutPageId, LayoutRect, LayoutTextBox, PhotoId, SequenceDocument } from "../contracts";
import { alignLayoutRect, createImageFrame, drawImageRect, imageFrameAtPageCenter, imageTemplateFrames, panImageCrop, replaceFramePhoto, transformImageRect, zoomImageCropAtPoint, type LayoutAlignmentGuide, type ResizeHandle } from "../modules/layout/layoutImages";
import { facingPageIndices } from "../modules/layout/layoutPages";
import { visiblePhotoRange } from "../modules/sequence/horizontalSequenceViewport";
import { LAYOUT_TEMPLATES, MM_TO_PT, type ImageCrop, type LayoutTemplateId, type TemplateDirection } from "../modules/page-layout/pageGeometry";
import type { AppDependencies } from "./dependencies";
import { LayoutImageFrameView } from "./LayoutImageFrameView";
import { useLocale } from "./locale";
import { PhotoThumb } from "./PhotoThumb";
import { LayoutTextView, useLayoutText } from "./LayoutTextView";

type Point = { x: number; y: number };
type Gesture =
  | { kind: "draw"; pageId: LayoutPageId; pageIndex: number; pointerId: number; start: Point; current: Point }
  | { kind: "frame"; pageId: LayoutPageId; pageIndex: number; pointerId: number; object: LayoutImageFrame | LayoutTextBox; handle: ResizeHandle; start: Point; rect: LayoutRect; guides: readonly LayoutAlignmentGuide[] }
  | { kind: "crop"; pageId: LayoutPageId; pageIndex: number; pointerId: number; frame: LayoutImageFrame; start: Point; initialCrop: ImageCrop; baseCrop: ImageCrop; crop: ImageCrop; quick: boolean; moved: boolean };
const photoDragType = "application/x-photoflex-photo-id";
const templateLabels: Record<LayoutTemplateId, string> = { single: "Single", diptych: "Diptych", triptych: "Triptych", "quad-grid": "Quad Grid", "full-page": "Full Page" };
const newObjectId = () => crypto.randomUUID() as LayoutObjectId;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fieldLabel = (zh: boolean, en: string, chinese: string) => zh ? chinese : en;

function RectNumberField({ label, valuePt, onCommit }: { label: string; valuePt: number; onCommit: (valuePt: number) => boolean }) {
  const formatted = String(+(valuePt / MM_TO_PT).toFixed(1));
  const [value, setValue] = useState(formatted);
  useEffect(() => setValue(formatted), [formatted]);
  return <label className="layout-number-field"><span>{label}</span><input type="number" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={() => {
    if (!value.trim()) { setValue(formatted); return; }
    const next = Number(value) * MM_TO_PT;
    if (!Number.isFinite(next) || Math.abs(next - valuePt) < .001) { setValue(formatted); return; }
    if (!onCommit(next)) setValue(formatted);
  }} /></label>;
}

export function LayoutEditor({ document, sequence, dependencies, selectedIndex, setSelectedIndex, command, onRefreshPhotos, reading }: {
  document: LayoutDocument; sequence: SequenceDocument; dependencies: AppDependencies; selectedIndex: number;
  setSelectedIndex: (index: number) => void; command: (edit: LayoutEditCommand, mergeKey?: string) => boolean; onRefreshPhotos: () => Promise<void>; reading: boolean;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const [facing, setFacing] = useState(true);
  const [zoom, setZoom] = useState(1);
  const viewBeforeReading = useRef({ facing: true, zoom: 1 });
  const wasReading = useRef(false);
  const [tool, setTool] = useState<"select" | "draw">("select");
  const [selectedId, setSelectedId] = useState<LayoutObjectId>();
  const [gesture, setGesture] = useState<Gesture>();
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const [cropDraft, setCropDraft] = useState<{ pageId: LayoutPageId; frameId: LayoutObjectId; crop: ImageCrop }>();
  const cropRef = useRef<typeof cropDraft>(undefined);
  const [templateId, setTemplateId] = useState<LayoutTemplateId>("single");
  const [direction, setDirection] = useState<TemplateDirection>("horizontal");
  const [marginMm, setMarginMm] = useState(12);
  const [gapMm, setGapMm] = useState(6);
  const [templatePhotoItemIds, setTemplatePhotoItemIds] = useState<string[]>([]);
  const [strip, setStrip] = useState({ left: 0, width: 800 });
  const stripRef = useRef<HTMLDivElement>(null);
  const [missingPhotos, setMissingPhotos] = useState<ReadonlySet<PhotoId>>(new Set());
  const [photoSizes, setPhotoSizes] = useState<ReadonlyMap<PhotoId, { width: number; height: number }>>(new Map());
  const [notice, setNotice] = useState<string>();
  const [sourceRevision, setSourceRevision] = useState(0);
  const [textDraft, setTextDraft] = useState<{ id: LayoutObjectId; value: string }>();
  const paperRefs = useRef(new Map<LayoutPageId, HTMLDivElement>());
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = stripRef.current;
    if (!element) return;
    const measure = () => setStrip((current) => ({ left: element.scrollLeft, width: element.clientWidth || current.width }));
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const page = document.pages[selectedIndex];
  const selectedFrame = page?.objects.find((object) => object.id === selectedId && object.kind === "image-frame") as LayoutImageFrame | undefined;
  const selectedText = page?.objects.find((object) => object.id === selectedId && object.kind === "text-box") as LayoutTextBox | undefined;
  const textResult = useLayoutText(selectedText);
  useEffect(() => { if (textDraft && (!selectedText || selectedText.id !== textDraft.id)) setTextDraft(undefined); }, [selectedText, textDraft]);
  const photos = useMemo(() => sequence.items.filter((item) => item.kind === "photo"), [sequence]);
  const templatePhotoIds = templatePhotoItemIds.flatMap((id) => {
    const item = photos.find((photo) => photo.id === id);
    return item ? [item.photoId] : [];
  });
  const sequencePhotoIds = useMemo(() => new Set(photos.map((item) => item.photoId)), [photos]);
  const used = useMemo(() => new Set(document.pages.flatMap((entry) => entry.objects.flatMap((object) => object.kind === "image-frame" && object.photoId ? [object.photoId] : []))), [document]);
  const visible = visiblePhotoRange(strip.left, { count: photos.length, itemWidth: 92, gap: 10, sidePadding: 12, viewportWidth: strip.width });
  const display = facing ? facingPageIndices(document.pages.length, selectedIndex) : [selectedIndex];
  const pageHeight = 450 * zoom;
  const pageWidth = pageHeight * document.pageSpec.widthPt / document.pageSpec.heightPt;

  const setActiveGesture = (next?: Gesture) => { gestureRef.current = next; setGesture(next); };
  const setActiveCrop = (next?: typeof cropDraft) => { cropRef.current = next; setCropDraft(next); };
  useEffect(() => {
    if (reading && !wasReading.current) {
      viewBeforeReading.current = { facing, zoom };
      setActiveGesture(undefined); setActiveCrop(undefined); setTextDraft(undefined);
    } else if (!reading && wasReading.current) {
      setFacing(viewBeforeReading.current.facing); setZoom(viewBeforeReading.current.zoom);
    }
    wasReading.current = reading;
  }, [reading]);
  const markMissing = useCallback((photoId: PhotoId) => setMissingPhotos((current) => current.has(photoId) ? current : new Set([...current, photoId])), []);
  const noteSize = useCallback((photoId: PhotoId, size: { width: number; height: number }) => {
    setPhotoSizes((current) => current.get(photoId)?.width === size.width && current.get(photoId)?.height === size.height
      ? current : new Map(current).set(photoId, size));
    setMissingPhotos((current) => { if (!current.has(photoId)) return current; const next = new Set(current); next.delete(photoId); return next; });
  }, []);
  const updateFrame = (frame: LayoutImageFrame, pageId = page.id) => command({ type: "upsert-object", pageId, object: frame });
  const beginCrop = (frame: LayoutImageFrame, pageId: LayoutPageId) => {
    if (!frame.photoId) return;
    setSelectedId(frame.id);
    setActiveCrop({ pageId, frameId: frame.id, crop: frame.crop });
    setTool("select");
  };
  const finishCrop = () => {
    const draft = cropRef.current;
    if (!draft) return;
    const frame = document.pages.find((entry) => entry.id === draft.pageId)?.objects.find((object) => object.id === draft.frameId);
    if (frame?.kind === "image-frame" && JSON.stringify(frame.crop) !== JSON.stringify(draft.crop)) updateFrame({ ...frame, crop: draft.crop }, draft.pageId);
    setActiveCrop(undefined); setActiveGesture(undefined);
  };
  const cancel = () => { setActiveGesture(undefined); setActiveCrop(undefined); };
  const cancelPointer = () => {
    const current = gestureRef.current;
    if (current?.kind === "crop") setActiveCrop(current.quick ? undefined : { pageId: current.pageId, frameId: current.frame.id, crop: current.initialCrop });
    setActiveGesture(undefined);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (gestureRef.current || cropRef.current) { event.preventDefault(); cancel(); } return; }
      if (event.key === "Enter" && cropRef.current) { event.preventDefault(); finishCrop(); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !reading && !cropRef.current
        && !(event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable='true']")) {
        event.preventDefault(); command({ type: "remove-object", pageId: page.id, objectId: selectedId }); setSelectedId(undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  useEffect(() => { if (selectedId && !page.objects.some((object) => object.id === selectedId)) { setSelectedId(undefined); setActiveCrop(undefined); } }, [page, selectedId]);

  const pointOnPaper = (event: { clientX: number; clientY: number }, paper: HTMLDivElement): Point => {
    const box = paper.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width * document.pageSpec.widthPt,
      y: (event.clientY - box.top) / box.height * document.pageSpec.heightPt };
  };
  const doubleClickPaper = (event: { clientX: number; clientY: number }, pageIndex: number) => {
    const currentPage = document.pages[pageIndex];
    const paper = paperRefs.current.get(currentPage.id);
    if (!paper) return;
    const point = pointOnPaper(event, paper);
    const frame = [...currentPage.objects].reverse().find((object) => object.kind === "image-frame" && object.photoId
      && point.x >= object.rect.x && point.x <= object.rect.x + object.rect.width
      && point.y >= object.rect.y && point.y <= object.rect.y + object.rect.height);
    if (frame?.kind === "image-frame") beginCrop(frame, currentPage.id);
  };
  const pointerStart = (event: ReactPointerEvent, pageIndex: number, frame?: LayoutImageFrame | LayoutTextBox, handle: ResizeHandle = "move") => {
    if (reading) return;
    if (event.button !== 0 && !(event.button === 2 && frame?.kind === "image-frame" && frame.photoId)) return;
    const pageId = document.pages[pageIndex].id;
    const paper = paperRefs.current.get(pageId);
    if (!paper) return;
    event.preventDefault(); event.stopPropagation();
    setSelectedIndex(pageIndex);
    const at = pointOnPaper(event, paper);
    if (frame) {
      setSelectedId(frame.id);
      const draft = cropRef.current;
      if (frame.kind === "image-frame" && (event.button === 2 || (draft?.frameId === frame.id && draft.pageId === pageId))) {
        const activeDraft = draft?.frameId === frame.id && draft.pageId === pageId ? draft : undefined;
        const initialCrop = activeDraft?.crop ?? frame.crop;
        const quick = event.button === 2 && !activeDraft;
        const baseCrop = quick && initialCrop.mode === "fit" ? { ...initialCrop, mode: "fill" as const } : initialCrop;
        setActiveCrop({ pageId, frameId: frame.id, crop: baseCrop });
        setActiveGesture({ kind: "crop", pageId, pageIndex, pointerId: event.pointerId, frame, start: at, initialCrop, baseCrop, crop: baseCrop, quick, moved: false });
      }
      else { if (draft) setActiveCrop(undefined); setActiveGesture({ kind: "frame", pageId, pageIndex, pointerId: event.pointerId, object: frame, handle, start: at, rect: frame.rect, guides: [] }); }
    } else if (tool === "draw") {
      setSelectedId(undefined);
      setActiveGesture({ kind: "draw", pageId, pageIndex, pointerId: event.pointerId, start: at, current: at });
    } else { setSelectedId(undefined); setActiveCrop(undefined); }
    paper.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent, pageIndex: number) => {
    const current = gestureRef.current;
    if (!current || current.pageIndex !== pageIndex || current.pointerId !== event.pointerId) return;
    const paper = paperRefs.current.get(current.pageId);
    if (!paper) return;
    const at = pointOnPaper(event, paper);
    if (current.kind === "draw") setActiveGesture({ ...current, current: at });
    else if (current.kind === "frame") {
      const candidate = transformImageRect(current.object.rect, current.handle,
        at.x - current.start.x, at.y - current.start.y, document.pageSpec);
      const otherRects = document.pages[pageIndex].objects.filter((object) => object.id !== current.object.id).map((object) => object.rect);
      const thresholdPt = 7 * document.pageSpec.widthPt / paper.getBoundingClientRect().width;
      const aligned = alignLayoutRect(candidate, current.handle, document.pageSpec, otherRects, thresholdPt);
      setActiveGesture({ ...current, rect: aligned.rect, guides: aligned.guides });
    }
    else {
      const size = current.frame.photoId && photoSizes.get(current.frame.photoId);
      if (!size) return;
      const crop = panImageCrop(current.baseCrop, size, current.frame.rect, at.x - current.start.x, at.y - current.start.y);
      setActiveGesture({ ...current, crop, moved: Math.hypot(at.x - current.start.x, at.y - current.start.y) > 1 });
      setActiveCrop({ pageId: current.pageId, frameId: current.frame.id, crop });
    }
  };
  const pointerEnd = (event: ReactPointerEvent, pageIndex: number) => {
    const current = gestureRef.current;
    if (!current || current.pageIndex !== pageIndex || current.pointerId !== event.pointerId) return;
    const paper = paperRefs.current.get(current.pageId);
    if (paper?.hasPointerCapture?.(event.pointerId)) paper.releasePointerCapture(event.pointerId);
    setActiveGesture(undefined);
    if (current.kind === "draw") {
      const rect = drawImageRect(current.start, current.current, document.pageSpec);
      if (rect) { const frame = createImageFrame(newObjectId(), rect); updateFrame(frame, current.pageId); setSelectedId(frame.id); setTool("select"); }
    } else if (current.kind === "frame" && JSON.stringify(current.rect) !== JSON.stringify(current.object.rect)) {
      command({ type: "upsert-object", pageId: current.pageId, object: { ...current.object, rect: current.rect } });
    } else if (current.kind === "crop" && current.quick) {
      if (current.moved && JSON.stringify(current.crop) !== JSON.stringify(current.initialCrop)) updateFrame({ ...current.frame, crop: current.crop }, current.pageId);
      setActiveCrop(undefined);
    }
  };
  const wheelCrop = (event: ReactWheelEvent, frame: LayoutImageFrame, pageIndex: number) => {
    if (reading) return;
    const draft = cropRef.current;
    if (!draft || draft.frameId !== frame.id || draft.pageId !== document.pages[pageIndex].id || !frame.photoId) return;
    const size = photoSizes.get(frame.photoId);
    if (!size) return;
    event.preventDefault(); event.stopPropagation();
    const paper = paperRefs.current.get(draft.pageId);
    if (!paper) return;
    const point = pointOnPaper(event, paper);
    const zoom = draft.crop.zoom * Math.exp(-event.deltaY * .002);
    setActiveCrop({ ...draft, crop: zoomImageCropAtPoint(draft.crop, size, frame.rect, zoom,
      { x: point.x - frame.rect.x, y: point.y - frame.rect.y }) });
  };
  const insertPhoto = (photoId: PhotoId, pageIndex = selectedIndex, at?: Point, targetFrame?: LayoutImageFrame) => {
    const targetPage = document.pages[pageIndex];
    if (targetFrame) { updateFrame(replaceFramePhoto(targetFrame, photoId), targetPage.id); setSelectedId(targetFrame.id); return; }
    const frame = at ? createImageFrame(newObjectId(), {
      x: clamp(at.x - document.pageSpec.widthPt * .2, 0, document.pageSpec.widthPt * .6),
      y: clamp(at.y - document.pageSpec.heightPt * .2, 0, document.pageSpec.heightPt * .6),
      width: document.pageSpec.widthPt * .4, height: document.pageSpec.heightPt * .4,
    }, photoId) : imageFrameAtPageCenter(newObjectId(), document.pageSpec, photoId);
    updateFrame(frame, targetPage.id); setSelectedId(frame.id); setSelectedIndex(pageIndex);
  };
  const dropPhoto = (event: DragEvent, pageIndex: number, frame?: LayoutImageFrame) => {
    event.preventDefault(); event.stopPropagation();
    const photoId = event.dataTransfer.getData(photoDragType) as PhotoId;
    if (!photos.some((item) => item.photoId === photoId)) return;
    const paper = paperRefs.current.get(document.pages[pageIndex].id);
    insertPhoto(photoId, pageIndex, frame || !paper ? undefined : pointOnPaper(event, paper), frame);
  };
  const applyTemplate = () => {
    const existing = page.objects.filter((object) => object.kind === "image-frame").length;
    if (existing && !window.confirm(zh ? `将替换当前页的 ${existing} 个图像框，文字框保留。继续吗？` : `Replace ${existing} image frame(s) on this page? Text boxes will stay.`)) return;
    try {
      const frames = imageTemplateFrames({ id: templateId, direction, spec: document.pageSpec, marginMm, gapMm,
        photoIds: templatePhotoIds, newId: newObjectId });
      if (command({ type: "replace-image-frames", pageId: page.id, frames })) { setSelectedId(undefined); setTemplatePhotoItemIds([]); setNotice(undefined); }
    } catch { setNotice(zh ? "模板边距或间距超出页面。" : "Template margins or gap leave too little room."); }
  };
  const formatRect = (rect: LayoutRect) => ({ left: `${rect.x / document.pageSpec.widthPt * 100}%`, top: `${rect.y / document.pageSpec.heightPt * 100}%`,
    width: `${rect.width / document.pageSpec.widthPt * 100}%`, height: `${rect.height / document.pageSpec.heightPt * 100}%` });
  const selectedObject = selectedFrame ?? selectedText;
  const updateText = (box: LayoutTextBox, mergeKey?: string) => command({ type: "upsert-object", pageId: page.id, object: box }, mergeKey);
  const rectField = (axis: keyof LayoutRect, label: string) => selectedObject && <RectNumberField key={`${selectedObject.id}-${axis}`} label={label} valuePt={selectedObject.rect[axis]} onCommit={(value) => command({ type: "upsert-object", pageId: page.id, object: { ...selectedObject, rect: { ...selectedObject.rect, [axis]: value } } })} />;
  const addText = () => {
    const box: LayoutTextBox = { kind: "text-box", id: newObjectId(), rect: { x: document.pageSpec.widthPt * .15, y: document.pageSpec.heightPt * .15,
      width: document.pageSpec.widthPt * .7, height: document.pageSpec.heightPt * .25 }, text: "",
      style: { fontFamily: "noto-sans-sc", fontSizePt: 12, lineHeight: 1.4, color: "#171513", align: "left" } };
    if (updateText(box)) { setSelectedId(box.id); setTool("select"); }
  };
  const focusTextAt = (index: number) => { textInputRef.current?.focus(); textInputRef.current?.setSelectionRange(index, index + 1); };
  return <>
    <section className="layout-center">
      <div className="layout-view-controls">{reading && <div className="layout-reader-navigation"><button disabled={selectedIndex === 0} onClick={() => setSelectedIndex(selectedIndex - 1)}>{fieldLabel(zh, "Previous", "上一页")}</button><span>{selectedIndex + 1} / {document.pages.length}</span><button disabled={selectedIndex === document.pages.length - 1} onClick={() => setSelectedIndex(selectedIndex + 1)}>{fieldLabel(zh, "Next", "下一页")}</button></div>}<div role="group" aria-label={fieldLabel(zh, "Page view", "页面查看方式")}><button aria-pressed={!facing} onClick={() => setFacing(false)}>{fieldLabel(zh, "Single", "单页")}</button><button aria-pressed={facing} onClick={() => setFacing(true)}>{fieldLabel(zh, "Facing pages", "对页")}</button></div><div><button onClick={() => setZoom(1)}>{fieldLabel(zh, "Fit page", "适应页面")}</button><button disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button disabled={zoom >= 1.5} onClick={() => setZoom(Math.min(1.5, zoom + .1))}>＋</button></div></div>
      {!reading && <div className="layout-image-toolbar"><button aria-pressed={tool === "select"} onClick={() => setTool("select")}>{fieldLabel(zh, "Select", "选择")}</button><button aria-pressed={tool === "draw"} onClick={() => setTool("draw")}>{fieldLabel(zh, "Draw frame", "画图像框")}</button><button onClick={() => { const frame = imageFrameAtPageCenter(newObjectId(), document.pageSpec, null); updateFrame(frame); setSelectedId(frame.id); }}>{fieldLabel(zh, "Add empty frame", "添加空图像框")}</button><button onClick={addText}>{fieldLabel(zh, "Add text box", "添加文字框")}</button><span>{fieldLabel(zh, "Drag a photo onto a page or frame", "可把照片拖入页面或图像框")}</span></div>}
      <div className="layout-stage"><div className="layout-spread" style={{ width: display.length * pageWidth, height: pageHeight }}>{display.map((index, slot) => index === null ? <div className="layout-paper-placeholder" key={`empty-${slot}`} aria-label={fieldLabel(zh, "Facing page placeholder", "对页占位")} style={{ width: pageWidth, height: pageHeight }} /> : <div key={document.pages[index].id} ref={(element) => { if (element) paperRefs.current.set(document.pages[index].id, element); else paperRefs.current.delete(document.pages[index].id); }} className={`layout-paper${index === selectedIndex ? " is-current" : ""}${tool === "draw" ? " is-drawing" : ""}`} style={{ width: pageWidth, height: pageHeight }} aria-label={fieldLabel(zh, `Page ${index + 1}`, `第 ${index + 1} 页`)} onPointerDown={(event) => pointerStart(event, index)} onPointerMove={(event) => pointerMove(event, index)} onPointerUp={(event) => pointerEnd(event, index)} onPointerCancel={cancelPointer} onDoubleClick={(event) => { if (!reading) doubleClickPaper(event, index); }} onDragOver={(event) => { if (!reading) event.preventDefault(); }} onDrop={(event) => { if (!reading) dropPhoto(event, index); }}>
        {document.pages[index].objects.map((object) => {
          const currentGesture = gesture?.kind === "frame" && gesture.object.id === object.id ? gesture : undefined;
          const rect = currentGesture?.rect ?? object.rect;
          const shown = object.kind === "image-frame" ? { ...object, rect, crop: !reading && cropDraft?.frameId === object.id ? cropDraft.crop : object.crop } : object;
          return <div key={object.id} className={`layout-object layout-object-${object.kind}${object.id === selectedId ? " is-selected" : ""}${!reading && cropDraft?.frameId === object.id ? " is-cropping" : ""}`} style={formatRect(rect)} onClick={(event) => { if (reading) return; event.stopPropagation(); setSelectedIndex(index); setSelectedId(object.id); }} onDoubleClick={(event) => { if (reading) return; event.stopPropagation(); if (object.kind === "image-frame") beginCrop(object, document.pages[index].id); }} onPointerDown={!reading ? (event) => pointerStart(event, index, object) : undefined} onWheel={!reading && object.kind === "image-frame" ? (event) => wheelCrop(event, object, index) : undefined} onContextMenu={!reading && object.kind === "image-frame" && object.photoId ? (event) => event.preventDefault() : undefined} onDragOver={!reading && object.kind === "image-frame" ? (event) => event.preventDefault() : undefined} onDrop={!reading && object.kind === "image-frame" ? (event) => dropPhoto(event, index, object) : undefined}>
            {shown.kind === "image-frame" ? <><LayoutImageFrameView frame={shown} photoSource={dependencies.photoSource} sourceRevision={sourceRevision} onMetadata={noteSize} onMissing={markMissing} />{shown.photoId && (!sequencePhotoIds.has(shown.photoId) || missingPhotos.has(shown.photoId)) && <span className="layout-image-warning">{fieldLabel(zh, "Photo unavailable", "照片不可用")}</span>}</> : <LayoutTextView box={{ ...shown, rect }} scale={pageHeight / document.pageSpec.heightPt} reading={reading} zh={zh} />}
            {!reading && object.kind === "image-frame" && cropDraft?.frameId === object.id && gesture?.kind !== "crop" && <div className="layout-crop-overlay" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><span>{fieldLabel(zh, `Drag photo · scroll to zoom · ${Math.round(cropDraft.crop.zoom * 100)}%`, `拖动照片 · 滚轮缩放 · ${Math.round(cropDraft.crop.zoom * 100)}%`)}</span><div><button onClick={cancel}>{fieldLabel(zh, "Cancel", "取消")}</button><button onClick={finishCrop}>{fieldLabel(zh, "Done", "完成")}</button></div></div>}
            {!reading && object.id === selectedId && !cropDraft && (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => <button key={handle} className={`layout-resize-handle is-${handle}`} aria-label={`Resize ${handle}`} onPointerDown={(event) => pointerStart(event, index, object, handle)} />)}
          </div>;
        })}
        {!reading && gesture?.kind === "frame" && gesture.pageIndex === index && gesture.guides.length > 0 && <svg className="layout-alignment-guides" width="100%" height="100%" viewBox={`0 0 ${document.pageSpec.widthPt} ${document.pageSpec.heightPt}`} aria-hidden="true">{gesture.guides.map((guide) => guide.axis === "x" ? <line key="x" x1={guide.value} y1={0} x2={guide.value} y2={document.pageSpec.heightPt} /> : <line key="y" x1={0} y1={guide.value} x2={document.pageSpec.widthPt} y2={guide.value} />)}</svg>}
        {gesture?.kind === "draw" && gesture.pageIndex === index && drawImageRect(gesture.start, gesture.current, document.pageSpec) && <div className="layout-draw-preview" style={formatRect(drawImageRect(gesture.start, gesture.current, document.pageSpec)!)} />}
        <span className="layout-paper-number">{index + 1}</span>
      </div>)}</div></div>
      {!reading && <div className="layout-photo-tray"><div className="layout-panel-heading"><strong>{fieldLabel(zh, "Sequence photos", "Sequence 照片")}</strong><span>{photos.length}</span><button className="layout-photo-refresh" onClick={() => { void onRefreshPhotos().then(() => { setMissingPhotos(new Set()); setSourceRevision((value) => value + 1); }); }}>{fieldLabel(zh, "Refresh", "刷新")}</button></div><div ref={stripRef} className="layout-photo-scroll" onScroll={(event) => setStrip({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth || 800 })}><div className="layout-photo-track" style={{ width: Math.max(0, photos.length * 102 + 14) }}>{photos.slice(visible.start, visible.end).map((item, offset) => {
        const index = visible.start + offset;
        return <div key={item.id} className="layout-photo-item" style={{ left: 12 + index * 102 }} draggable onDragStart={(event) => { event.dataTransfer.setData(photoDragType, item.photoId); event.dataTransfer.effectAllowed = "copy"; }}>
          <button className="layout-photo-insert" aria-label={`Insert photo ${index + 1}`} onClick={() => insertPhoto(item.photoId, selectedIndex, undefined, selectedFrame)}><PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} sourceRevision={sourceRevision} alt="" onError={markMissing} /></button>
          <label className="layout-photo-select"><input type="checkbox" checked={templatePhotoItemIds.includes(item.id)} aria-label={`Select photo ${index + 1} for template`} onChange={(event) => setTemplatePhotoItemIds((current) => event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id))} />{index + 1}{used.has(item.photoId) ? " · Used" : ""}{missingPhotos.has(item.photoId) ? " · Missing" : ""}</label>
        </div>;
      })}</div></div></div>}
    </section>
    {!reading && <aside className="layout-properties-panel table-frame-panel" aria-label={fieldLabel(zh, "Page properties", "页面属性")}>
      <header className="table-frame-panel-header"><div><strong>{fieldLabel(zh, "Layout settings", "Layout 设置")}</strong><small>{templateLabels[templateId]} · {page.objects.filter((object) => object.kind === "image-frame").length} {fieldLabel(zh, "image frames", "个图像框")}</small></div></header>
      <div className="table-frame-inspector">
        <section className="table-frame-section"><h3>{fieldLabel(zh, "TEMPLATE", "模板")}</h3><div className="table-frame-template-strip layout-template-strip" role="group" aria-label="Template">
          {LAYOUT_TEMPLATES.map((id) => <button key={id} type="button" title={templateLabels[id]} aria-label={`${templateLabels[id]} template`} aria-pressed={templateId === id} onClick={() => setTemplateId(id)}><span className={`table-frame-mini mini-${id}`} aria-hidden="true" /></button>)}
        </div><p className="table-frame-hint">{fieldLabel(zh, `${templatePhotoIds.length} selected photos fill frames in order.`, `已选 ${templatePhotoIds.length} 张照片，按顺序填框。`)}</p><button className="layout-apply-template" onClick={applyTemplate}>{fieldLabel(zh, "Apply to current page", "应用到当前页")}</button>{notice && <p role="alert">{notice}</p>}</section>
        {(templateId === "diptych" || templateId === "triptych") && <section className="table-frame-section"><h3>{fieldLabel(zh, "DIRECTION", "方向")}</h3><div className="table-frame-segments" role="group" aria-label="Template direction"><button aria-pressed={direction === "horizontal"} onClick={() => setDirection("horizontal")}>{fieldLabel(zh, "Across", "左右")}</button><button aria-pressed={direction === "vertical"} onClick={() => setDirection("vertical")}>{fieldLabel(zh, "Down", "上下")}</button></div></section>}
        <section className="table-frame-section"><h3>{fieldLabel(zh, "SPACING (MM)", "间距 (MM)")}</h3><div className="table-frame-field-grid"><label className="layout-number-field"><span>{fieldLabel(zh, "Margin", "边距")}</span><input type="number" min="0" max="100" step="1" value={marginMm} onChange={(event) => setMarginMm(Number(event.target.value))} /></label><label className="layout-number-field"><span>{fieldLabel(zh, "Gap", "框距")}</span><input type="number" min="0" max="100" step="1" value={gapMm} onChange={(event) => setGapMm(Number(event.target.value))} /></label></div></section>
        {selectedFrame ? <>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "IMAGE FRAME", "图像框")}</h3><div className="table-frame-field-grid layout-property-grid">{rectField("x", "X mm")}{rectField("y", "Y mm")}{rectField("width", "W mm")}{rectField("height", "H mm")}</div></section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "PHOTO FIT", "照片适配")}</h3><div className="table-frame-segments" role="group" aria-label="Photo fit"><button aria-pressed={(cropDraft?.crop ?? selectedFrame.crop).mode === "fit"} onClick={() => cropDraft ? setActiveCrop({ ...cropDraft, crop: { ...cropDraft.crop, mode: "fit", zoom: 1 } }) : updateFrame({ ...selectedFrame, crop: { ...selectedFrame.crop, mode: "fit", zoom: 1 } })}>Fit</button><button aria-pressed={(cropDraft?.crop ?? selectedFrame.crop).mode === "fill"} onClick={() => cropDraft ? setActiveCrop({ ...cropDraft, crop: { ...cropDraft.crop, mode: "fill", zoom: 1 } }) : updateFrame({ ...selectedFrame, crop: { ...selectedFrame.crop, mode: "fill", zoom: 1 } })}>Fill</button></div><p className="table-frame-hint">{fieldLabel(zh, "Double-click to crop, then drag the photo and scroll to zoom. Right-drag to adjust directly.", "双击照片进入裁切，拖动照片并滚轮缩放；右键拖动可直接调整。")}</p><div className="table-frame-action-row"><button onClick={() => beginCrop(selectedFrame, page.id)} disabled={!selectedFrame.photoId}>{fieldLabel(zh, "Crop photo", "裁切照片")}</button><button onClick={() => updateFrame(replaceFramePhoto(selectedFrame, null))}>{fieldLabel(zh, "Clear photo", "清空照片")}</button></div></section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "LAYER ORDER", "图层顺序")}</h3><div className="table-frame-action-row"><button disabled={page.objects[0]?.id === selectedFrame.id} onClick={() => command({ type: "move-object", pageId: page.id, objectId: selectedFrame.id, to: page.objects.findIndex((object) => object.id === selectedFrame.id) - 1 })}>{fieldLabel(zh, "Backward", "后移")}</button><button disabled={page.objects.at(-1)?.id === selectedFrame.id} onClick={() => command({ type: "move-object", pageId: page.id, objectId: selectedFrame.id, to: page.objects.findIndex((object) => object.id === selectedFrame.id) + 1 })}>{fieldLabel(zh, "Forward", "前移")}</button></div></section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "FRAME ACTIONS", "图像框操作")}</h3><div className="table-frame-action-row"><button onClick={() => { const duplicate = { ...selectedFrame, id: newObjectId(), rect: { ...selectedFrame.rect, x: clamp(selectedFrame.rect.x + 5 * MM_TO_PT, MM_TO_PT - selectedFrame.rect.width, document.pageSpec.widthPt - MM_TO_PT) } }; if (updateFrame(duplicate)) setSelectedId(duplicate.id); }}>{fieldLabel(zh, "Duplicate", "复制框")}</button><button className="is-danger" onClick={() => { command({ type: "remove-object", pageId: page.id, objectId: selectedFrame.id }); setSelectedId(undefined); }}>{fieldLabel(zh, "Delete frame", "删除框")}</button></div><p className="table-frame-hint">{selectedFrame.photoId ? !sequencePhotoIds.has(selectedFrame.photoId) ? fieldLabel(zh, "Photo removed from Sequence; reference kept.", "照片已从 Sequence 移除，引用仍保留。") : missingPhotos.has(selectedFrame.photoId) ? fieldLabel(zh, "Photo unavailable; reference kept.", "照片不可用，引用仍保留。") : fieldLabel(zh, "Click or drop another photo to replace.", "点击或拖入照片可替换。") : fieldLabel(zh, "This frame is empty.", "此图像框为空。")}</p></section>
        </> : selectedText ? <>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "TEXT BOX", "文字框")}</h3>
            <textarea ref={textInputRef} className="layout-text-input" aria-label={fieldLabel(zh, "Text content", "文字内容")} value={textDraft?.id === selectedText.id ? textDraft.value : selectedText.text}
              onCompositionStart={() => setTextDraft({ id: selectedText.id, value: selectedText.text })}
              onCompositionEnd={(event) => { const value = event.currentTarget.value; setTextDraft(undefined); if (value !== selectedText.text) updateText({ ...selectedText, text: value }, `text:${selectedText.id}`); }}
              onChange={(event) => { const value = event.target.value; if ((event.nativeEvent as InputEvent).isComposing || textDraft?.id === selectedText.id) setTextDraft({ id: selectedText.id, value }); else if (value !== selectedText.text) updateText({ ...selectedText, text: value }, `text:${selectedText.id}`); }}
              onBlur={(event) => { if (textDraft?.id === selectedText.id) { if (event.currentTarget.value !== selectedText.text) updateText({ ...selectedText, text: event.currentTarget.value }, `text:${selectedText.id}`); setTextDraft(undefined); } }} />
            <div className="table-frame-field-grid layout-property-grid">{rectField("x", "X mm")}{rectField("y", "Y mm")}{rectField("width", "W mm")}{rectField("height", "H mm")}</div>
          </section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "TYPE", "排版")}</h3>
            <div className="table-frame-field-grid layout-property-grid"><RectNumberField label={fieldLabel(zh, "Size pt", "字号 pt")} valuePt={selectedText.style.fontSizePt * MM_TO_PT} onCommit={(value) => updateText({ ...selectedText, style: { ...selectedText.style, fontSizePt: value / MM_TO_PT } })} /><label className="layout-number-field"><span>{fieldLabel(zh, "Line height", "行距")}</span><input type="number" min="0.8" max="3" step="0.1" value={selectedText.style.lineHeight} onChange={(event) => updateText({ ...selectedText, style: { ...selectedText.style, lineHeight: Number(event.target.value) } })} /></label></div>
            <label className="layout-number-field"><span>{fieldLabel(zh, "Colour", "颜色")}</span><input className="layout-text-colour" type="color" value={selectedText.style.color} onChange={(event) => updateText({ ...selectedText, style: { ...selectedText.style, color: event.target.value } })} /></label>
            <div className="table-frame-segments" role="group" aria-label={fieldLabel(zh, "Text alignment", "文字对齐")}>{(["left", "center", "right"] as const).map((align) => <button key={align} aria-pressed={selectedText.style.align === align} onClick={() => updateText({ ...selectedText, style: { ...selectedText.style, align } })}>{align === "left" ? fieldLabel(zh, "Left", "左") : align === "center" ? fieldLabel(zh, "Centre", "中") : fieldLabel(zh, "Right", "右")}</button>)}</div>
            {textResult?.overflowLine !== null && textResult && <p role="alert">{fieldLabel(zh, `Text overflows at line ${textResult.overflowLine + 1}. Enlarge the box or reduce the type size.`, `第 ${textResult.overflowLine + 1} 行溢出，请增大文字框或缩小字号。`)} <button onClick={() => focusTextAt(textResult.lines[textResult.overflowLine!].start)}>{fieldLabel(zh, "Locate", "定位")}</button></p>}
            {!!textResult?.missing.length && <p role="alert">{fieldLabel(zh, `Missing glyph: ${textResult.missing[0].character} at character ${textResult.missing[0].index + 1}.`, `缺字：第 ${textResult.missing[0].index + 1} 个字符“${textResult.missing[0].character}”。`)} <button onClick={() => focusTextAt(textResult.missing[0].index)}>{fieldLabel(zh, "Locate", "定位")}</button></p>}
          </section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "TEXT ACTIONS", "文字框操作")}</h3><div className="table-frame-action-row"><button onClick={() => { const duplicate = { ...selectedText, id: newObjectId() }; if (updateText(duplicate)) setSelectedId(duplicate.id); }}>{fieldLabel(zh, "Duplicate", "复制")}</button><button className="is-danger" onClick={() => { command({ type: "remove-object", pageId: page.id, objectId: selectedText.id }); setSelectedId(undefined); }}>{fieldLabel(zh, "Delete", "删除")}</button></div></section>
        </> : <section className="table-frame-section"><h3>{fieldLabel(zh, "PAGE", "页面")}</h3><dl><dt>{fieldLabel(zh, "Size", "尺寸")}</dt><dd>{(document.pageSpec.widthPt / MM_TO_PT).toFixed(1)} × {(document.pageSpec.heightPt / MM_TO_PT).toFixed(1)} mm</dd><dt>{fieldLabel(zh, "Current page", "当前页")}</dt><dd>{selectedIndex + 1} / {document.pages.length}</dd><dt>{fieldLabel(zh, "Objects", "对象")}</dt><dd>{page.objects.length}</dd></dl></section>}
      </div>
    </aside>}
  </>;
}
