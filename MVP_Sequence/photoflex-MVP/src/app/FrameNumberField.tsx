import { useEffect, useState, type Ref } from "react";
import { FRAME_MM_TO_PT } from "../modules/worktable/frameLayout";
import { useLocale } from "./locale";

export function FrameNumberField({ label, value, unit = "mm", min = 0, max = 1000, onCommit, inputRef }: {
  readonly label: string; readonly value: number; readonly unit?: "mm" | "pt"; readonly min?: number; readonly max?: number;
  readonly onCommit: (value: number) => boolean | void; readonly inputRef?: Ref<HTMLInputElement>;
}) {
  const { locale } = useLocale();
  const factor = unit === "mm" ? FRAME_MM_TO_PT : 1;
  const displayed = String(Math.round(value / factor * 10) / 10);
  const [draft, setDraft] = useState(displayed);
  useEffect(() => setDraft(displayed), [displayed]);
  const commit = (entered: string) => {
    const next = Number(entered);
    if (entered.trim() === "" || !Number.isFinite(next) || next < min || next > max) { setDraft(displayed); return; }
    if (next !== Number(displayed) && onCommit(next * factor) === false) { setDraft(displayed); return; }
    setDraft(String(next));
  };
  const step = (by: number) => commit(String(Math.min(max, Math.max(min, (draft.trim() && Number.isFinite(Number(draft)) ? Number(draft) : Number(displayed)) + by))));
  const ariaLabel = `${label} ${unit}`;
  return <label className="table-frame-number"><span>{label}</span><span className="table-frame-number-control has-steppers">
    <input ref={inputRef} aria-label={ariaLabel} type="number" min={min} max={max} step="1" value={draft} onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={(event) => commit(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); commit(event.currentTarget.value); } }} />
    <em>{unit}</em><span className="table-frame-number-steppers">
      <button type="button" aria-label={`${locale === "zh-CN" ? "增加" : "Increase"} ${ariaLabel}`} onMouseDown={(event) => event.preventDefault()} onClick={() => step(1)}>＋</button>
      <button type="button" aria-label={`${locale === "zh-CN" ? "减少" : "Decrease"} ${ariaLabel}`} onMouseDown={(event) => event.preventDefault()} onClick={() => step(-1)}>−</button>
    </span>
  </span></label>;
}
