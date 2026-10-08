import { useEffect, useId, useState, type CSSProperties } from "react";

export function LayoutInspectorSlider({ label, value, max, unit, inputLabel, ends, onChange }: {
  label: string; value: number; max: number; unit: string; inputLabel: string;
  ends?: readonly [string, string]; onChange: (value: number) => void;
}) {
  const id = useId();
  const displayed = +value.toFixed(1);
  const [draft, setDraft] = useState(String(displayed));
  useEffect(() => setDraft(String(displayed)), [displayed]);
  return <section className="table-frame-section layout-inspector-slider">
    <h3><label htmlFor={id}>{label}</label><span>{displayed}{unit}</span></h3>
    <div className="table-frame-soft-group">
      <div className="layout-slider-controls">
        <input id={id} aria-label={label} type="range" min="0" max={max} step="0.1" value={value}
          style={{ "--range-progress": `${value / max * 100}%` } as CSSProperties}
          onChange={(event) => onChange(Number(event.currentTarget.value))} />
        <label className="layout-slider-number"><input aria-label={inputLabel} type="number" min="0" max={max} step="0.1" value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          onBlur={() => { const next = Number(draft); if (draft.trim() && Number.isFinite(next) && next >= 0 && next <= max) { setDraft(String(next)); if (next !== value) onChange(next); } else setDraft(String(displayed)); }} /><span>{unit}</span></label>
      </div>
      {ends && <div className="layout-slider-ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
    </div>
  </section>;
}
