import { useEffect, useRef, type ReactNode } from "react";
import { PaperControls } from "./LayoutPaperControls";
import { FrameCaptionControls, FrameEdgeControls, FrameInnerEdgeControls } from "./FrameAppearanceControls";
import { FrameTemplatePreview } from "./FrameTemplatePreview";
import type { FrameCrop, FrameEditCommand, FrameId, FrameRect, FrameSlot, FrameSlotId, FrameTemplateFamily, FrameTemplateSource, WorktableFrame } from "../contracts";
import { FRAME_MM_TO_PT, FRAME_PAGE_PRESETS, FRAME_FAMILIES, frameFamily, framePageSize, framePaper, frameTemplateSource } from "../modules/worktable/frameLayout";
import { useLocale } from "./locale";
import { frameFamilyLabel, frameTemplateLabel } from "./frameLabels";

interface FrameSettingsPanelProps {
  readonly frame: WorktableFrame;
  readonly slot?: FrameSlot;
  readonly cropDraft?: FrameCrop;
  readonly onCropDraft: (crop: FrameCrop | undefined) => void;
  readonly onFinishCrop: () => void;
  readonly onSelectSlot: (slotId: FrameSlotId | undefined) => void;
  readonly onClose: () => void;
  readonly onExecute: (command: FrameEditCommand) => void;
  readonly exportButton: ReactNode;
}

const mm = (pt: number) => Math.round(pt / FRAME_MM_TO_PT * 10) / 10;


export function FrameSettingsPanel({ frame, slot, cropDraft, onCropDraft, onFinishCrop, onSelectSlot, onClose, onExecute, exportButton }: FrameSettingsPanelProps) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const page = frame.page;
  const layout = page.templateSource;
  const squareGrid = layout.id === "square-nine-grid";
  const family = frameFamily(layout.id);
  const paper = framePaper(page);
  const widthInput = useRef<HTMLInputElement>(null);
  const photoSettings = useRef<HTMLElement>(null);
  useEffect(() => { if (slot) photoSettings.current?.scrollIntoView?.({ block: "nearest" }); }, [slot?.id]);
  const applyTemplate = (template: FrameTemplateSource) => onExecute({ type: "apply-frame-template", frameId: frame.id, template, expectedSlotIds: page.slots.map((item) => item.id) });
  const resizePage = (widthPt: number, heightPt: number) => onExecute({ type: "resize-frame-page", frameId: frame.id, widthPt, heightPt, reflow: true });
  const currentPreset = Object.entries(FRAME_PAGE_PRESETS).find(([, pair]) => Math.abs(Math.min(page.widthPt, page.heightPt) / FRAME_MM_TO_PT - Math.min(...pair)) < .1
    && Math.abs(Math.max(page.widthPt, page.heightPt) / FRAME_MM_TO_PT - Math.max(...pair)) < .1)?.[0] ?? "Custom";
  const numberField = (label: string, value: number, onCommit: (valuePt: number) => void, minimum = 0, maximum = family.id === "plain" ? 600 : 1000) =>
    <label className="table-frame-number"><span>{label}</span><span className="table-frame-number-control"><input key={`${label}-${value}`} aria-label={`${label} mm`} type="number" min={minimum} max={maximum} step="0.1" defaultValue={mm(value)}
      onBlur={(event) => { const entered = Number(event.currentTarget.value); if (event.currentTarget.value !== "" && Number.isFinite(entered) && entered >= minimum && entered <= maximum) onCommit(entered * FRAME_MM_TO_PT); else event.currentTarget.value = String(mm(value)); }} /><em>mm</em></span></label>;
  const updateSlotRect = (field: keyof FrameRect, valuePt: number) => {
    if (!slot) return;
    onExecute({ type: "transform-frame-slot", frameId: frame.id, slotId: slot.id, rect: { ...slot.rect, [field]: valuePt } });
  };
  const header = <header className="table-frame-panel-header">
    <div><strong>{label("Frame settings", "画框设置")}</strong><small>{`${frameFamilyLabel(family, zh)} · ${frameTemplateLabel(layout.id, zh)}`}</small></div>
    <button type="button" className="table-frame-panel-close" aria-label={label("Close Frame settings", "关闭画框设置")} onClick={onClose}>×</button>
  </header>;

  return <div className="table-frame-panel" onPointerDown={(event) => event.stopPropagation()}>{header}<div className="table-frame-inspector" data-frame-family={family.id}>
    <section className="table-frame-section"><h3>{label("TEMPLATE", "模板")} <span>{zh ? `${page.slots.length} 个照片框` : `${page.slots.length} photo boxes`}</span></h3>
      <select className="table-frame-family-select" aria-label={label("Template family", "模板类型")} value={family.id === "sheets" ? "plain" : family.id} onChange={(event) => { const next = FRAME_FAMILIES.find((entry) => entry.id === event.currentTarget.value as FrameTemplateFamily)!; onCropDraft(undefined); onSelectSlot(undefined); applyTemplate(frameTemplateSource(next.templateIds[0])); }}>{FRAME_FAMILIES.map((entry) => <option key={entry.id} value={entry.id}>{frameFamilyLabel(entry, zh)}</option>)}</select>
      <div className="table-frame-template-strip" role="group" aria-label={label("Template", "模板")}>
        {(family.id === "sheets" ? FRAME_FAMILIES[0].templateIds : family.templateIds).map((id) => <button key={id} type="button" title={frameTemplateLabel(id, zh)} aria-label={frameTemplateLabel(id, zh)} aria-pressed={layout.id === id} onClick={() => { onCropDraft(undefined); onSelectSlot(undefined); applyTemplate(frameTemplateSource(id, layout.direction)); }}><FrameTemplatePreview id={id} /><span>{frameTemplateLabel(id, zh)}</span></button>)}
      </div>
    </section>
    {(layout.id === "diptych" || layout.id === "triptych") && <section className="table-frame-section"><h3>{label("DIRECTION", "排列方向")}</h3><div className="table-frame-segments" role="group" aria-label={label("Layout direction", "排列方向")}>
      <button type="button" aria-pressed={layout.direction === "vertical"} onClick={() => applyTemplate({ ...layout, direction: "vertical" })}>▤ {label("Down", "纵向")}</button>
      <button type="button" aria-pressed={layout.direction === "horizontal"} onClick={() => applyTemplate({ ...layout, direction: "horizontal" })}>▥ {label("Across", "横向")}</button>
    </div></section>}
    <section className="table-frame-section"><h3>{label("PAGE SIZE", "页面尺寸")}</h3>{family.id === "plain" ? <div className="table-frame-preset-strip" role="group" aria-label={label("Page size", "页面尺寸")}>
      {(["A4", "A5", "Letter", "Square", "Panoramic"] as const).map((preset) => { const pair = FRAME_PAGE_PRESETS[preset]; return <button key={preset} type="button" aria-pressed={currentPreset === preset} disabled={squareGrid && preset !== "Square"} onClick={() => {
        const landscape = page.widthPt > page.heightPt;
        resizePage((landscape ? Math.max(...pair) : Math.min(...pair)) * FRAME_MM_TO_PT, (landscape ? Math.min(...pair) : Math.max(...pair)) * FRAME_MM_TO_PT);
      }}>{preset === "Square" ? label(preset, "方形") : preset === "Panoramic" ? label(preset, "全景") : preset === "Letter" ? label(preset, "美式信纸") : preset}</button>; })}
      <button type="button" aria-pressed={currentPreset === "Custom"} onClick={() => widthInput.current?.focus()}>{label("Custom", "自定义")}</button>
    </div> : <button type="button" className="table-frame-native-size" onClick={() => { const size = framePageSize(layout.id); resizePage(size.widthPt, size.heightPt); }}>{label("Reset to template size", "恢复模板尺寸")}</button>}{!squareGrid && <div className="table-frame-segments table-frame-orientation" role="group" aria-label={label("Orientation", "页面方向")}>
      <button type="button" aria-pressed={page.widthPt <= page.heightPt} onClick={() => resizePage(Math.min(page.widthPt, page.heightPt), Math.max(page.widthPt, page.heightPt))}>▯ {label("Portrait", "竖向")}</button>
      <button type="button" aria-pressed={page.widthPt > page.heightPt} onClick={() => resizePage(Math.max(page.widthPt, page.heightPt), Math.min(page.widthPt, page.heightPt))}>▭ {label("Landscape", "横向")}</button>
    </div>}
      <div className="table-frame-field-grid">
        <label className="table-frame-number"><span>{squareGrid ? label("Side", "边长") : label("W", "宽度")}</span><span className="table-frame-number-control"><input ref={widthInput} key={`w-${page.widthPt}`} aria-label={`${label("W", "宽度")} mm`} type="number" min="50" max={family.id === "plain" ? 600 : 1000} step="0.1" defaultValue={mm(page.widthPt)} onBlur={(event) => { const value = Number(event.currentTarget.value); if (value >= 50 && value <= (family.id === "plain" ? 600 : 1000)) resizePage(value * FRAME_MM_TO_PT, squareGrid ? value * FRAME_MM_TO_PT : page.heightPt); else event.currentTarget.value = String(mm(page.widthPt)); }} /><em>mm</em></span></label>
        {!squareGrid && numberField(label("H", "高度"), page.heightPt, (value) => resizePage(page.widthPt, value), 50)}
      </div>{squareGrid && <p className="table-frame-hint">{label("Nine equal squares cover the full square page.", "九个等大的正方形照片框铺满整个页面。")}</p>}
    </section>
    <section className="table-frame-section table-frame-photo-box-section"><h3>{label("PHOTO BOXES", "照片框")} <span>{page.slots.length}</span></h3><button type="button" className="table-frame-add-box" onClick={() => { const slotId = crypto.randomUUID() as FrameSlotId; onExecute({ type: "add-frame-slot", frameId: frame.id, slotId }); onSelectSlot(slotId); }}><span aria-hidden="true">＋</span>{label("Add photo box", "添加照片框")}</button></section>
    <PaperControls paper={paper} zh={zh} onChange={(next) => { onExecute({ type: "set-frame-paper", frameId: frame.id, paper: next }); return true; }} />
    {family.id === "frames" && <FrameEdgeControls frame={frame} onExecute={onExecute} />}
    <FrameInnerEdgeControls frame={frame} onExecute={onExecute} />
    <section className="table-frame-section"><h3>{label("IMAGE FIT", "图像适配")} <span>{label("All photo boxes", "所有照片框")}</span></h3><div className="table-frame-segments" role="group" aria-label={label("Page image fit", "页面图像适配")}>{(["fill", "fit"] as const).map((mode) => <button key={mode} type="button" aria-pressed={page.slots.length > 0 && page.slots.every((item) => item.crop.mode === mode)} onClick={() => { onCropDraft(undefined); onExecute({ type: "set-frame-photo-fit", frameId: frame.id, mode }); }}>{mode === "fill" ? label("Cover", "填满") : label("Contain", "完整显示")}</button>)}</div></section>
    {family.id !== "sheets" && <FrameCaptionControls frame={frame} onExecute={onExecute} />}
    <section className="table-frame-section"><h3>{label("EXPORT", "导出")}</h3>{exportButton}</section>
    <section className="table-frame-section table-frame-footer"><div className="table-frame-action-row"><button type="button" onClick={() => onExecute({ type: "bring-frame-to-front", frameId: frame.id })}>{label("Front", "置顶")}</button><button type="button" onClick={() => onExecute({ type: "duplicate-frame", frameId: frame.id, copyId: crypto.randomUUID() as FrameId, slotIds: page.slots.map(() => crypto.randomUUID() as FrameSlotId) })}>{label("Duplicate", "复制")}</button><button type="button" className="is-danger" onClick={() => onExecute({ type: "remove-frame", frameId: frame.id })}>{label("Delete", "删除")}</button></div></section>
    {slot && <section ref={photoSettings} className="table-frame-section table-frame-selected-box"><h3>{label("PHOTO BOX", "照片框")} {String(page.slots.indexOf(slot) + 1).padStart(2, "0")}<button type="button" aria-label={label("Deselect photo box", "取消选择照片框")} onClick={() => { onCropDraft(undefined); onSelectSlot(undefined); }}>×</button></h3><div className="table-frame-field-grid">
      {numberField(label("X", "X 坐标"), slot.rect.x, (value) => updateSlotRect("x", value))}
      {numberField(label("Y", "Y 坐标"), slot.rect.y, (value) => updateSlotRect("y", value))}
      {numberField(label("W", "宽度"), slot.rect.width, (value) => updateSlotRect("width", value), 1)}
      {numberField(label("H", "高度"), slot.rect.height, (value) => updateSlotRect("height", value), 1)}
    </div></section>}
    {slot && <section className="table-frame-section"><h3>{label("CORNER RADIUS", "圆角半径")} <span>{mm(slot.cornerRadiusPt ?? page.cornerRadiusPt ?? 0).toFixed(1)} mm</span></h3><input className="table-frame-radius" aria-label={label("Corner radius", "圆角半径")} type="range" min="0" max="32" step="1" value={slot.cornerRadiusPt ?? page.cornerRadiusPt ?? 0} onChange={(event) => onExecute({ type: "set-frame-slot-corner-radius", frameId: frame.id, slotId: slot.id, cornerRadiusPt: Number(event.currentTarget.value) })} /></section>}
    {slot && (slot.photoId ? <section className="table-frame-section"><h3>{label("PHOTO FIT", "照片适配")}</h3><div className="table-frame-segments" role="group" aria-label={label("Photo fit", "照片适配")}>
      {(["fill", "fit"] as const).map((mode) => <button key={mode} type="button" aria-pressed={(cropDraft ?? slot.crop).mode === mode}
        onClick={() => cropDraft ? onCropDraft({ ...cropDraft, mode }) : onExecute({ type: "set-frame-photo-crop", frameId: frame.id, slotId: slot.id, crop: { ...slot.crop, mode } })}>{mode === "fill" ? label("Fill", "填满") : label("Fit", "完整显示")}</button>)}
    </div><p className="table-frame-hint">{label("Double-click to crop, then drag the photo and scroll to zoom. Right-drag to adjust directly.", "双击进入裁切，拖动照片并滚轮缩放；右键拖动可直接调整。")}</p>
      <div className="table-frame-action-row"><button type="button" onClick={() => onCropDraft(cropDraft ? undefined : slot.crop)}>{cropDraft ? label("Cancel crop", "取消裁切") : label("Adjust crop", "调整裁切")}</button><button type="button" onClick={() => onExecute({ type: "clear-frame-photo", frameId: frame.id, slotId: slot.id })}>{label("Clear photo", "清空照片")}</button></div>
      {cropDraft && <div className="table-frame-crop-tools"><label>{label("Zoom", "缩放")} <strong>{Math.round(cropDraft.zoom * 100)}%</strong><input type="range" min="1" max="8" step="0.01" value={cropDraft.zoom} onChange={(event) => onCropDraft({ ...cropDraft, zoom: Number(event.target.value) })} /></label><button type="button" onClick={onFinishCrop}>{label("Done", "完成")}</button></div>}
    </section> : <section className="table-frame-section"><h3>{label("PHOTO", "照片")}</h3><p className="table-frame-hint">{label("Drop a photo onto this box to place it.", "将照片拖入此框即可放置。")}</p></section>)}
    {slot && <section className="table-frame-section"><h3>{label("ARRANGE", "排列")}</h3><div className="table-frame-action-row">
      <button type="button" aria-label={label("Front photo box", "照片框置顶")} onClick={() => onExecute({ type: "bring-frame-slot-to-front", frameId: frame.id, slotId: slot.id })}>{label("Front", "置顶")}</button>
      {slot.photoId && <><button type="button" disabled={page.slots.indexOf(slot) === 0} onClick={() => { const i = page.slots.indexOf(slot); onExecute({ type: "swap-frame-photos", frameId: frame.id, firstId: slot.id, secondId: page.slots[i - 1].id }); }}>← {label("Swap", "交换")}</button>
        <button type="button" disabled={page.slots.indexOf(slot) === page.slots.length - 1} onClick={() => { const i = page.slots.indexOf(slot); onExecute({ type: "swap-frame-photos", frameId: frame.id, firstId: slot.id, secondId: page.slots[i + 1].id }); }}>{label("Swap", "交换")} →</button></>}
    </div></section>}
    {slot && <section className="table-frame-section"><button type="button" className="table-frame-remove-box" onClick={() => { onExecute({ type: "remove-frame-slot", frameId: frame.id, slotId: slot.id }); onCropDraft(undefined); onSelectSlot(undefined); }}>{label("Remove photo box", "移除照片框")}</button></section>}
  </div></div>;
}
