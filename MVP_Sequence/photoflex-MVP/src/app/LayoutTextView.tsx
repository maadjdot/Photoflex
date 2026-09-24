import { useEffect, useMemo, useState } from "react";
import type { LayoutTextBox } from "../contracts";
import { layoutText, type LayoutTextResult } from "../modules/layout/layoutText";

let loadedFont: Promise<void> | undefined;
export function loadLayoutFont(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  return loadedFont ??= document.fonts.load('16px "PhotoFlex Noto Sans SC"').then(() => undefined);
}

export function useLayoutText(box: LayoutTextBox | undefined): LayoutTextResult | undefined {
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!document.fonts?.load) return; let active = true; void loadLayoutFont().then(() => { if (active) setReady(true); }); return () => { active = false; }; }, []);
  return useMemo(() => {
    if (!box || !ready) return undefined;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return undefined;
    return layoutText(box, (text, size) => {
      context.font = `${size * 4 / 3}px "PhotoFlex Noto Sans SC"`;
      return context.measureText(text).width * 3 / 4;
    });
  }, [box, ready]);
}

export function LayoutTextView({ box, scale, reading, zh }: { box: LayoutTextBox; scale: number; reading: boolean; zh: boolean }) {
  const result = useLayoutText(box);
  return <><div className="layout-text-content" lang="zh-CN" style={{ color: box.style.color, fontFamily: '"PhotoFlex Noto Sans SC"',
    fontSize: box.style.fontSizePt * scale, lineHeight: `${box.style.fontSizePt * box.style.lineHeight * scale}px`, textAlign: box.style.align }}>
    {result?.lines.map((line, index) => <div className="layout-text-line" key={`${line.start}-${index}`} data-source-start={line.start}>{line.text || "\u00a0"}</div>)}
  </div>{!reading && result && (result.overflowLine !== null || result.missing.length > 0) && <span className="layout-text-warning" title={result.missing.length ? (zh ? "缺字" : "Missing glyph") : (zh ? "文字溢出" : "Text overflow")}>!</span>}</>;
}
