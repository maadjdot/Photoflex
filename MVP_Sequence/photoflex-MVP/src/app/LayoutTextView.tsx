import { useEffect, useMemo, useState } from "react";
import type { LayoutTextBox } from "../contracts";
import { layoutFontCssShorthand, layoutFontCssStack, layoutFontStyle, layoutFontWeight } from "../modules/layout/layoutFonts";
import { layoutText, type LayoutTextResult } from "../modules/layout/layoutText";
import { loadLayoutFont } from "../platform/browser/layoutFontAssets";

export function useLayoutText(box: LayoutTextBox | undefined): LayoutTextResult | undefined {
  const [ready, setReady] = useState(false);
  const family = box?.style.fontFamily;
  const weight = layoutFontWeight(box?.style.fontWeight);
  const style = layoutFontStyle(box?.style.fontStyle);
  useEffect(() => {
    let active = true;
    setReady(false);
    if (family) void loadLayoutFont(family, weight, style).then(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [family, weight, style]);
  return useMemo(() => {
    if (!box || !ready) return undefined;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return undefined;
    return layoutText(box, (text, size) => {
      context.font = layoutFontCssShorthand(box.style.fontFamily, size * 4 / 3, box.style.fontWeight, box.style.fontStyle);
      return context.measureText(text).width * 3 / 4;
    });
  }, [box, ready]);
}

export function LayoutTextView({ box, scale }: { box: LayoutTextBox; scale: number }) {
  const result = useLayoutText(box);
  return <div className="layout-text-content" lang="zh-CN" style={{ color: box.style.color, fontFamily: layoutFontCssStack(box.style.fontFamily),
    fontWeight: layoutFontWeight(box.style.fontWeight) === "bold" ? 700 : 400, fontStyle: layoutFontStyle(box.style.fontStyle),
    fontSize: box.style.fontSizePt * scale, lineHeight: `${box.style.fontSizePt * box.style.lineHeight * scale}px`, textAlign: box.style.align }}>
    {result?.lines.map((line, index) => <div className="layout-text-line" key={`${line.start}-${index}`} data-source-start={line.start}>{line.text || "\u00a0"}</div>)}
  </div>;
}
