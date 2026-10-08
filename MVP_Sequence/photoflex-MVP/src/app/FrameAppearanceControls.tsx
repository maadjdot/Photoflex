import { useEffect, useState, type CSSProperties } from "react";
import type { FrameEdgeStyle, FrameEditCommand, FrameInnerEdge, FrameSlot, FrameTextBox, WorktableFrame } from "../contracts";
import { FrameSelect } from "./FrameSelect";
import { FrameNumberField } from "./FrameNumberField";
import { FRAME_EDGE_COLORS, FRAME_MM_TO_PT } from "../modules/worktable/frameLayout";
import { FRAME_EDGE_MATERIALS, frameEdgeStyle } from "../modules/worktable/frameAppearance";
import { LAYOUT_FONTS } from "../modules/layout/layoutFonts";
import "../styles/layout-fonts.css";
import { useLocale } from "./locale";
import { frameEdgeColorLabel, frameEdgeMaterialLabel } from "./frameLabels";

export function FrameAppearanceNumberField({ label, value, unit = "mm", min = 0, max = 1000, onCommit, steppers = false }: {
  label: string; value: number; unit?: "mm" | "pt"; min?: number; max?: number; onCommit: (value: number) => void; steppers?: boolean;
}) {
  if (steppers) return <FrameNumberField label={label} value={value} unit={unit} min={min} max={max} onCommit={onCommit} />;
  const factor = unit === "mm" ? FRAME_MM_TO_PT : 1;
  const displayed = Math.round(value / factor * 10) / 10;
  return <label className="table-frame-number"><span>{label}</span><span className="table-frame-number-control"><input key={`${label}-${value}`} aria-label={`${label} ${unit}`} type="number" min={min} max={max} step="0.1" defaultValue={displayed} onBlur={(event) => {
    const next = Number(event.currentTarget.value);
    if (event.currentTarget.value !== "" && Number.isFinite(next) && next >= min && next <= max) onCommit(next * factor);
    else event.currentTarget.value = String(displayed);
  }} /><em>{unit}</em></span></label>;
}
const NumberField = FrameNumberField;

type Props = { readonly frame: WorktableFrame; readonly onExecute: (command: FrameEditCommand) => void };
export function PhotoInnerEdgeControls({ edge, onChange, frameToolbar = false }: { readonly edge: FrameInnerEdge; readonly onChange: (edge: FrameInnerEdge) => void; readonly frameToolbar?: boolean }) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const update = (changes: Partial<FrameInnerEdge>) => onChange({ ...edge, ...changes });
  return <section className="table-frame-section"><h3>{label(frameToolbar ? "Inner edge" : "INNER EDGE", "内边框")}{!frameToolbar && <span>{label("Photo edges", "照片边缘")}</span>}</h3>
    <div className="table-frame-segments" role="group" aria-label={label("Inner edge", "内边框")}>{(["none", "color", "bevel"] as const).map((mode) => <button key={mode} type="button" aria-pressed={edge.mode === mode} onClick={() => update({ mode })}>{mode === "none" ? label("None", "无") : mode === "color" ? label("Color", "纯色") : label("Mat bevel", "卡纸斜边")}</button>)}</div>
    {edge.mode !== "none" && <div className="table-frame-field-grid"><FrameAppearanceNumberField steppers={frameToolbar} label={label("Inner edge width", "内边框宽度")} value={edge.widthPt} max={20} onCommit={(widthPt) => update({ widthPt })} /><label className="table-frame-number">{label("Color", "颜色")}<input type="color" aria-label={label("Inner edge color", "内边框颜色")} value={edge.color} onChange={(event) => update({ color: event.currentTarget.value })} /></label></div>}
    {edge.mode === "color" && <label className="table-frame-checkbox"><input type="checkbox" checked={edge.whiteGap !== false} onChange={(event) => update({ whiteGap: event.currentTarget.checked })} />{label("Thin white gap", "细白边")}</label>}
  </section>;
}

export function FrameEdgeControls({ frame, onExecute }: Props) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const style = frameEdgeStyle(frame.page);
  const color = frame.page.edgeColor ?? FRAME_EDGE_COLORS[0].color;
  const [customColor, setCustomColor] = useState(false);
  useEffect(() => setCustomColor(false), [frame.id]);
  const update = (changes: Partial<FrameEdgeStyle>) => onExecute({ type: "set-frame-edge-style", frameId: frame.id, style: { ...style, ...changes } });
  return <section className="table-frame-section"><h3>{label("Frame edge", "外边框")}</h3>
    <div className="table-frame-soft-group"><label className="table-frame-number"><span>{label("Color", "颜色")}</span><span className="table-frame-edge-color-field"><span className="layout-paper-color-swatch" style={{ backgroundColor: color }} /><FrameSelect aria-label={label("Frame edge color", "外边框颜色")} value={!customColor && FRAME_EDGE_COLORS.some((entry) => entry.color.toUpperCase() === color.toUpperCase()) ? color.toUpperCase() : "custom"} onChange={(event) => { setCustomColor(event.currentTarget.value === "custom"); if (event.currentTarget.value !== "custom") onExecute({ type: "set-frame-edge-color", frameId: frame.id, color: event.currentTarget.value }); }}>{FRAME_EDGE_COLORS.map((entry) => <option key={entry.color} value={entry.color.toUpperCase()}>{frameEdgeColorLabel(entry.name, zh)}</option>)}<option value="custom">{label("Custom", "自定义")}</option></FrameSelect></span></label>
    {(customColor || !FRAME_EDGE_COLORS.some((entry) => entry.color.toUpperCase() === color.toUpperCase())) && <label className="table-frame-custom-color">{label("Custom edge color", "自定义边框颜色")}<input type="color" aria-label={label("Custom frame edge color", "自定义外边框颜色")} value={color} onChange={(event) => onExecute({ type: "set-frame-edge-color", frameId: frame.id, color: event.currentTarget.value })} /></label>}
    </div>
    <div className="table-frame-field-grid"><NumberField label={label("Frame edge width", "外边框宽度")} value={style.widthPt} max={100} onCommit={(widthPt) => update({ widthPt })} /><label className="table-frame-number">{label("Material", "材质")}<FrameSelect aria-label={label("Frame material", "边框材质")} value={style.material} onChange={(event) => update({ material: event.currentTarget.value as FrameEdgeStyle["material"] })}>{FRAME_EDGE_MATERIALS.map((entry) => <option key={entry.id} value={entry.id}>{frameEdgeMaterialLabel(entry, zh)}</option>)}</FrameSelect></label></div>
    <label className="table-frame-effect-slider">{label("Shadow strength", "阴影强度")} <strong>{Math.round(style.shadowStrength * 100)}%</strong><input type="range" aria-label={label("Frame shadow strength", "边框阴影强度")} min="0" max="100" step="1" value={Math.round(style.shadowStrength * 100)} style={{ "--range-progress": `${style.shadowStrength * 100}%` } as CSSProperties} onChange={(event) => update({ shadowStrength: Number(event.currentTarget.value) / 100 })} /></label>
  </section>;
}

export function FramePhotoElevationControls({ frame, slot, onExecute }: Props & { readonly slot: FrameSlot }) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const style = frameEdgeStyle(frame.page);
  const elevationMm = Math.round((slot.photoElevationPt ?? style.photoElevationPt) / FRAME_MM_TO_PT * 10) / 10;
  return <label className="table-frame-effect-slider">{zh ? "照片浮起高度" : "Photo elevation"}<strong>{elevationMm} mm</strong><input type="range" aria-label={zh ? "照片浮起高度" : "Photo elevation"} min="0" max="20" step="1" value={elevationMm} style={{ "--range-progress": `${elevationMm * 5}%` } as CSSProperties} onChange={(event) => onExecute({ type: "set-frame-slot-elevation", frameId: frame.id, slotId: slot.id, photoElevationPt: Number(event.currentTarget.value) * FRAME_MM_TO_PT })} /></label>;
}

export function FrameTextControls({ frame, textBox, onExecute }: Props & { readonly textBox: FrameTextBox }) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const style = textBox.style;
  const update = (changes: Partial<FrameTextBox["style"]>) => onExecute({ type: "upsert-frame-text", frameId: frame.id, textBox: { ...textBox, style: { ...style, ...changes } } });
  return <section className="table-frame-section"><h3>{label("Text", "文字")}</h3>
    <label className="table-frame-caption-field">{label("Text", "文字")}<textarea key={`${textBox.id}-${textBox.text}`} aria-label={label("Frame text", "画框文字")} defaultValue={textBox.text} placeholder={label("Enter text…", "输入文字…")} onBlur={(event) => { if (event.currentTarget.value !== textBox.text) onExecute({ type: "upsert-frame-text", frameId: frame.id, textBox: { ...textBox, text: event.currentTarget.value } }); }} /></label>
    <label className="table-frame-number table-frame-caption-font">{label("Font", "字体")}<FrameSelect aria-label={label("Text font", "文字字体")} value={style.fontFamily} onChange={(event) => update({ fontFamily: event.currentTarget.value as FrameTextBox["style"]["fontFamily"] })}>{LAYOUT_FONTS.map((font) => <option key={font.family} value={font.family}>{font.label}</option>)}</FrameSelect></label>
    <div className="table-frame-segments" role="group" aria-label={label("Text font style", "文字样式")}><button type="button" aria-label={label("Text bold", "文字加粗")} aria-pressed={style.fontWeight === "bold"} onClick={() => update({ fontWeight: style.fontWeight === "bold" ? "normal" : "bold" })}><b>B</b></button><button type="button" aria-label={label("Text italic", "文字斜体")} aria-pressed={style.fontStyle === "italic"} onClick={() => update({ fontStyle: style.fontStyle === "italic" ? "normal" : "italic" })}><i>I</i></button></div>
    <div className="table-frame-field-grid"><NumberField label={label("Text size", "文字字号")} unit="pt" value={style.fontSizePt} min={3} max={144} onCommit={(fontSizePt) => update({ fontSizePt })} /><label className="table-frame-number">{label("Color", "颜色")}<input type="color" aria-label={label("Text color", "文字颜色")} value={style.color} onChange={(event) => update({ color: event.currentTarget.value })} /></label>
    </div>
    <div className="table-frame-segments table-frame-caption-align" role="group" aria-label={label("Text alignment", "文字对齐")}>{(["left", "center", "right"] as const).map((align) => <button key={align} type="button" aria-pressed={style.align === align} onClick={() => update({ align })}>{zh ? { left: "左对齐", center: "居中", right: "右对齐" }[align] : align[0].toUpperCase() + align.slice(1)}</button>)}</div>
  </section>;
}
