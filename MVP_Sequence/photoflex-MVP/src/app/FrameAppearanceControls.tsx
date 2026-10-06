import type { FrameCaptionStyle, FrameEdgeStyle, FrameEditCommand, FrameInnerEdge, WorktableFrame } from "../contracts";
import { FRAME_EDGE_COLORS, FRAME_MM_TO_PT } from "../modules/worktable/frameLayout";
import { FRAME_EDGE_MATERIALS, frameCaptionStyle, frameEdgeStyle, frameInnerEdge } from "../modules/worktable/frameAppearance";
import { LAYOUT_FONTS, layoutFontCssStack } from "../modules/layout/layoutFonts";
import "../styles/layout-fonts.css";
import { useLocale } from "./locale";
import { frameEdgeColorLabel, frameEdgeMaterialLabel } from "./frameLabels";

function NumberField({ label, value, unit = "mm", min = 0, max = 1000, onCommit }: {
  label: string; value: number; unit?: "mm" | "pt"; min?: number; max?: number; onCommit: (value: number) => void;
}) {
  const factor = unit === "mm" ? FRAME_MM_TO_PT : 1;
  const displayed = Math.round(value / factor * 10) / 10;
  return <label className="table-frame-number"><span>{label}</span><span className="table-frame-number-control"><input key={`${label}-${value}`} aria-label={`${label} ${unit}`} type="number" min={min} max={max} step="0.1" defaultValue={displayed} onBlur={(event) => {
    const next = Number(event.currentTarget.value);
    if (event.currentTarget.value !== "" && Number.isFinite(next) && next >= min && next <= max) onCommit(next * factor);
    else event.currentTarget.value = String(displayed);
  }} /><em>{unit}</em></span></label>;
}

type Props = { readonly frame: WorktableFrame; readonly onExecute: (command: FrameEditCommand) => void };
export function FrameInnerEdgeControls({ frame, onExecute }: Props) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const edge = frameInnerEdge(frame.page);
  const update = (changes: Partial<FrameInnerEdge>) => onExecute({ type: "set-frame-inner-edge", frameId: frame.id, edge: { ...edge, ...changes } });
  return <section className="table-frame-section"><h3>{label("INNER EDGE", "内边框")} <span>{label("Photo edges", "照片边缘")}</span></h3>
    <div className="table-frame-segments" role="group" aria-label={label("Inner edge", "内边框")}>{(["none", "color", "bevel"] as const).map((mode) => <button key={mode} type="button" aria-pressed={edge.mode === mode} onClick={() => update({ mode })}>{mode === "none" ? label("None", "无") : mode === "color" ? label("Color", "纯色") : label("Mat bevel", "卡纸斜边")}</button>)}</div>
    {edge.mode !== "none" && <div className="table-frame-field-grid"><NumberField label={label("Inner edge width", "内边框宽度")} value={edge.widthPt} max={20} onCommit={(widthPt) => update({ widthPt })} /><label className="table-frame-number">{label("Color", "颜色")}<input type="color" aria-label={label("Inner edge color", "内边框颜色")} value={edge.color} onChange={(event) => update({ color: event.currentTarget.value })} /></label></div>}
  </section>;
}

export function FrameEdgeControls({ frame, onExecute }: Props) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const style = frameEdgeStyle(frame.page);
  const color = frame.page.edgeColor ?? FRAME_EDGE_COLORS[0].color;
  const update = (changes: Partial<FrameEdgeStyle>) => onExecute({ type: "set-frame-edge-style", frameId: frame.id, style: { ...style, ...changes } });
  return <section className="table-frame-section"><h3>{label("FRAME EDGE", "外边框")}</h3>
    <div className="table-frame-color-palette" role="group" aria-label={label("Frame edge color", "外边框颜色")}>{FRAME_EDGE_COLORS.map((entry) => <button key={entry.color} type="button" title={frameEdgeColorLabel(entry.name, zh)} aria-label={frameEdgeColorLabel(entry.name, zh)} aria-pressed={color.toUpperCase() === entry.color.toUpperCase()} style={{ backgroundColor: entry.color }} onClick={() => onExecute({ type: "set-frame-edge-color", frameId: frame.id, color: entry.color })} />)}</div>
    <label className="table-frame-custom-color">{label("Custom edge color", "自定义边框颜色")}<input type="color" aria-label={label("Custom frame edge color", "自定义外边框颜色")} value={color} onChange={(event) => onExecute({ type: "set-frame-edge-color", frameId: frame.id, color: event.currentTarget.value })} /></label>
    <div className="table-frame-field-grid"><NumberField label={label("Frame edge width", "外边框宽度")} value={style.widthPt} max={100} onCommit={(widthPt) => update({ widthPt })} /><label className="table-frame-number">{label("Material", "材质")}<select aria-label={label("Frame material", "边框材质")} value={style.material} onChange={(event) => update({ material: event.currentTarget.value as FrameEdgeStyle["material"] })}>{FRAME_EDGE_MATERIALS.map((entry) => <option key={entry.id} value={entry.id}>{frameEdgeMaterialLabel(entry, zh)}</option>)}</select></label></div>
    <label className="table-frame-effect-slider">{label("Shadow strength", "阴影强度")} <strong>{Math.round(style.shadowStrength * 100)}%</strong><input type="range" aria-label={label("Frame shadow strength", "边框阴影强度")} min="0" max="100" step="1" value={Math.round(style.shadowStrength * 100)} onChange={(event) => update({ shadowStrength: Number(event.currentTarget.value) / 100 })} /></label>
    <NumberField label={label("Photo elevation", "照片浮起高度")} value={style.photoElevationPt} max={20} onCommit={(photoElevationPt) => update({ photoElevationPt })} />
  </section>;
}

export function FrameCaptionControls({ frame, onExecute }: Props) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const style = frameCaptionStyle(frame.page);
  const update = (changes: Partial<FrameCaptionStyle>) => onExecute({ type: "set-frame-caption-style", frameId: frame.id, style: { ...style, ...changes } });
  return <section className="table-frame-section"><h3>{label("CAPTION", "说明文字")}</h3>
    <label className="table-frame-caption-field">{label("Text", "文字")}<textarea key={`${frame.id}-${frame.page.caption ?? ""}`} aria-label={label("Frame caption", "画框说明文字")} maxLength={160} defaultValue={frame.page.caption ?? ""} placeholder={label("Place, date…", "地点、日期…")} onBlur={(event) => onExecute({ type: "set-frame-caption", frameId: frame.id, caption: event.currentTarget.value })} /></label>
    <label className="table-frame-number table-frame-caption-font">{label("Font", "字体")}<select aria-label={label("Caption font", "说明文字字体")} value={style.fontFamily} style={{ fontFamily: layoutFontCssStack(style.fontFamily) }} onChange={(event) => update({ fontFamily: event.currentTarget.value as FrameCaptionStyle["fontFamily"] })}>{LAYOUT_FONTS.map((font) => <option key={font.family} value={font.family}>{font.label}</option>)}</select></label>
    <div className="table-frame-segments" role="group" aria-label={label("Caption font style", "说明文字样式")}><button type="button" aria-label={label("Caption bold", "说明文字加粗")} aria-pressed={style.fontWeight === "bold"} onClick={() => update({ fontWeight: style.fontWeight === "bold" ? "normal" : "bold" })}><b>B</b></button><button type="button" aria-label={label("Caption italic", "说明文字斜体")} aria-pressed={style.fontStyle === "italic"} onClick={() => update({ fontStyle: style.fontStyle === "italic" ? "normal" : "italic" })}><i>I</i></button></div>
    <div className="table-frame-field-grid"><NumberField label={label("Caption size", "说明文字字号")} unit="pt" value={style.fontSizePt} min={3} max={144} onCommit={(fontSizePt) => update({ fontSizePt })} /><label className="table-frame-number">{label("Color", "颜色")}<input type="color" aria-label={label("Caption color", "说明文字颜色")} value={style.color} onChange={(event) => update({ color: event.currentTarget.value })} /></label>
    </div>
    <div className="table-frame-segments table-frame-caption-align" role="group" aria-label={label("Caption alignment", "说明文字对齐")}>{(["left", "center", "right"] as const).map((align) => <button key={align} type="button" aria-pressed={style.align === align} onClick={() => update({ align })}>{zh ? { left: "左对齐", center: "居中", right: "右对齐" }[align] : align[0].toUpperCase() + align.slice(1)}</button>)}</div>
    <p className="table-frame-hint">{label("Drag the caption on the page to position it.", "在页面上拖动说明文字即可调整位置。")}</p>
  </section>;
}
