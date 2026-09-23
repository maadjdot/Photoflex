import { useEffect, useRef } from "react";
import type { FrameCrop, FrameEditCommand, FrameId, FrameRect, FrameSlot, FrameSlotId, FrameTemplateId, FrameTemplateSource, WorktableFrame } from "../contracts";
import { FRAME_MM_TO_PT, FRAME_PAGE_PRESETS, FRAME_TEMPLATE_LABELS, FRAME_TEMPLATES, frameTemplateSource } from "../modules/worktable/frameLayout";

interface FrameSettingsPanelProps {
  readonly frame: WorktableFrame;
  readonly slot?: FrameSlot;
  readonly cropDraft?: FrameCrop;
  readonly onCropDraft: (crop: FrameCrop | undefined) => void;
  readonly onFinishCrop: () => void;
  readonly onSelectSlot: (slotId: FrameSlotId | undefined) => void;
  readonly onClose: () => void;
  readonly onExecute: (command: FrameEditCommand) => void;
}

const mm = (pt: number) => Math.round(pt / FRAME_MM_TO_PT * 10) / 10;
const labels = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" } as const;
type MarginEdge = keyof typeof labels;

export function FrameSettingsPanel({ frame, slot, cropDraft, onCropDraft, onFinishCrop, onSelectSlot, onClose, onExecute }: FrameSettingsPanelProps) {
  const page = frame.page;
  const layout = page.templateSource;
  const squareGrid = layout.id === "square-nine-grid";
  const widthInput = useRef<HTMLInputElement>(null);
  const photoSettings = useRef<HTMLElement>(null);
  useEffect(() => { if (slot) photoSettings.current?.scrollIntoView?.({ block: "nearest" }); }, [slot?.id]);
  const applyTemplate = (template: FrameTemplateSource) => onExecute({ type: "apply-frame-template", frameId: frame.id, template, expectedSlotIds: page.slots.map((item) => item.id) });
  const resizePage = (widthPt: number, heightPt: number) => onExecute({ type: "resize-frame-page", frameId: frame.id, widthPt, heightPt, reflow: true });
  const currentPreset = Object.entries(FRAME_PAGE_PRESETS).find(([, pair]) => Math.abs(Math.min(page.widthPt, page.heightPt) / FRAME_MM_TO_PT - Math.min(...pair)) < .1
    && Math.abs(Math.max(page.widthPt, page.heightPt) / FRAME_MM_TO_PT - Math.max(...pair)) < .1)?.[0] ?? "Custom";
  const numberField = (label: string, value: number, onCommit: (valuePt: number) => void, minimum = 0, maximum = 600) =>
    <label className="table-frame-number"><span>{label}</span><span className="table-frame-number-control"><input key={`${label}-${value}`} aria-label={`${label} mm`} type="number" min={minimum} max={maximum} step="0.1" defaultValue={mm(value)}
      onBlur={(event) => { const entered = Number(event.currentTarget.value); if (event.currentTarget.value !== "" && Number.isFinite(entered) && entered >= minimum && entered <= maximum) onCommit(entered * FRAME_MM_TO_PT); else event.currentTarget.value = String(mm(value)); }} /><em>mm</em></span></label>;
  const updateSlotRect = (field: keyof FrameRect, valuePt: number) => {
    if (!slot) return;
    onExecute({ type: "transform-frame-slot", frameId: frame.id, slotId: slot.id, rect: { ...slot.rect, [field]: valuePt } });
  };
  const header = <header className="table-frame-panel-header">
    <div><strong>Frame settings</strong><small>{`${FRAME_TEMPLATE_LABELS[layout.id]} · ${page.slots.length} boxes`}</small></div>
    <button type="button" className="table-frame-panel-close" aria-label="Close Frame settings" onClick={onClose}>×</button>
  </header>;

  return <div className="table-frame-panel" onPointerDown={(event) => event.stopPropagation()}>{header}<div className="table-frame-inspector">
    <section className="table-frame-section"><h3>TEMPLATE</h3><div className="table-frame-template-strip" role="group" aria-label="Template">
      {FRAME_TEMPLATES.map((id: FrameTemplateId) => <button key={id} type="button" title={FRAME_TEMPLATE_LABELS[id]} aria-label={FRAME_TEMPLATE_LABELS[id]} aria-pressed={layout.id === id} onClick={() => applyTemplate(frameTemplateSource(id, layout.direction))}>
        <span className={`table-frame-mini mini-${id}`} aria-hidden="true" /></button>)}
    </div></section>
    {(layout.id === "diptych" || layout.id === "triptych") && <section className="table-frame-section"><h3>DIRECTION</h3><div className="table-frame-segments" role="group" aria-label="Layout direction">
      <button type="button" aria-pressed={layout.direction === "vertical"} onClick={() => applyTemplate({ ...layout, direction: "vertical" })}>▤ Down</button>
      <button type="button" aria-pressed={layout.direction === "horizontal"} onClick={() => applyTemplate({ ...layout, direction: "horizontal" })}>▥ Across</button>
    </div></section>}
    {!squareGrid && layout.id !== "full-page" && <><section className="table-frame-section"><h3>MARGINS (MM)</h3><div className="table-frame-margin-editor">
      {(["top", "left", "right", "bottom"] as MarginEdge[]).map((edge) => <label key={edge} className={`margin-${edge}`}><span>{labels[edge]}</span><input aria-label={`Margin ${edge} mm`} type="number" min="0" max="100" step="0.1" value={mm(layout.marginsPt[edge])} onChange={(event) => { const value = Number(event.currentTarget.value); if (event.currentTarget.value !== "" && Number.isFinite(value) && value >= 0) applyTemplate({ ...layout, marginsPt: { ...layout.marginsPt, [edge]: value * FRAME_MM_TO_PT } }); }} /></label>)}
      <div className="margin-paper" aria-hidden="true" />
    </div></section><section className="table-frame-section"><h3>GAP</h3>{numberField("Gap", layout.gapPt, (value) => applyTemplate({ ...layout, gapPt: value }), 0, 100)}</section></>}
    <section className="table-frame-section"><h3>PAGE SIZE</h3><div className="table-frame-preset-strip" role="group" aria-label="Page size">
      {(["A4", "A5", "Letter", "Square", "Panoramic"] as const).map((preset) => { const pair = FRAME_PAGE_PRESETS[preset]; return <button key={preset} type="button" aria-pressed={currentPreset === preset} disabled={squareGrid && preset !== "Square"} onClick={() => {
        const landscape = page.widthPt > page.heightPt;
        resizePage((landscape ? Math.max(...pair) : Math.min(...pair)) * FRAME_MM_TO_PT, (landscape ? Math.min(...pair) : Math.max(...pair)) * FRAME_MM_TO_PT);
      }}>{preset}</button>; })}
      <button type="button" aria-pressed={currentPreset === "Custom"} onClick={() => widthInput.current?.focus()}>Custom</button>
    </div>{!squareGrid && <div className="table-frame-segments table-frame-orientation" role="group" aria-label="Orientation">
      <button type="button" aria-pressed={page.widthPt <= page.heightPt} onClick={() => resizePage(Math.min(page.widthPt, page.heightPt), Math.max(page.widthPt, page.heightPt))}>▯ Portrait</button>
      <button type="button" aria-pressed={page.widthPt > page.heightPt} onClick={() => resizePage(Math.max(page.widthPt, page.heightPt), Math.min(page.widthPt, page.heightPt))}>▭ Landscape</button>
    </div>}
      <div className="table-frame-field-grid">
        <label className="table-frame-number"><span>{squareGrid ? "Side" : "W"}</span><span className="table-frame-number-control"><input ref={widthInput} key={`w-${page.widthPt}`} aria-label="W mm" type="number" min="50" max="600" step="0.1" defaultValue={mm(page.widthPt)} onBlur={(event) => { const value = Number(event.currentTarget.value); if (value >= 50 && value <= 600) resizePage(value * FRAME_MM_TO_PT, squareGrid ? value * FRAME_MM_TO_PT : page.heightPt); else event.currentTarget.value = String(mm(page.widthPt)); }} /><em>mm</em></span></label>
        {!squareGrid && numberField("H", page.heightPt, (value) => resizePage(page.widthPt, value), 50)}
      </div>{squareGrid && <p className="table-frame-hint">Nine equal squares cover the full square page.</p>}
    </section>
    <section className="table-frame-section table-frame-photo-box-section"><h3>PHOTO BOXES <span>{page.slots.length}</span></h3><button type="button" className="table-frame-add-box" onClick={() => { const slotId = crypto.randomUUID() as FrameSlotId; onExecute({ type: "add-frame-slot", frameId: frame.id, slotId }); onSelectSlot(slotId); }}><span aria-hidden="true">＋</span>Add photo box</button></section>
    <section className="table-frame-section"><h3>BACKGROUND</h3><div className="table-frame-background-options" role="group" aria-label="Background color">{(["white", "black"] as const).map((background) => <button key={background} type="button" aria-label={background === "white" ? "White background" : "Black background"} aria-pressed={(page.background ?? "white") === background} onClick={() => onExecute({ type: "set-frame-background", frameId: frame.id, background })}><span className={`swatch-${background}`} />{background === "white" ? "White" : "Black"}</button>)}</div></section>
    <section className="table-frame-section"><h3>BLEED</h3>{numberField("Bleed", page.bleedPt ?? 0, (value) => onExecute({ type: "set-frame-bleed", frameId: frame.id, bleedPt: value }), 0, 20)}<p className="table-frame-hint">Shows the print bleed boundary around the page.</p></section>
    <section className="table-frame-section table-frame-footer"><div className="table-frame-action-row"><button type="button" onClick={() => onExecute({ type: "bring-frame-to-front", frameId: frame.id })}>Front</button><button type="button" onClick={() => onExecute({ type: "duplicate-frame", frameId: frame.id, copyId: crypto.randomUUID() as FrameId, slotIds: page.slots.map(() => crypto.randomUUID() as FrameSlotId) })}>Duplicate</button><button type="button" className="is-danger" onClick={() => onExecute({ type: "remove-frame", frameId: frame.id })}>Delete</button></div></section>
    {slot && <section ref={photoSettings} className="table-frame-section table-frame-selected-box"><h3>PHOTO BOX {String(page.slots.indexOf(slot) + 1).padStart(2, "0")}<button type="button" aria-label="Deselect photo box" onClick={() => { onCropDraft(undefined); onSelectSlot(undefined); }}>×</button></h3><div className="table-frame-field-grid">
      {numberField("X", slot.rect.x, (value) => updateSlotRect("x", value))}
      {numberField("Y", slot.rect.y, (value) => updateSlotRect("y", value))}
      {numberField("W", slot.rect.width, (value) => updateSlotRect("width", value), 1)}
      {numberField("H", slot.rect.height, (value) => updateSlotRect("height", value), 1)}
    </div></section>}
    {slot && <section className="table-frame-section"><h3>CORNER RADIUS <span>{mm(slot.cornerRadiusPt ?? page.cornerRadiusPt ?? 0).toFixed(1)} mm</span></h3><input className="table-frame-radius" aria-label="Corner radius" type="range" min="0" max="32" step="1" value={slot.cornerRadiusPt ?? page.cornerRadiusPt ?? 0} onChange={(event) => onExecute({ type: "set-frame-slot-corner-radius", frameId: frame.id, slotId: slot.id, cornerRadiusPt: Number(event.currentTarget.value) })} /></section>}
    {slot && (slot.photoId ? <section className="table-frame-section"><h3>PHOTO FIT</h3><div className="table-frame-segments" role="group" aria-label="Photo fit">
      {(["fill", "fit"] as const).map((mode) => <button key={mode} type="button" aria-pressed={(cropDraft ?? slot.crop).mode === mode}
        onClick={() => cropDraft ? onCropDraft({ ...cropDraft, mode }) : onExecute({ type: "set-frame-photo-crop", frameId: frame.id, slotId: slot.id, crop: { ...slot.crop, mode } })}>{mode === "fill" ? "Fill" : "Fit"}</button>)}
    </div><p className="table-frame-hint">{slot.crop.mode === "fill" ? "Right-drag the photo to adjust its crop." : "Show the entire photo inside the box."}</p>
      <div className="table-frame-action-row"><button type="button" onClick={() => onCropDraft(cropDraft ? undefined : slot.crop)}>{cropDraft ? "Cancel crop" : "Adjust crop"}</button><button type="button" onClick={() => onExecute({ type: "clear-frame-photo", frameId: frame.id, slotId: slot.id })}>Clear photo</button></div>
      {cropDraft && <div className="table-frame-crop-tools"><label>Zoom <strong>{Math.round(cropDraft.zoom * 100)}%</strong><input type="range" min="1" max="8" step="0.01" value={cropDraft.zoom} onChange={(event) => onCropDraft({ ...cropDraft, zoom: Number(event.target.value) })} /></label><button type="button" onClick={onFinishCrop}>Done</button></div>}
    </section> : <section className="table-frame-section"><h3>PHOTO</h3><p className="table-frame-hint">Drop a photo onto this box to place it.</p></section>)}
    {slot && <section className="table-frame-section"><h3>ARRANGE</h3><div className="table-frame-action-row">
      <button type="button" aria-label="Front photo box" onClick={() => onExecute({ type: "bring-frame-slot-to-front", frameId: frame.id, slotId: slot.id })}>Front</button>
      {slot.photoId && <><button type="button" disabled={page.slots.indexOf(slot) === 0} onClick={() => { const i = page.slots.indexOf(slot); onExecute({ type: "swap-frame-photos", frameId: frame.id, firstId: slot.id, secondId: page.slots[i - 1].id }); }}>← Swap</button>
        <button type="button" disabled={page.slots.indexOf(slot) === page.slots.length - 1} onClick={() => { const i = page.slots.indexOf(slot); onExecute({ type: "swap-frame-photos", frameId: frame.id, firstId: slot.id, secondId: page.slots[i + 1].id }); }}>Swap →</button></>}
    </div></section>}
    {slot && <section className="table-frame-section"><button type="button" className="table-frame-remove-box" onClick={() => { onExecute({ type: "remove-frame-slot", frameId: frame.id, slotId: slot.id }); onCropDraft(undefined); onSelectSlot(undefined); }}>Remove photo box</button></section>}
  </div></div>;
}
