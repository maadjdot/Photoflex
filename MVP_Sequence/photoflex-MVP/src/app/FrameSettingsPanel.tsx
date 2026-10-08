import { useEffect, useRef, useState, type ReactNode } from "react";
import { PaperControls } from "./LayoutPaperControls";
import { FrameEdgeControls, FramePhotoElevationControls, FrameTextControls, PhotoInnerEdgeControls } from "./FrameAppearanceControls";
import { FrameNumberField } from "./FrameNumberField";
import closeIcon from "../assets/icons/frame-close.svg";
import chevronIcon from "../assets/icons/frame-chevron-down.svg";
import lockIcon from "../assets/icons/table-lock.svg";
import type { FrameCrop, FrameEditCommand, FrameRect, FrameSlot, FrameSlotId, FrameTextBox, LayoutObjectId, WorktableFrame } from "../contracts";
import { FRAME_MM_TO_PT, FRAME_PAGE_PRESETS, frameFamily, framePaper } from "../modules/worktable/frameLayout";
import { frameInnerEdge } from "../modules/worktable/frameAppearance";
import { useLocale } from "./locale";

interface FrameSettingsPanelProps {
  readonly frame: WorktableFrame;
  readonly slot?: FrameSlot;
  readonly textBox?: FrameTextBox;
  readonly drawingText: boolean;
  readonly onStartText: () => void;
  readonly cropDraft?: FrameCrop;
  readonly onCropDraft: (crop: FrameCrop | undefined) => void;
  readonly onFinishCrop: () => void;
  readonly onSelectSlot: (slotId: FrameSlotId | undefined) => void;
  readonly onSelectText: (textId: LayoutObjectId | undefined) => void;
  readonly onClose: () => void;
  readonly onExecute: (command: FrameEditCommand) => void;
  readonly exportButton: ReactNode;
}

const PAGE_RATIOS = [[1, 1], [2, 3], [3, 4], [4, 5], [9, 16]] as const;

export function FrameSettingsPanel({ frame, slot, textBox, drawingText, onStartText, cropDraft, onCropDraft, onFinishCrop, onSelectSlot, onSelectText, onClose, onExecute, exportButton }: FrameSettingsPanelProps) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const page = frame.page;
  const squareGrid = page.templateSource.id === "square-nine-grid";
  const family = frameFamily(page.templateSource.id);
  const pageMaximum = family.id === "plain" ? 600 : 1000;
  const [ratioLocked, setRatioLocked] = useState(false);
  useEffect(() => setRatioLocked(false), [frame.id]);
  const widthInput = useRef<HTMLInputElement>(null);
  const resizePage = (widthPt: number, heightPt: number) => onExecute({ type: "resize-frame-page", frameId: frame.id, widthPt, heightPt, reflow: true });
  const resizeDimension = (axis: "width" | "height", valuePt: number) => {
    const keepRatio = squareGrid || ratioLocked;
    const widthPt = axis === "width" ? valuePt : keepRatio ? valuePt * page.widthPt / page.heightPt : page.widthPt;
    const heightPt = axis === "height" ? valuePt : keepRatio ? valuePt * page.heightPt / page.widthPt : page.heightPt;
    if (![widthPt, heightPt].every((value) => Number.isFinite(value) && value >= 50 * FRAME_MM_TO_PT && value <= pageMaximum * FRAME_MM_TO_PT)) return false;
    return resizePage(widthPt, heightPt);
  };
  const currentPreset = Object.entries(FRAME_PAGE_PRESETS).find(([, pair]) => Math.abs(Math.min(page.widthPt, page.heightPt) / FRAME_MM_TO_PT - Math.min(...pair)) < .1
    && Math.abs(Math.max(page.widthPt, page.heightPt) / FRAME_MM_TO_PT - Math.max(...pair)) < .1)?.[0] ?? "Custom";
  const selectedObject = slot ?? textBox;
  const updateRect = (field: keyof FrameRect, value: number) => {
    if (slot) return onExecute({ type: "transform-frame-slot", frameId: frame.id, slotId: slot.id, rect: { ...slot.rect, [field]: value } });
    else if (textBox) return onExecute({ type: "upsert-frame-text", frameId: frame.id, textBox: { ...textBox, rect: { ...textBox.rect, [field]: value } } });
  };
  const geometry = selectedObject && <div className="table-frame-field-grid">
    {(["x", "y", "width", "height"] as const).map((field) => <FrameNumberField key={`${selectedObject.id}-${field}`} label={zh ? { x: "X 坐标", y: "Y 坐标", width: "宽度", height: "高度" }[field] : { x: "X", y: "Y", width: "W", height: "H" }[field]} value={selectedObject.rect[field]} min={field === "width" || field === "height" ? 1 : 0} max={1000} onCommit={(value) => updateRect(field, value)} />)}
  </div>;
  const context = slot ? "photo" : textBox ? "text" : "page";
  useEffect(() => { document.querySelector<HTMLElement>(".table-frame-settings-content")?.scrollTo?.({ top: 0 }); }, [context]);

  return <div className="table-frame-panel is-frame-toolbar" onPointerDown={(event) => event.stopPropagation()}>
    <header className="table-frame-panel-header"><div><strong>{label("Frame settings", "画框设置")}</strong></div><button type="button" className="table-frame-panel-close" aria-label={label("Close Frame settings", "关闭画框设置")} onClick={onClose}><img src={closeIcon} alt="" width="12" height="12" /></button></header>
    <div className="table-frame-inspector" data-frame-family={family.id} data-inspector-context={context}>
      {context === "page" && <>
        <section className="table-frame-section table-frame-creation-section">
          <button type="button" className="table-frame-add-box" onClick={() => { const slotId = crypto.randomUUID() as FrameSlotId; onExecute({ type: "add-frame-slot", frameId: frame.id, slotId }); onSelectSlot(slotId); }}><span aria-hidden="true">＋</span>{label("Add photo box", "添加照片框")}</button>
          <button type="button" className="table-frame-add-text" aria-pressed={drawingText} onClick={onStartText}><span aria-hidden="true">T</span>{label("Add text", "添加文字")}</button>
        </section>
        <section className="table-frame-section"><h3>{label("Page size", "页面尺寸")}</h3>
          {family.id === "plain" && <div className="table-frame-preset-strip" role="group" aria-label={label("Page size", "页面尺寸")}>
            {(["A4", "A5", "Letter", "Square", "Panoramic"] as const).map((preset) => { const pair = FRAME_PAGE_PRESETS[preset]; return <button key={preset} type="button" aria-pressed={currentPreset === preset} disabled={squareGrid && preset !== "Square"} onClick={() => {
              const landscape = page.widthPt > page.heightPt;
              resizePage((landscape ? Math.max(...pair) : Math.min(...pair)) * FRAME_MM_TO_PT, (landscape ? Math.min(...pair) : Math.max(...pair)) * FRAME_MM_TO_PT);
            }}>{preset === "Square" ? label(preset, "方形") : preset === "Panoramic" ? label(preset, "全景") : preset === "Letter" ? label(preset, "美式信纸") : preset}</button>; })}
            <button type="button" aria-pressed={currentPreset === "Custom"} onClick={() => widthInput.current?.focus()}>{label("Custom", "自定义")}</button>
          </div>}
          {!squareGrid && <div className="table-frame-segments table-frame-orientation" role="group" aria-label={label("Orientation", "页面方向")}>
            <button type="button" aria-pressed={page.widthPt <= page.heightPt} onClick={() => resizePage(Math.min(page.widthPt, page.heightPt), Math.max(page.widthPt, page.heightPt))}>▯ {label("Portrait", "竖向")}</button>
            <button type="button" aria-pressed={page.widthPt > page.heightPt} onClick={() => resizePage(Math.max(page.widthPt, page.heightPt), Math.min(page.widthPt, page.heightPt))}>▭ {label("Landscape", "横向")}</button>
          </div>}
          <div className="table-frame-ratio-strip" role="group" aria-label={label("Page aspect ratio", "页面比例")}>
            {PAGE_RATIOS.map(([short, long]) => <button key={`${short}:${long}`} type="button" aria-pressed={Math.abs(Math.min(page.widthPt, page.heightPt) / Math.max(page.widthPt, page.heightPt) - short / long) < .001} disabled={squareGrid && short !== long} onClick={() => {
              const longest = Math.max(Math.max(page.widthPt, page.heightPt), 50 * FRAME_MM_TO_PT * long / short);
              const shortest = longest * short / long;
              resizePage(page.widthPt > page.heightPt ? longest : shortest, page.widthPt > page.heightPt ? shortest : longest);
              setRatioLocked(true);
            }}>{short}:{long}</button>)}
          </div>
          <div className={`table-frame-field-grid table-frame-page-dimensions${squareGrid ? " is-square" : ""}`}>
            <FrameNumberField inputRef={widthInput} label={squareGrid ? label("Side", "边长") : label("W", "宽度")} value={page.widthPt} min={50} max={pageMaximum} onCommit={(value) => resizeDimension("width", value)} />
            {!squareGrid && <><button type="button" className="table-frame-ratio-lock" aria-label={label("Lock aspect ratio", "固定比例")} title={label("Lock aspect ratio", "固定比例")} aria-pressed={ratioLocked} onClick={() => setRatioLocked((locked) => !locked)}><img src={lockIcon} alt="" width="14" height="14" /></button><FrameNumberField label={label("H", "高度")} value={page.heightPt} min={50} max={pageMaximum} onCommit={(value) => resizeDimension("height", value)} /></>}
          </div>
        </section>
        <PaperControls paper={framePaper(page)} zh={zh} caretIcon={chevronIcon} onChange={(paper) => { onExecute({ type: "set-frame-paper", frameId: frame.id, paper }); return true; }} />
        {family.id === "frames" && <FrameEdgeControls frame={frame} onExecute={onExecute} />}
        <section className="table-frame-section"><h3>{label("Export", "导出")}</h3>{exportButton}</section>
      </>}
      {slot && <>
        <section className="table-frame-section"><h3>{label("Photo box", "照片框")} {String(page.slots.indexOf(slot) + 1).padStart(2, "0")}</h3>{geometry}</section>
        <section className="table-frame-section"><h3>{label("Corner radius", "圆角半径")}</h3><input className="table-frame-radius" aria-label={label("Corner radius", "圆角半径")} type="range" min="0" max="32" step="1" value={slot.cornerRadiusPt ?? page.cornerRadiusPt ?? 0} onChange={(event) => onExecute({ type: "set-frame-slot-corner-radius", frameId: frame.id, slotId: slot.id, cornerRadiusPt: Number(event.currentTarget.value) })} /></section>
        <PhotoInnerEdgeControls frameToolbar edge={slot.innerEdge ?? frameInnerEdge(page)} onChange={(edge) => onExecute({ type: "set-frame-slot-inner-edge", frameId: frame.id, slotId: slot.id, edge })} />
        {slot.photoId && <section className="table-frame-section"><h3>{label("Photo fit", "照片适配")}</h3><div className="table-frame-segments" role="group" aria-label={label("Photo fit", "照片适配")}>
          {(["fill", "fit"] as const).map((mode) => <button key={mode} type="button" aria-pressed={(cropDraft ?? slot.crop).mode === mode} onClick={() => cropDraft ? onCropDraft({ ...cropDraft, mode }) : onExecute({ type: "set-frame-photo-crop", frameId: frame.id, slotId: slot.id, crop: { ...slot.crop, mode } })}>{mode === "fill" ? label("Cover", "填满") : label("Contain", "完整显示")}</button>)}
        </div><FramePhotoElevationControls frame={frame} slot={slot} onExecute={onExecute} />
          <div className="table-frame-action-row"><button type="button" onClick={() => onCropDraft(cropDraft ? undefined : slot.crop)}>{cropDraft ? label("Cancel crop", "取消裁切") : label("Adjust crop", "调整裁切")}</button><button type="button" onClick={() => { onCropDraft(undefined); onExecute({ type: "clear-frame-photo", frameId: frame.id, slotId: slot.id }); }}>{label("Clear photo", "清空照片")}</button></div>
          {cropDraft && <div className="table-frame-crop-tools"><label>{label("Zoom", "缩放")} <strong>{Math.round(cropDraft.zoom * 100)}%</strong><input aria-label={label("Crop zoom", "裁切缩放")} type="range" min="1" max="8" step="0.01" value={cropDraft.zoom} onChange={(event) => onCropDraft({ ...cropDraft, zoom: Number(event.target.value) })} /></label><button type="button" onClick={onFinishCrop}>{label("Done", "完成")}</button></div>}
        </section>}
        <section className="table-frame-section"><button type="button" className="table-frame-remove-box" onClick={() => { onCropDraft(undefined); onExecute({ type: "remove-frame-slot", frameId: frame.id, slotId: slot.id }); onSelectSlot(undefined); }}>{label("Remove photo box", "移除照片框")}</button></section>
      </>}
      {textBox && <>
        <section className="table-frame-section"><h3>{label("Text box", "文字框")}</h3>{geometry}</section>
        <FrameTextControls frame={frame} textBox={textBox} onExecute={onExecute} />
        <section className="table-frame-section"><button type="button" className="table-frame-remove-box" onClick={() => { onExecute({ type: "remove-frame-text", frameId: frame.id, textId: textBox.id }); onSelectText(undefined); }}>{label("Remove text box", "移除文字框")}</button></section>
      </>}
    </div>
  </div>;
}
