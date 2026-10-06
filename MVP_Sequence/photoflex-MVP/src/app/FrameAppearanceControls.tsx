import type { FrameCaptionStyle, FrameEdgeStyle, FrameEditCommand, FrameInnerEdge, WorktableFrame } from "../contracts";
import { FRAME_EDGE_COLORS, FRAME_MM_TO_PT } from "../modules/worktable/frameLayout";
import { FRAME_EDGE_MATERIALS, frameCaptionStyle, frameEdgeStyle, frameInnerEdge } from "../modules/worktable/frameAppearance";
import { LAYOUT_FONTS, layoutFontCssStack } from "../modules/layout/layoutFonts";
import "../styles/layout-fonts.css";

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
  const edge = frameInnerEdge(frame.page);
  const update = (changes: Partial<FrameInnerEdge>) => onExecute({ type: "set-frame-inner-edge", frameId: frame.id, edge: { ...edge, ...changes } });
  return <section className="table-frame-section"><h3>INNER EDGE <span>Photo edges</span></h3>
    <div className="table-frame-segments" role="group" aria-label="Inner edge">{(["none", "color", "bevel"] as const).map((mode) => <button key={mode} type="button" aria-pressed={edge.mode === mode} onClick={() => update({ mode })}>{mode === "none" ? "None" : mode === "color" ? "Color" : "Mat bevel"}</button>)}</div>
    {edge.mode !== "none" && <div className="table-frame-field-grid"><NumberField label="Inner edge width" value={edge.widthPt} max={20} onCommit={(widthPt) => update({ widthPt })} /><label className="table-frame-number">Color<input type="color" aria-label="Inner edge color" value={edge.color} onChange={(event) => update({ color: event.currentTarget.value })} /></label></div>}
  </section>;
}

export function FrameEdgeControls({ frame, onExecute }: Props) {
  const style = frameEdgeStyle(frame.page);
  const color = frame.page.edgeColor ?? FRAME_EDGE_COLORS[0].color;
  const update = (changes: Partial<FrameEdgeStyle>) => onExecute({ type: "set-frame-edge-style", frameId: frame.id, style: { ...style, ...changes } });
  return <section className="table-frame-section"><h3>FRAME EDGE</h3>
    <div className="table-frame-color-palette" role="group" aria-label="Frame edge color">{FRAME_EDGE_COLORS.map((entry) => <button key={entry.color} type="button" title={entry.name} aria-label={entry.name} aria-pressed={color.toUpperCase() === entry.color.toUpperCase()} style={{ backgroundColor: entry.color }} onClick={() => onExecute({ type: "set-frame-edge-color", frameId: frame.id, color: entry.color })} />)}</div>
    <label className="table-frame-custom-color">Custom edge color<input type="color" aria-label="Custom frame edge color" value={color} onChange={(event) => onExecute({ type: "set-frame-edge-color", frameId: frame.id, color: event.currentTarget.value })} /></label>
    <div className="table-frame-field-grid"><NumberField label="Frame edge width" value={style.widthPt} max={100} onCommit={(widthPt) => update({ widthPt })} /><label className="table-frame-number">Material<select aria-label="Frame material" value={style.material} onChange={(event) => update({ material: event.currentTarget.value as FrameEdgeStyle["material"] })}>{FRAME_EDGE_MATERIALS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label></div>
    <label className="table-frame-effect-slider">Shadow strength <strong>{Math.round(style.shadowStrength * 100)}%</strong><input type="range" aria-label="Frame shadow strength" min="0" max="100" step="1" value={Math.round(style.shadowStrength * 100)} onChange={(event) => update({ shadowStrength: Number(event.currentTarget.value) / 100 })} /></label>
    <NumberField label="Photo elevation" value={style.photoElevationPt} max={20} onCommit={(photoElevationPt) => update({ photoElevationPt })} />
  </section>;
}

export function FrameCaptionControls({ frame, onExecute }: Props) {
  const style = frameCaptionStyle(frame.page);
  const update = (changes: Partial<FrameCaptionStyle>) => onExecute({ type: "set-frame-caption-style", frameId: frame.id, style: { ...style, ...changes } });
  return <section className="table-frame-section"><h3>CAPTION</h3>
    <label className="table-frame-caption-field">Text<textarea key={`${frame.id}-${frame.page.caption ?? ""}`} aria-label="Frame caption" maxLength={160} defaultValue={frame.page.caption ?? ""} placeholder="Place, date…" onBlur={(event) => onExecute({ type: "set-frame-caption", frameId: frame.id, caption: event.currentTarget.value })} /></label>
    <label className="table-frame-number table-frame-caption-font">Font<select aria-label="Caption font" value={style.fontFamily} style={{ fontFamily: layoutFontCssStack(style.fontFamily) }} onChange={(event) => update({ fontFamily: event.currentTarget.value as FrameCaptionStyle["fontFamily"] })}>{LAYOUT_FONTS.map((font) => <option key={font.family} value={font.family}>{font.label}</option>)}</select></label>
    <div className="table-frame-segments" role="group" aria-label="Caption font style"><button type="button" aria-label="Caption bold" aria-pressed={style.fontWeight === "bold"} onClick={() => update({ fontWeight: style.fontWeight === "bold" ? "normal" : "bold" })}><b>B</b></button><button type="button" aria-label="Caption italic" aria-pressed={style.fontStyle === "italic"} onClick={() => update({ fontStyle: style.fontStyle === "italic" ? "normal" : "italic" })}><i>I</i></button></div>
    <div className="table-frame-field-grid"><NumberField label="Caption size" unit="pt" value={style.fontSizePt} min={3} max={144} onCommit={(fontSizePt) => update({ fontSizePt })} /><label className="table-frame-number">Color<input type="color" aria-label="Caption color" value={style.color} onChange={(event) => update({ color: event.currentTarget.value })} /></label>
      {(["x", "y", "width", "height"] as const).map((field) => <NumberField key={field} label={`Caption ${field === "x" ? "X" : field === "y" ? "Y" : field === "width" ? "W" : "H"}`} value={style.rect[field]} min={field === "width" || field === "height" ? 1 : 0} max={field === "x" ? frame.page.widthPt / FRAME_MM_TO_PT - 1 : field === "y" ? frame.page.heightPt / FRAME_MM_TO_PT - 1 : 1000} onCommit={(value) => update({ rect: { ...style.rect, [field]: value } })} />)}
    </div>
    <div className="table-frame-segments table-frame-caption-align" role="group" aria-label="Caption alignment">{(["left", "center", "right"] as const).map((align) => <button key={align} type="button" aria-pressed={style.align === align} onClick={() => update({ align })}>{align[0].toUpperCase() + align.slice(1)}</button>)}</div>
    <p className="table-frame-hint">Drag the caption on the page to position it.</p>
  </section>;
}
