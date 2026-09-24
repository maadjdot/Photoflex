import { useState, type FormEvent } from "react";
import type { LayoutId, SequenceDocument } from "../contracts";
import { createLayoutFromSequence, sequenceLayoutPreview, type LayoutStart } from "../modules/layout/layoutPages";
import { MM_TO_PT, PAGE_PRESETS_MM } from "../modules/page-layout/pageGeometry";
import { useLocale } from "./locale";
import type { ProjectWriteCoordinator } from "./projectWriteCoordinator";

export function LayoutCreateDialog({ sequence, persistence, onClose, onCreated }: {
  sequence: SequenceDocument; persistence: ProjectWriteCoordinator; onClose: () => void; onCreated: (id: LayoutId) => void;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const [preset, setPreset] = useState<keyof typeof PAGE_PRESETS_MM | "Custom">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [width, setWidth] = useState(210);
  const [height, setHeight] = useState(297);
  const [start, setStart] = useState<LayoutStart>("sequence");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const preview = sequenceLayoutPreview(sequence);
  const dimensions = preset === "Custom" ? [width, height] : [...PAGE_PRESETS_MM[preset]];
  const [pageWidth, pageHeight] = orientation === "landscape" && dimensions[0] < dimensions[1]
    ? [dimensions[1], dimensions[0]] : orientation === "portrait" && dimensions[0] > dimensions[1]
      ? [dimensions[1], dimensions[0]] : dimensions;
  const valid = [pageWidth, pageHeight].every((value) => Number.isFinite(value) && value >= 50 && value <= 600);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(undefined);
    const id = crypto.randomUUID() as LayoutId;
    const layout = createLayoutFromSequence({ sequence, id, name: `${sequence.name} Layout`, widthPt: pageWidth * MM_TO_PT,
      heightPt: pageHeight * MM_TO_PT, start, now: new Date().toISOString() });
    const result = await persistence.createLayout(layout);
    if (result.ok) onCreated(id);
    else if (result.error.kind === "layout-exists-for-sequence") {
      const listed = await persistence.listLayouts();
      const existing = listed.ok && listed.value.find((entry) => entry.sequenceId === sequence.id);
      if (existing) onCreated(existing.id);
      else setError(zh ? "已有 Layout，但暂时无法打开。请重试。" : "This Layout exists but could not be opened. Please retry.");
    } else setError(zh ? "Layout 创建失败。请重试。" : "Layout could not be created. Please retry.");
    setBusy(false);
  };
  return <div className="layout-create-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <section className="layout-create-dialog" role="dialog" aria-modal="true" aria-label={zh ? "创建 Layout" : "Create Layout"}>
      <header><div><small>LAYOUT</small><h2>{zh ? "创建摄影集" : "Create a photo book"}</h2></div><button type="button" onClick={onClose} aria-label={zh ? "关闭" : "Close"}>×</button></header>
      <form onSubmit={(event) => void submit(event)}>
        <label>{zh ? "页面尺寸" : "Page size"}<select value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)}>
          {Object.keys(PAGE_PRESETS_MM).map((key) => <option key={key} value={key}>{key === "Square" ? "210 × 210 mm" : key === "Panoramic" ? "297 × 148 mm" : key}</option>)}
          <option value="Custom">{zh ? "自定义" : "Custom"}</option>
        </select></label>
        {preset === "Custom" && <div className="layout-create-dimensions"><label>{zh ? "宽 (mm)" : "Width (mm)"}<input type="number" min="50" max="600" step="0.1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>{zh ? "高 (mm)" : "Height (mm)"}<input type="number" min="50" max="600" step="0.1" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label></div>}
        <label>{zh ? "方向" : "Orientation"}<select value={orientation} onChange={(event) => setOrientation(event.target.value as typeof orientation)}><option value="portrait">{zh ? "竖版" : "Portrait"}</option><option value="landscape">{zh ? "横版" : "Landscape"}</option></select></label>
        <fieldset><legend>{zh ? "初始内容" : "Starting pages"}</legend><label><input type="radio" name="layout-start" checked={start === "sequence"} onChange={() => setStart("sequence")} />{zh ? `从 Sequence 创建（${preview.pages} 页）` : `From Sequence (${preview.pages} pages)`}</label><label><input type="radio" name="layout-start" checked={start === "blank"} onChange={() => setStart("blank")} />{zh ? "一张空白页" : "One blank page"}</label></fieldset>
        {start === "sequence" && <p className="layout-create-note">{preview.insertedBlanks > 0 && (zh ? `为保持跨页对齐，将插入 ${preview.insertedBlanks} 张真实空白页。` : `${preview.insertedBlanks} blank page(s) will be inserted to align spreads.`)} {preview.simplifiedText > 0 && (zh ? `导入 ${preview.simplifiedText} 处纯文本；原有格式不会保留。` : `${preview.simplifiedText} text item(s) will be imported as plain text.`)}</p>}
        <p className="layout-create-note">{zh ? "尺寸创建后固定；可在工作区切换单页和对页查看。" : "Page size is fixed after creation. You can switch between single and facing page views."}</p>
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" onClick={onClose}>{zh ? "取消" : "Cancel"}</button><button type="submit" disabled={!valid || busy}>{busy ? (zh ? "创建中…" : "Creating…") : (zh ? "创建 Layout" : "Create Layout")}</button></footer>
      </form>
    </section>
  </div>;
}
