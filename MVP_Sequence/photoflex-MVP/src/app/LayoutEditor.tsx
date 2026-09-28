import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { LayoutDocument, LayoutEditCommand, LayoutFontFamily, LayoutImageFrame, LayoutObjectId, LayoutPageId, LayoutRect, LayoutTextBox, PhotoId, SequenceDocument } from "../contracts";
import { alignLayoutRect, createImageFrame, drawImageRect, imageTemplateFrames, panImageCrop, replaceFramePhoto, transformImageRect, zoomImageCropAtPoint, type LayoutAlignmentGuide, type ResizeHandle } from "../modules/layout/layoutImages";
import { DEFAULT_LAYOUT_FONT, LAYOUT_FONTS, layoutFontCssStack, layoutFontStyle, layoutFontWeight } from "../modules/layout/layoutFonts";
import { facingPageIndices } from "../modules/layout/layoutPages";
import { visiblePhotoRange } from "../modules/sequence/horizontalSequenceViewport";
import { LAYOUT_TEMPLATES, MM_TO_PT, PAGE_PRESETS_MM, type ImageCrop, type LayoutTemplateId } from "../modules/page-layout/pageGeometry";
import type { AppDependencies } from "./dependencies";
import { LayoutObjectVisual, layoutObjectStyle } from "./LayoutPageSurface";
import { useLocale } from "./locale";
import { PhotoThumb } from "./PhotoThumb";
import undoIcon from "../assets/icons/table-undo.svg";
import redoIcon from "../assets/icons/table-redo.svg";
import "../styles/table-frame.css";

type Point = { x: number; y: number };
type Gesture =
  | { kind: "marquee"; pageId: LayoutPageId; pageIndex: number; pointerId: number; start: Point; current: Point; additive: boolean }
  | { kind: "group"; pageId: LayoutPageId; pageIndex: number; pointerId: number; start: Point; dx: number; dy: number; objects: readonly { pageId: LayoutPageId; pageIndex: number; object: LayoutImageFrame | LayoutTextBox }[] }
  | { kind: "draw"; objectKind: "image-frame" | "text-box"; pageId: LayoutPageId; pageIndex: number; pointerId: number; start: Point; current: Point }
  | { kind: "frame"; pageId: LayoutPageId; pageIndex: number; pointerId: number; object: LayoutImageFrame | LayoutTextBox; handle: ResizeHandle; start: Point; rect: LayoutRect; guides: readonly LayoutAlignmentGuide[] }
  | { kind: "crop"; pageId: LayoutPageId; pageIndex: number; pointerId: number; frame: LayoutImageFrame; start: Point; initialCrop: ImageCrop; baseCrop: ImageCrop; crop: ImageCrop; quick: boolean; moved: boolean };
const photoDragType = "application/x-photoflex-photo-id";
const templateLabels: Record<LayoutTemplateId, string> = { single: "Single", diptych: "Diptych", triptych: "Triptych", "quad-grid": "Quad Grid", "full-page": "Full Page" };
const newObjectId = () => crypto.randomUUID() as LayoutObjectId;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fieldLabel = (zh: boolean, en: string, chinese: string) => zh ? chinese : en;

function RectNumberField({ label, valuePt, onCommit, step = .1, min, max }: {
  label: string; valuePt: number; onCommit: (valuePt: number) => boolean; step?: number; min?: number; max?: number;
}) {
  const formatted = String(+(valuePt / MM_TO_PT).toFixed(1));
  const [value, setValue] = useState(formatted);
  useEffect(() => setValue(formatted), [formatted]);
  return <label className={`layout-number-field${/^[XYWH] mm$/.test(label) ? " layout-position-field" : ""}`}><span title={label}>{label.replace(/ mm$/, "")}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={() => {
    if (!value.trim()) { setValue(formatted); return; }
    const next = Number(value) * MM_TO_PT;
    if (!Number.isFinite(next) || Math.abs(next - valuePt) < .001) { setValue(formatted); return; }
    if (!onCommit(next)) setValue(formatted);
  }} /></label>;
}

function LayoutPageSizeControl({ pageSpec, command, zh }: {
  pageSpec: LayoutDocument["pageSpec"]; command: (edit: LayoutEditCommand) => boolean; zh: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const widthInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const mm = (pt: number) => +(pt / MM_TO_PT).toFixed(1);
  const currentPreset = Object.entries(PAGE_PRESETS_MM).find(([, [width, height]]) =>
    Math.abs(Math.min(width, height) - Math.min(mm(pageSpec.widthPt), mm(pageSpec.heightPt))) < .1
    && Math.abs(Math.max(width, height) - Math.max(mm(pageSpec.widthPt), mm(pageSpec.heightPt))) < .1)?.[0] ?? "Custom";
  const resize = (widthPt: number, heightPt: number) => command({ type: "set-page-size", widthPt, heightPt });
  const commitDimension = (axis: "width" | "height", input: HTMLInputElement) => {
    const value = Number(input.value);
    const current = axis === "width" ? pageSpec.widthPt : pageSpec.heightPt;
    if (!input.value || !Number.isFinite(value) || value < 50 || value > 600) { input.value = String(mm(current)); return; }
    if (Math.abs(value * MM_TO_PT - current) < .001) return;
    if (!resize(axis === "width" ? value * MM_TO_PT : pageSpec.widthPt, axis === "height" ? value * MM_TO_PT : pageSpec.heightPt)) input.value = String(mm(current));
  };
  return <div className="layout-page-size-control" ref={root} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <button type="button" className="layout-size-chip" aria-label={fieldLabel(zh, "Page size", "页面尺寸")} aria-expanded={open} aria-controls="layout-page-size-popover" onClick={() => setOpen((value) => !value)}><small>{fieldLabel(zh, "SIZE", "尺寸")}</small><span>{currentPreset === "Custom" ? `${mm(pageSpec.widthPt)} × ${mm(pageSpec.heightPt)} mm` : currentPreset}</span><span aria-hidden="true">⌄</span></button>
    {open && <div className="layout-page-size-popover" id="layout-page-size-popover"><h3>{fieldLabel(zh, "PAGE SIZE", "页面尺寸")}</h3>
      <div className="table-frame-preset-strip" role="group" aria-label={fieldLabel(zh, "Page size presets", "页面尺寸预设")}>
        {(Object.keys(PAGE_PRESETS_MM) as (keyof typeof PAGE_PRESETS_MM)[]).map((preset) => <button key={preset} type="button" aria-pressed={currentPreset === preset} onClick={() => { const [width, height] = PAGE_PRESETS_MM[preset]; resize(width * MM_TO_PT, height * MM_TO_PT); }}>{preset}</button>)}
        <button type="button" aria-pressed={currentPreset === "Custom"} onClick={() => widthInput.current?.focus()}>{fieldLabel(zh, "Custom", "自定义")}</button>
      </div>
      <div className="table-frame-segments table-frame-orientation" role="group" aria-label={fieldLabel(zh, "Orientation", "方向")}>
        <button type="button" aria-pressed={pageSpec.widthPt <= pageSpec.heightPt} onClick={() => resize(Math.min(pageSpec.widthPt, pageSpec.heightPt), Math.max(pageSpec.widthPt, pageSpec.heightPt))}>{fieldLabel(zh, "▯ Portrait", "▯ 竖向")}</button>
        <button type="button" aria-pressed={pageSpec.widthPt > pageSpec.heightPt} onClick={() => resize(Math.max(pageSpec.widthPt, pageSpec.heightPt), Math.min(pageSpec.widthPt, pageSpec.heightPt))}>{fieldLabel(zh, "▭ Landscape", "▭ 横向")}</button>
      </div>
      <div className="table-frame-field-grid">
        {(["width", "height"] as const).map((axis) => <label key={axis} className="table-frame-number"><span>{axis === "width" ? "W" : "H"}</span><span className="table-frame-number-control"><input ref={axis === "width" ? widthInput : undefined} key={`${axis}-${pageSpec[axis === "width" ? "widthPt" : "heightPt"]}`} aria-label={`${axis === "width" ? "W" : "H"} mm`} type="number" min="50" max="600" step="0.1" defaultValue={mm(pageSpec[axis === "width" ? "widthPt" : "heightPt"])} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={(event) => commitDimension(axis, event.currentTarget)} /><em>mm</em></span></label>)}
      </div>
    </div>}
  </div>;
}

export function LayoutEditor({ document, sequence, dependencies, selectedIndex, setSelectedIndex, command, onRefreshPhotos, onNextPage, canUndo, canRedo, onUndo, onRedo, prepareExport }: {
  document: LayoutDocument; sequence: SequenceDocument; dependencies: AppDependencies; selectedIndex: number;
  setSelectedIndex: (index: number) => void; command: (edit: LayoutEditCommand, mergeKey?: string) => boolean; onRefreshPhotos: () => Promise<void>; onNextPage: () => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; prepareExport: { current: (() => void) | undefined };
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const [facing, setFacing] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [panning, setPanning] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number }>(undefined);
  const spaceDownRef = useRef(false);
  const zoomAnchorRef = useRef<{ x: number; y: number; fractionX: number; fractionY: number }>(undefined);
  const [tool, setTool] = useState<"select" | "draw" | "text">("select");
  const [selectedId, setSelectedId] = useState<LayoutObjectId>();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<LayoutObjectId>>(new Set());
  const [gesture, setGesture] = useState<Gesture>();
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const [cropDraft, setCropDraft] = useState<{ pageId: LayoutPageId; frameId: LayoutObjectId; crop: ImageCrop }>();
  const cropRef = useRef<typeof cropDraft>(undefined);
  const [templateId, setTemplateId] = useState<LayoutTemplateId>("single");
  const [templatePhotoItemIds, setTemplatePhotoItemIds] = useState<string[]>([]);
  const [strip, setStrip] = useState({ left: 0, width: 800 });
  const stripRef = useRef<HTMLDivElement>(null);
  const [missingPhotos, setMissingPhotos] = useState<ReadonlySet<PhotoId>>(new Set());
  const [photoSizes, setPhotoSizes] = useState<ReadonlyMap<PhotoId, { width: number; height: number }>>(new Map());
  const [sourceRevision, setSourceRevision] = useState(0);
  const [textDraft, setTextDraft] = useState<{ id: LayoutObjectId; value: string }>();
  const [editingTextId, setEditingTextId] = useState<LayoutObjectId>();
  const paperRefs = useRef(new Map<LayoutPageId, HTMLDivElement>());
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const wheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select") || (cropRef.current && target.closest(".layout-object.is-cropping"))) return;
      event.preventDefault();
      const spread = stage.querySelector<HTMLElement>(".layout-spread");
      if (!spread) return;
      const bounds = spread.getBoundingClientRect();
      zoomAnchorRef.current = { x: event.clientX, y: event.clientY,
        fractionX: (event.clientX - bounds.left) / bounds.width,
        fractionY: (event.clientY - bounds.top) / bounds.height };
      setZoom((current) => {
        const next = Math.round(clamp(current * Math.exp(-event.deltaY * .0015), .5, 3) * 100) / 100;
        if (next === current) zoomAnchorRef.current = undefined;
        return next;
      });
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, []);
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const stage = stageRef.current;
    const spread = stage?.querySelector<HTMLElement>(".layout-spread");
    if (!anchor || !stage || !spread) return;
    const bounds = spread.getBoundingClientRect();
    stage.scrollLeft += bounds.left + anchor.fractionX * bounds.width - anchor.x;
    stage.scrollTop += bounds.top + anchor.fractionY * bounds.height - anchor.y;
    zoomAnchorRef.current = undefined;
  }, [zoom]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code === "Space" && (target === window.document.body || stageRef.current?.contains(target))
        && !target.closest("button, input, textarea, select, [contenteditable='true']")) {
        spaceDownRef.current = true;
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") spaceDownRef.current = false; };
    const reset = () => { spaceDownRef.current = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", reset); };
  }, []);
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || (event.button !== 1 && !(event.button === 0 && (panMode || spaceDownRef.current || event.target === stage)))) return;
    event.preventDefault(); event.stopPropagation();
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
    stage.setPointerCapture(event.pointerId);
    setPanning(true);
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = panRef.current;
    const stage = stageRef.current;
    if (!start || !stage || start.pointerId !== event.pointerId) return;
    stage.scrollLeft = start.left - (event.clientX - start.x);
    stage.scrollTop = start.top - (event.clientY - start.y);
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    const stage = stageRef.current;
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    panRef.current = undefined;
    setPanning(false);
  };
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
  const selectOnly = (id?: LayoutObjectId) => { setSelectedId(id); setSelectedIds(id ? new Set([id]) : new Set()); };
  const selectedFrame = page?.objects.find((object) => object.id === selectedId && object.kind === "image-frame") as LayoutImageFrame | undefined;
  const selectedText = page?.objects.find((object) => object.id === selectedId && object.kind === "text-box") as LayoutTextBox | undefined;
  useEffect(() => { if (textDraft && (!selectedText || selectedText.id !== textDraft.id)) setTextDraft(undefined); }, [selectedText, textDraft]);
  useEffect(() => {
    if (!editingTextId || !textInputRef.current) return;
    textInputRef.current.focus();
    const end = textInputRef.current.value.length;
    textInputRef.current.setSelectionRange(end, end);
  }, [editingTextId]);
  const photos = useMemo(() => sequence.items.filter((item) => item.kind === "photo"), [sequence]);
  const templatePhotoIds = templatePhotoItemIds.flatMap((id) => {
    const item = photos.find((photo) => photo.id === id);
    return item ? [item.photoId] : [];
  });
  const sequencePhotoIds = useMemo(() => new Set(photos.map((item) => item.photoId)), [photos]);
  const visible = visiblePhotoRange(strip.left, { count: photos.length, itemWidth: 104, gap: 10, sidePadding: 0, viewportWidth: strip.width });
  const display = facing ? facingPageIndices(document.pages.length, selectedIndex) : [selectedIndex];
  const pageHeight = 460 * zoom;
  const pageWidth = pageHeight * document.pageSpec.widthPt / document.pageSpec.heightPt;
  const shownPages = [...display].filter((index): index is number => index !== null);
  const drawnRect = (drawing: Extract<Gesture, { kind: "draw" }>) => {
    if (!facing || display.some((entry) => entry === null)) return drawImageRect(drawing.start, drawing.current, document.pageSpec);
    const offset = drawing.pageIndex === display[1] ? document.pageSpec.widthPt : 0;
    const rect = drawImageRect({ x: drawing.start.x + offset, y: drawing.start.y },
      { x: drawing.current.x + offset, y: drawing.current.y },
      { ...document.pageSpec, widthPt: 2 * document.pageSpec.widthPt });
    return rect && { ...rect, x: rect.x - offset };
  };
  useEffect(() => {
    if (selectedIds.size && !shownPages.some((index) => document.pages[index].objects.some((object) => selectedIds.has(object.id)))) selectOnly();
  }, [selectedIndex, facing, document]);
  const crossesGutter = (index: number, slot: number) => facing && display.every((entry) => entry !== null)
    && ((gesture?.kind === "draw" && gesture.pageIndex === index && (() => {
      const rect = drawnRect(gesture);
      return !!rect && (slot === 0 ? rect.x + rect.width > document.pageSpec.widthPt : rect.x < 0);
    })()) || document.pages[index].objects.some((object) => {
      const rect = gesture?.kind === "frame" && gesture.object.id === object.id ? gesture.rect
        : gesture?.kind === "group" && gesture.objects.some((entry) => entry.object.id === object.id)
          ? { ...object.rect, x: object.rect.x + gesture.dx } : object.rect;
      return slot === 0 ? rect.x + rect.width > document.pageSpec.widthPt : rect.x < 0;
    }));
  const setActiveGesture = (next?: Gesture) => { gestureRef.current = next; setGesture(next); };
  const setActiveCrop = (next?: typeof cropDraft) => { cropRef.current = next; setCropDraft(next); };
  const markMissing = useCallback((photoId: PhotoId) => setMissingPhotos((current) => current.has(photoId) ? current : new Set([...current, photoId])), []);
  const noteSize = useCallback((photoId: PhotoId, size: { width: number; height: number }) => {
    setPhotoSizes((current) => current.get(photoId)?.width === size.width && current.get(photoId)?.height === size.height
      ? current : new Map(current).set(photoId, size));
    setMissingPhotos((current) => { if (!current.has(photoId)) return current; const next = new Set(current); next.delete(photoId); return next; });
  }, []);
  const updateFrame = (frame: LayoutImageFrame, pageId = page.id) => command({ type: "upsert-object", pageId, object: frame });
  const beginCrop = (frame: LayoutImageFrame, pageId: LayoutPageId) => {
    if (!frame.photoId) return;
    selectOnly(frame.id);
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
  prepareExport.current = () => {
    textInputRef.current?.blur();
    const active = gestureRef.current;
    if (active?.kind === "group" && (active.dx || active.dy)) {
      command({ type: "upsert-objects", updates: active.objects.map(({ pageId, object }) => ({ pageId, object: { ...object, rect: { ...object.rect, x: object.rect.x + active.dx, y: object.rect.y + active.dy } } })) });
    }
    if (active?.kind === "frame" && JSON.stringify(active.rect) !== JSON.stringify(active.object.rect)) {
      command({ type: "upsert-object", pageId: active.pageId, object: { ...active.object, rect: active.rect } });
    }
    if (active?.kind === "crop") setActiveCrop({ pageId: active.pageId, frameId: active.frame.id, crop: active.crop });
    setActiveGesture(undefined);
    finishCrop();
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (gestureRef.current || cropRef.current) { event.preventDefault(); cancel(); } return; }
      if (event.key === "Enter" && cropRef.current && !(event.target as HTMLElement)?.closest("textarea")) { event.preventDefault(); finishCrop(); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.size && !cropRef.current
        && !(event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable='true']")) {
        event.preventDefault(); command({ type: "remove-objects", objectIds: [...selectedIds] }); selectOnly();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  useEffect(() => { if (selectedId && !document.pages.some((entry) => entry.objects.some((object) => object.id === selectedId))) { selectOnly(); setActiveCrop(undefined); } }, [document, selectedId]);

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
    const object = [...currentPage.objects].reverse().find((object) =>
      point.x >= object.rect.x && point.x <= object.rect.x + object.rect.width
      && point.y >= object.rect.y && point.y <= object.rect.y + object.rect.height);
    if (object?.kind === "text-box") { setSelectedIndex(pageIndex); selectOnly(object.id); setEditingTextId(object.id); }
    else if (object?.kind === "image-frame" && object.photoId) beginCrop(object, currentPage.id);
  };
  const pointerStart = (event: ReactPointerEvent, pageIndex: number, frame?: LayoutImageFrame | LayoutTextBox, handle: ResizeHandle = "move") => {
    if (event.button !== 0 && !(event.button === 2 && frame?.kind === "image-frame" && frame.photoId)) return;
    const pageId = document.pages[pageIndex].id;
    const paper = paperRefs.current.get(pageId);
    if (!paper) return;
    event.preventDefault(); event.stopPropagation();
    setSelectedIndex(pageIndex);
    const at = pointOnPaper(event, paper);
    if (!frame && editingTextId) {
      textInputRef.current?.blur();
      setEditingTextId(undefined);
      selectOnly();
      setActiveCrop(undefined);
      setTool("select");
      return;
    }
    if (frame && tool === "select") {
      if (event.shiftKey && handle === "move" && event.button === 0) {
        const next = new Set(selectedIds);
        if (next.has(frame.id)) next.delete(frame.id); else next.add(frame.id);
        setSelectedIds(next); setSelectedId(next.has(frame.id) ? frame.id : [...next][0]);
        return;
      }
      if (handle === "move" && selectedIds.has(frame.id) && selectedIds.size > 1 && event.button === 0) {
        const objects = document.pages.flatMap((entry, index) => shownPages.includes(index) ? entry.objects
          .filter((object) => selectedIds.has(object.id)).map((object) => ({ pageId: entry.id, pageIndex: index, object })) : []);
        setActiveGesture({ kind: "group", pageId, pageIndex, pointerId: event.pointerId, start: at, dx: 0, dy: 0, objects });
        paper.setPointerCapture?.(event.pointerId);
        return;
      }
      selectOnly(frame.id);
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
    } else if (tool === "draw" || tool === "text") {
      selectOnly();
      setActiveGesture({ kind: "draw", objectKind: tool === "text" ? "text-box" : "image-frame", pageId, pageIndex, pointerId: event.pointerId, start: at, current: at });
    } else {
      if (!event.shiftKey) selectOnly();
      setActiveCrop(undefined);
      const slot = display.indexOf(pageIndex);
      const start = { x: at.x + slot * document.pageSpec.widthPt, y: at.y };
      setActiveGesture({ kind: "marquee", pageId, pageIndex, pointerId: event.pointerId, start, current: start, additive: event.shiftKey });
    }
    paper.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent, pageIndex: number) => {
    const current = gestureRef.current;
    if (!current || current.pageIndex !== pageIndex || current.pointerId !== event.pointerId) return;
    const paper = paperRefs.current.get(current.pageId);
    if (!paper) return;
    const at = pointOnPaper(event, paper);
    if (current.kind === "draw") setActiveGesture({ ...current, current: at });
    else if (current.kind === "marquee") setActiveGesture({ ...current, current: { x: at.x + display.indexOf(pageIndex) * document.pageSpec.widthPt, y: at.y } });
    else if (current.kind === "group") setActiveGesture({ ...current, dx: at.x - current.start.x, dy: at.y - current.start.y });
    else if (current.kind === "frame") {
      const spreadWidth = facing && display.every((entry) => entry !== null) ? 2 * document.pageSpec.widthPt : document.pageSpec.widthPt;
      const offset = facing && display[0] !== null && pageIndex === display[1] ? document.pageSpec.widthPt : 0;
      const candidateSpread = transformImageRect({ ...current.object.rect, x: current.object.rect.x + offset }, current.handle,
        at.x - current.start.x, at.y - current.start.y, { ...document.pageSpec, widthPt: spreadWidth });
      let candidate = { ...candidateSpread, x: candidateSpread.x - offset };
      if (current.object.kind === "image-frame" && current.object.photoAspectRatio && current.handle !== "move") {
        const ratio = current.object.photoAspectRatio;
        if (current.handle === "n" || current.handle === "s") candidate = { ...candidate, width: candidate.height * ratio };
        else candidate = { ...candidate, height: candidate.width / ratio };
        if (current.handle.includes("w")) candidate.x = current.object.rect.x + current.object.rect.width - candidate.width;
        if (current.handle.includes("n")) candidate.y = current.object.rect.y + current.object.rect.height - candidate.height;
      }
      const otherRects = display.flatMap((index, slot) => index === null ? [] : document.pages[index].objects
        .filter((object) => object.id !== current.object.id)
        .map((object) => ({ ...object.rect, x: object.rect.x + (spreadWidth > document.pageSpec.widthPt ? slot * document.pageSpec.widthPt : 0) })));
      const thresholdPt = 7 * document.pageSpec.widthPt / paper.getBoundingClientRect().width;
      const aligned = alignLayoutRect({ ...candidate, x: candidate.x + offset }, current.handle,
        { ...document.pageSpec, widthPt: spreadWidth }, otherRects, thresholdPt);
      let alignedRect = { ...aligned.rect, x: aligned.rect.x - offset };
      let guides = aligned.guides.map((guide) => guide.axis === "x" ? { ...guide, value: guide.value - offset } : guide);
      if (current.object.kind === "image-frame" && current.object.photoAspectRatio && current.handle !== "move" && guides.length) {
        const ratio = current.object.photoAspectRatio;
        const useX = guides.some((guide) => guide.axis === "x") && (!guides.some((guide) => guide.axis === "y")
          || Math.abs(alignedRect.width - candidate.width) <= Math.abs(alignedRect.height - candidate.height) * ratio);
        const width = useX ? alignedRect.width : alignedRect.height * ratio;
        const height = width / ratio;
        alignedRect = { ...alignedRect, width, height,
          x: current.handle.includes("w") ? current.object.rect.x + current.object.rect.width - width : alignedRect.x,
          y: current.handle.includes("n") ? current.object.rect.y + current.object.rect.height - height : alignedRect.y };
        guides = guides.filter((guide) => guide.axis === (useX ? "x" : "y"));
      }
      setActiveGesture({ ...current, rect: alignedRect, guides });
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
    if (current.kind === "marquee") {
      const left = Math.min(current.start.x, current.current.x), right = Math.max(current.start.x, current.current.x);
      const top = Math.min(current.start.y, current.current.y), bottom = Math.max(current.start.y, current.current.y);
      const next = new Set(current.additive ? selectedIds : []);
      if (right - left > 2 && bottom - top > 2) for (const [slot, index] of display.entries()) {
        if (index === null) continue;
        for (const object of document.pages[index].objects) {
          const x = slot * document.pageSpec.widthPt + object.rect.x;
          if (x < right && x + object.rect.width > left && object.rect.y < bottom && object.rect.y + object.rect.height > top) next.add(object.id);
        }
      }
      setSelectedIds(next); setSelectedId([...next][0]);
    } else if (current.kind === "group" && (current.dx || current.dy)) {
      command({ type: "upsert-objects", updates: current.objects.map(({ pageId, object }) => ({ pageId, object: { ...object, rect: { ...object.rect, x: object.rect.x + current.dx, y: object.rect.y + current.dy } } })) });
    } else if (current.kind === "draw") {
      const rect = drawnRect(current);
      if (rect) {
        if (current.objectKind === "image-frame") {
          const frame = createImageFrame(newObjectId(), rect);
          if (updateFrame(frame, current.pageId)) selectOnly(frame.id);
        } else addText(rect, current.pageId);
        setTool("select");
      }
    } else if (current.kind === "frame" && JSON.stringify(current.rect) !== JSON.stringify(current.object.rect)) {
      command({ type: "upsert-object", pageId: current.pageId, object: { ...current.object, rect: current.rect } });
    } else if (current.kind === "crop" && current.quick) {
      if (current.moved && JSON.stringify(current.crop) !== JSON.stringify(current.initialCrop)) updateFrame({ ...current.frame, crop: current.crop }, current.pageId);
      setActiveCrop(undefined);
    }
  };
  const wheelCrop = (event: ReactWheelEvent, frame: LayoutImageFrame, pageIndex: number) => {
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
  const insertPhoto = async (photoId: PhotoId, pageIndex = selectedIndex, at?: Point, targetFrame?: LayoutImageFrame) => {
    const targetPage = document.pages[pageIndex];
    const metadata = photoSizes.get(photoId) ?? await dependencies.photoSource.getPhoto(photoId).then((result) => result.ok ? result.value : undefined);
    const ratio = metadata?.width && metadata.height ? metadata.width / metadata.height : undefined;
    if (targetFrame) {
      const replacement = replaceFramePhoto(targetFrame, photoId);
      const height = ratio && targetFrame.photoAspectRatio ? targetFrame.rect.width / ratio : targetFrame.rect.height;
      updateFrame({ ...replacement, photoAspectRatio: targetFrame.photoAspectRatio ? ratio : undefined,
        rect: { ...targetFrame.rect, y: targetFrame.rect.y + (targetFrame.rect.height - height) / 2, height } }, targetPage.id);
      selectOnly(targetFrame.id);
      return;
    }
    const width = ratio ? Math.min(document.pageSpec.widthPt * .55, document.pageSpec.heightPt * .65 * ratio) : document.pageSpec.widthPt * .4;
    const height = ratio ? width / ratio : document.pageSpec.heightPt * .4;
    const center = at ?? { x: document.pageSpec.widthPt / 2, y: document.pageSpec.heightPt / 2 };
    const frame = { ...createImageFrame(newObjectId(), {
      x: clamp(center.x - width / 2, 0, document.pageSpec.widthPt - width),
      y: clamp(center.y - height / 2, 0, document.pageSpec.heightPt - height), width, height,
    }, photoId), photoAspectRatio: ratio };
    updateFrame(frame, targetPage.id); selectOnly(frame.id); setSelectedIndex(pageIndex);
  };
  const dropPhoto = (event: DragEvent, pageIndex: number, frame?: LayoutImageFrame) => {
    event.preventDefault(); event.stopPropagation();
    const photoId = event.dataTransfer.getData(photoDragType) as PhotoId;
    if (!photos.some((item) => item.photoId === photoId)) return;
    const paper = paperRefs.current.get(document.pages[pageIndex].id);
    void insertPhoto(photoId, pageIndex, frame || !paper ? undefined : pointOnPaper(event, paper), frame);
  };
  const applyTemplate = (id: LayoutTemplateId) => {
    try {
      const frames = imageTemplateFrames({ id, direction: "horizontal", spec: document.pageSpec, marginMm: 12, gapMm: 6,
        photoIds: templatePhotoIds, newId: newObjectId });
      if (command({ type: "replace-image-frames", pageId: page.id, frames })) { setTemplateId(id); selectOnly(); setTemplatePhotoItemIds([]); }
    } catch { /* Invalid geometry leaves the current page unchanged. */ }
  };
  const formatRect = (rect: LayoutRect) => layoutObjectStyle(rect, document.pageSpec);
  const selectedObject = selectedFrame ?? selectedText;
  const updateText = (box: LayoutTextBox, mergeKey?: string, pageId = page.id) => command({ type: "upsert-object", pageId, object: box }, mergeKey);
  const rectField = (axis: keyof LayoutRect, label: string) => selectedObject && <RectNumberField key={`${selectedObject.id}-${axis}`} label={label} valuePt={selectedObject.rect[axis]} onCommit={(value) => command({ type: "upsert-object", pageId: page.id, object: { ...selectedObject, rect: { ...selectedObject.rect, [axis]: value } } })} />;
  const addText = (rect: LayoutRect, pageId: LayoutPageId) => {
    const box: LayoutTextBox = { kind: "text-box", id: newObjectId(), rect, text: "",
      style: { fontFamily: DEFAULT_LAYOUT_FONT, fontWeight: "normal", fontStyle: "normal", fontSizePt: 12, lineHeight: 1.4, color: "#171513", align: "left" } };
    if (updateText(box, undefined, pageId)) { setSelectedIndex(document.pages.findIndex((entry) => entry.id === pageId)); selectOnly(box.id); setActiveCrop(undefined); setEditingTextId(box.id); }
  };
  const renderTextEditor = (box: LayoutTextBox, pageId: LayoutPageId) => <textarea ref={textInputRef} className="layout-text-canvas-input"
    aria-label={fieldLabel(zh, "Edit text in frame", "在文字框内编辑")} spellCheck={false}
    value={textDraft?.id === box.id ? textDraft.value : box.text}
    style={{ color: box.style.color, fontFamily: layoutFontCssStack(box.style.fontFamily),
      fontWeight: layoutFontWeight(box.style.fontWeight) === "bold" ? 700 : 400, fontStyle: layoutFontStyle(box.style.fontStyle),
      fontSize: box.style.fontSizePt * pageHeight / document.pageSpec.heightPt,
      lineHeight: `${box.style.fontSizePt * box.style.lineHeight * pageHeight / document.pageSpec.heightPt}px`, textAlign: box.style.align }}
    onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onCompositionStart={() => setTextDraft({ id: box.id, value: box.text })}
    onCompositionEnd={(event) => { const value = event.currentTarget.value; setTextDraft(undefined); if (value !== box.text) updateText({ ...box, text: value }, `text:${box.id}`, pageId); }}
    onChange={(event) => { const value = event.target.value; if ((event.nativeEvent as InputEvent).isComposing || textDraft?.id === box.id) setTextDraft({ id: box.id, value }); else if (value !== box.text) updateText({ ...box, text: value }, `text:${box.id}`, pageId); }}
    onBlur={(event) => { if (textDraft?.id === box.id) { if (event.currentTarget.value !== box.text) updateText({ ...box, text: event.currentTarget.value }, `text:${box.id}`, pageId); setTextDraft(undefined); } setEditingTextId(undefined); }}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); event.currentTarget.blur(); } }} />;
  return <>
    <section className="layout-center">
      <div className="layout-editor-toolbar">
      <div className="layout-view-controls"><div role="group" aria-label={fieldLabel(zh, "Page view", "页面查看方式")}><button aria-pressed={!facing} onClick={() => setFacing(false)}>{fieldLabel(zh, "Single", "单页")}</button><button aria-pressed={facing} onClick={() => setFacing(true)}>{fieldLabel(zh, "Facing pages", "对页")}</button></div><div><button aria-pressed={panMode} title={fieldLabel(zh, "Drag with left button; middle button always pans", "开启后左键拖动画布；中键始终可拖动")} onClick={() => setPanMode((value) => !value)}>{fieldLabel(zh, "Pan", "拖动画布")}</button><button onClick={() => setZoom(1)}>{fieldLabel(zh, "Fit page", "适应页面")}</button><button disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .1))}>＋</button></div></div>
      <div className="layout-image-toolbar">
        <button aria-pressed={tool === "select"} onClick={() => setTool("select")}><svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M2 1L11 6.5L6.5 7.5L5 11L2 1Z" fill="currentColor" /></svg>{fieldLabel(zh, "Select", "选择")}</button>
        <button aria-pressed={tool === "draw"} aria-label={fieldLabel(zh, "Draw frame", "画图像框")} title={fieldLabel(zh, "Draw frame", "画图像框")} onClick={() => setTool("draw")}><svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><circle cx="4.5" cy="4.5" r="1.2" fill="currentColor" /><path d="M1 9l3-3 2.5 2.5 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>{fieldLabel(zh, "Image", "图像")}</button>
        <button aria-pressed={tool === "text"} aria-label={fieldLabel(zh, "Draw text box", "画文字框")} onClick={() => setTool("text")}><b aria-hidden="true">T</b>{fieldLabel(zh, "Text", "文字")}</button>
        <button disabled={!selectedFrame?.photoId} aria-pressed={!!cropDraft} onClick={() => { if (selectedFrame) beginCrop(selectedFrame, page.id); }}><svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M3 1v9h9M1 3h9v9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>{fieldLabel(zh, "Crop", "裁切")}</button>
        <span className="layout-toolbar-divider" />
        <LayoutPageSizeControl pageSpec={document.pageSpec} command={command} zh={zh} />
      </div>
      <div className="layout-history-controls"><button aria-label={fieldLabel(zh, "Undo", "撤销")} title={fieldLabel(zh, "Undo", "撤销")} disabled={!canUndo} onClick={onUndo}><img src={undoIcon} alt="" /></button><button aria-label={fieldLabel(zh, "Redo", "重做")} title={fieldLabel(zh, "Redo", "重做")} disabled={!canRedo} onClick={onRedo}><img src={redoIcon} alt="" /></button></div>
      </div>
      <div className="layout-canvas"><div ref={stageRef} className={`layout-stage${panMode ? " is-pan-mode" : ""}${panning ? " is-panning" : ""}`} onPointerDownCapture={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }}><div key="editing" className={`layout-spread${facing && display.every((entry) => entry !== null) ? " is-facing" : ""}`} style={{ width: display.length * pageWidth, height: pageHeight }}>{display.map((index, slot) => index === null ? <div className="layout-paper-placeholder" key={`empty-${slot}`} aria-label={fieldLabel(zh, "Facing page placeholder", "对页占位")} style={{ width: pageWidth, height: pageHeight }} /> : <div key={document.pages[index].id} ref={(element) => { if (element) paperRefs.current.set(document.pages[index].id, element); else paperRefs.current.delete(document.pages[index].id); }} className={`layout-paper${index === selectedIndex ? " is-current" : ""}${tool === "draw" || tool === "text" ? " is-drawing" : ""}`} style={{ width: pageWidth, height: pageHeight, zIndex: crossesGutter(index, slot) ? 2 : 1 }} aria-label={fieldLabel(zh, `Page ${index + 1}`, `第 ${index + 1} 页`)} onPointerDown={(event) => pointerStart(event, index)} onPointerMove={(event) => pointerMove(event, index)} onPointerUp={(event) => pointerEnd(event, index)} onPointerCancel={cancelPointer} onDoubleClick={(event) => doubleClickPaper(event, index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropPhoto(event, index)}>
        {document.pages[index].objects.map((object) => {
          const currentGesture = gesture?.kind === "frame" && gesture.object.id === object.id ? gesture : undefined;
          const groupMove = gesture?.kind === "group" && gesture.objects.some((entry) => entry.object.id === object.id) ? gesture : undefined;
          const rect = currentGesture?.rect ?? (groupMove ? { ...object.rect, x: object.rect.x + groupMove.dx, y: object.rect.y + groupMove.dy } : object.rect);
          const shown = object.kind === "image-frame" ? { ...object, rect, crop: cropDraft?.frameId === object.id ? cropDraft.crop : object.crop } : { ...object, rect };
          return <div key={object.id} className={`layout-object layout-object-${object.kind}${selectedIds.has(object.id) ? " is-selected" : ""}${cropDraft?.frameId === object.id ? " is-cropping" : ""}`} style={formatRect(rect)} onClick={(event) => { event.stopPropagation(); setSelectedIndex(index); if (!event.shiftKey && !selectedIds.has(object.id)) selectOnly(object.id); }} onDoubleClick={(event) => { event.stopPropagation(); if (object.kind === "image-frame") beginCrop(object, document.pages[index].id); else { setSelectedIndex(index); selectOnly(object.id); setEditingTextId(object.id); } }} onPointerDown={(event) => pointerStart(event, index, object)} onWheel={object.kind === "image-frame" ? (event) => wheelCrop(event, object, index) : undefined} onContextMenu={object.kind === "image-frame" && object.photoId ? (event) => event.preventDefault() : undefined} onDragOver={object.kind === "image-frame" ? (event) => event.preventDefault() : undefined} onDrop={object.kind === "image-frame" ? (event) => dropPhoto(event, index, object) : undefined}>
            {shown.kind === "text-box" && editingTextId === object.id ? renderTextEditor(shown, document.pages[index].id) : <LayoutObjectVisual object={shown} photoSource={dependencies.photoSource} sourceRevision={sourceRevision} scale={pageHeight / document.pageSpec.heightPt} onMetadata={noteSize} onMissing={markMissing} />}
            {shown.kind === "image-frame" && shown.photoId && (!sequencePhotoIds.has(shown.photoId) || missingPhotos.has(shown.photoId)) && <span className="layout-image-warning">{fieldLabel(zh, "Photo unavailable", "照片不可用")}</span>}
            {object.kind === "image-frame" && cropDraft?.frameId === object.id && gesture?.kind !== "crop" && <div className="layout-crop-overlay" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><span>{fieldLabel(zh, `Drag photo · scroll to zoom · ${Math.round(cropDraft.crop.zoom * 100)}%`, `拖动照片 · 滚轮缩放 · ${Math.round(cropDraft.crop.zoom * 100)}%`)}</span><div><button onClick={cancel}>{fieldLabel(zh, "Cancel", "取消")}</button><button onClick={finishCrop}>{fieldLabel(zh, "Done", "完成")}</button></div></div>}
            {object.id === selectedId && selectedIds.size === 1 && !cropDraft && (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => <button key={handle} className={`layout-resize-handle is-${handle}`} aria-label={`Resize ${handle}`} onPointerDown={(event) => pointerStart(event, index, object, handle)} />)}
          </div>;
        })}
        {gesture?.kind === "frame" && gesture.pageIndex === index && gesture.guides.length > 0 && <svg className="layout-alignment-guides" width="100%" height="100%" viewBox={`0 0 ${document.pageSpec.widthPt} ${document.pageSpec.heightPt}`} aria-hidden="true">{gesture.guides.map((guide) => guide.axis === "x" ? <line key="x" x1={guide.value} y1={0} x2={guide.value} y2={document.pageSpec.heightPt} /> : <line key="y" x1={0} y1={guide.value} x2={document.pageSpec.widthPt} y2={guide.value} />)}</svg>}
        {gesture?.kind === "draw" && gesture.pageIndex === index && drawnRect(gesture) && <div className="layout-draw-preview" style={formatRect(drawnRect(gesture)!)} />}
        <span className={`layout-paper-number${facing && slot === 0 ? " is-left" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
      </div>)}{gesture?.kind === "marquee" && <div className="layout-marquee-preview" style={{ left: `${Math.min(gesture.start.x, gesture.current.x) / (display.length * document.pageSpec.widthPt) * 100}%`, top: `${Math.min(gesture.start.y, gesture.current.y) / document.pageSpec.heightPt * 100}%`, width: `${Math.abs(gesture.start.x - gesture.current.x) / (display.length * document.pageSpec.widthPt) * 100}%`, height: `${Math.abs(gesture.start.y - gesture.current.y) / document.pageSpec.heightPt * 100}%` }} />}</div></div><div className="layout-page-indicator">{fieldLabel(zh, "Page", "页")} {shownPages.map((index) => index + 1).join("–")} / {document.pages.length}</div><button className="layout-next-page" onClick={onNextPage} aria-label={fieldLabel(zh, "Next page", "下一页")}>{fieldLabel(zh, "Next page", "下一页")} →</button></div>
      <div className="layout-photo-tray"><div className="layout-panel-heading"><strong>{fieldLabel(zh, "Assets", "照片素材")}</strong><button className="layout-photo-refresh" onClick={() => { void onRefreshPhotos().then(() => { setMissingPhotos(new Set()); setSourceRevision((value) => value + 1); }); }}>{fieldLabel(zh, "Refresh", "刷新")}</button></div><div ref={stripRef} className="layout-photo-scroll" onScroll={(event) => setStrip({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth || 800 })}><div className="layout-photo-track" style={{ width: Math.max(0, photos.length * 114) }}>{photos.slice(visible.start, visible.end).map((item, offset) => {
        const index = visible.start + offset;
        return <div key={item.id} className="layout-photo-item" style={{ left: index * 114 }} draggable onDragStart={(event) => { event.dataTransfer.setData(photoDragType, item.photoId); event.dataTransfer.effectAllowed = "copy"; }}>
          <button className="layout-photo-insert" aria-label={`Insert photo ${index + 1}`} onClick={() => { void insertPhoto(item.photoId, selectedIndex, undefined, selectedFrame); }}><PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} sourceRevision={sourceRevision} alt="" onError={markMissing} /></button>
          <label className="layout-photo-select"><input type="checkbox" checked={templatePhotoItemIds.includes(item.id)} aria-label={`Select photo ${index + 1} for template`} onChange={(event) => setTemplatePhotoItemIds((current) => event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id))} /></label>
        </div>;
      })}</div></div></div>
    </section>
    <aside className="layout-properties-panel table-frame-panel" aria-label={fieldLabel(zh, "Page properties", "页面属性")}>
      <div className="table-frame-inspector">
        <section className="table-frame-section"><h3>{fieldLabel(zh, "TEMPLATE", "模板")}</h3><div className="table-frame-template-strip layout-template-strip" role="group" aria-label="Template">
          {LAYOUT_TEMPLATES.map((id) => <button key={id} type="button" title={templateLabels[id]} aria-label={`${templateLabels[id]} template`} aria-pressed={templateId === id} onClick={() => applyTemplate(id)}><span className={`table-frame-mini mini-${id}`} aria-hidden="true" /></button>)}
        </div></section>
        {selectedFrame ? <>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "IMAGE FRAME", "图像框")}</h3><div className="table-frame-field-grid layout-property-grid">{rectField("x", "X mm")}{rectField("y", "Y mm")}{rectField("width", "W mm")}{rectField("height", "H mm")}</div></section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "PHOTO FIT", "照片适配")}</h3><div className="table-frame-segments" role="group" aria-label="Photo fit"><button aria-pressed={(cropDraft?.crop ?? selectedFrame.crop).mode === "fit"} onClick={() => cropDraft ? setActiveCrop({ ...cropDraft, crop: { ...cropDraft.crop, mode: "fit", zoom: 1 } }) : updateFrame({ ...selectedFrame, crop: { ...selectedFrame.crop, mode: "fit", zoom: 1 } })}>Fit</button><button aria-pressed={(cropDraft?.crop ?? selectedFrame.crop).mode === "fill"} onClick={() => cropDraft ? setActiveCrop({ ...cropDraft, crop: { ...cropDraft.crop, mode: "fill", zoom: 1 } }) : updateFrame({ ...selectedFrame, crop: { ...selectedFrame.crop, mode: "fill", zoom: 1 } })}>Fill</button></div><p className="table-frame-hint">{fieldLabel(zh, "Double-click to crop, then drag the photo and scroll to zoom. Right-drag to adjust directly.", "双击照片进入裁切，拖动照片并滚轮缩放；右键拖动可直接调整。")}</p><div className="table-frame-action-row"><button onClick={() => beginCrop(selectedFrame, page.id)} disabled={!selectedFrame.photoId}>{fieldLabel(zh, "Crop photo", "裁切照片")}</button><button onClick={() => updateFrame(replaceFramePhoto(selectedFrame, null))}>{fieldLabel(zh, "Clear photo", "清空照片")}</button></div></section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "LAYER ORDER", "图层顺序")}</h3><div className="table-frame-action-row"><button disabled={page.objects[0]?.id === selectedFrame.id} onClick={() => command({ type: "move-object", pageId: page.id, objectId: selectedFrame.id, to: page.objects.findIndex((object) => object.id === selectedFrame.id) - 1 })}>{fieldLabel(zh, "Backward", "后移")}</button><button disabled={page.objects.at(-1)?.id === selectedFrame.id} onClick={() => command({ type: "move-object", pageId: page.id, objectId: selectedFrame.id, to: page.objects.findIndex((object) => object.id === selectedFrame.id) + 1 })}>{fieldLabel(zh, "Forward", "前移")}</button></div></section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "FRAME ACTIONS", "图像框操作")}</h3><div className="table-frame-action-row"><button onClick={() => { const duplicate = { ...selectedFrame, id: newObjectId(), rect: { ...selectedFrame.rect, x: clamp(selectedFrame.rect.x + 5 * MM_TO_PT, MM_TO_PT - selectedFrame.rect.width, document.pageSpec.widthPt - MM_TO_PT) } }; if (updateFrame(duplicate)) setSelectedId(duplicate.id); }}>{fieldLabel(zh, "Duplicate", "复制框")}</button><button className="is-danger" onClick={() => { command({ type: "remove-object", pageId: page.id, objectId: selectedFrame.id }); setSelectedId(undefined); }}>{fieldLabel(zh, "Delete frame", "删除框")}</button></div><p className="table-frame-hint">{selectedFrame.photoId ? !sequencePhotoIds.has(selectedFrame.photoId) ? fieldLabel(zh, "Photo removed from Sequence; reference kept.", "照片已从 Sequence 移除，引用仍保留。") : missingPhotos.has(selectedFrame.photoId) ? fieldLabel(zh, "Photo unavailable; reference kept.", "照片不可用，引用仍保留。") : fieldLabel(zh, "Click or drop another photo to replace.", "点击或拖入照片可替换。") : fieldLabel(zh, "This frame is empty.", "此图像框为空。")}</p></section>
        </> : selectedText ? <>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "TYPE", "排版")}</h3>
            <label className="layout-number-field"><span>{fieldLabel(zh, "Font", "字体")}</span><select aria-label={fieldLabel(zh, "Font", "字体")} value={selectedText.style.fontFamily} style={{ fontFamily: layoutFontCssStack(selectedText.style.fontFamily) }} onChange={(event) => updateText({ ...selectedText, style: { ...selectedText.style, fontFamily: event.target.value as LayoutFontFamily } })}>{LAYOUT_FONTS.map((font) => <option key={font.family} value={font.family}>{font.label}</option>)}</select></label>
            <div className="table-frame-segments layout-font-style-controls" role="group" aria-label={fieldLabel(zh, "Font style", "字体样式")}><button type="button" aria-label={fieldLabel(zh, "Bold", "粗体")} title={fieldLabel(zh, "Bold", "粗体")} aria-pressed={layoutFontWeight(selectedText.style.fontWeight) === "bold"} onClick={() => updateText({ ...selectedText, style: { ...selectedText.style, fontWeight: layoutFontWeight(selectedText.style.fontWeight) === "bold" ? "normal" : "bold" } })}><b aria-hidden="true">B</b></button><button type="button" aria-label={fieldLabel(zh, "Italic", "斜体")} title={fieldLabel(zh, "Italic", "斜体")} aria-pressed={layoutFontStyle(selectedText.style.fontStyle) === "italic"} onClick={() => updateText({ ...selectedText, style: { ...selectedText.style, fontStyle: layoutFontStyle(selectedText.style.fontStyle) === "italic" ? "normal" : "italic" } })}><i aria-hidden="true">I</i></button></div>
            <div className="table-frame-field-grid layout-property-grid"><RectNumberField label={fieldLabel(zh, "Size pt", "字号 pt")} valuePt={selectedText.style.fontSizePt * MM_TO_PT} step={1} min={6} max={144} onCommit={(value) => updateText({ ...selectedText, style: { ...selectedText.style, fontSizePt: value / MM_TO_PT } })} /><label className="layout-number-field"><span>{fieldLabel(zh, "Line height", "行距")}</span><input type="number" min="0.8" max="3" step="0.1" value={selectedText.style.lineHeight} onChange={(event) => updateText({ ...selectedText, style: { ...selectedText.style, lineHeight: Number(event.target.value) } })} /></label></div>
            <label className="layout-number-field"><span>{fieldLabel(zh, "Colour", "颜色")}</span><input className="layout-text-colour" type="color" value={selectedText.style.color} onChange={(event) => updateText({ ...selectedText, style: { ...selectedText.style, color: event.target.value } })} /></label>
            <div className="table-frame-segments" role="group" aria-label={fieldLabel(zh, "Text alignment", "文字对齐")}>{(["left", "center", "right"] as const).map((align) => <button key={align} aria-pressed={selectedText.style.align === align} onClick={() => updateText({ ...selectedText, style: { ...selectedText.style, align } })}>{align === "left" ? fieldLabel(zh, "Left", "左") : align === "center" ? fieldLabel(zh, "Centre", "中") : fieldLabel(zh, "Right", "右")}</button>)}</div>
          </section>
          <section className="table-frame-section"><h3>{fieldLabel(zh, "TEXT ACTIONS", "文字框操作")}</h3><div className="table-frame-action-row"><button onClick={() => { const duplicate = { ...selectedText, id: newObjectId() }; if (updateText(duplicate)) setSelectedId(duplicate.id); }}>{fieldLabel(zh, "Duplicate", "复制")}</button><button className="is-danger" onClick={() => { command({ type: "remove-object", pageId: page.id, objectId: selectedText.id }); setSelectedId(undefined); }}>{fieldLabel(zh, "Delete", "删除")}</button></div></section>
        </> : <section className="table-frame-section"><h3>{fieldLabel(zh, "PAGE", "页面")}</h3><dl><dt>{fieldLabel(zh, "Size", "尺寸")}</dt><dd>{(document.pageSpec.widthPt / MM_TO_PT).toFixed(1)} × {(document.pageSpec.heightPt / MM_TO_PT).toFixed(1)} mm</dd><dt>{fieldLabel(zh, "Current page", "当前页")}</dt><dd>{selectedIndex + 1} / {document.pages.length}</dd><dt>{fieldLabel(zh, "Objects", "对象")}</dt><dd>{page.objects.length}</dd></dl></section>}
      </div>
    </aside>
  </>;
}
