import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LayoutTextBox } from "../contracts";
import { layoutFontCssShorthand, layoutFontCssStack, layoutFontStyle, layoutFontWeight, needsLayoutChineseFallback } from "../modules/layout/layoutFonts";
import { layoutText, type LaidOutTextLine, type LayoutTextResult } from "../modules/layout/layoutText";
import { loadLayoutFont } from "../platform/browser/layoutFontAssets";
import { useLocale } from "./locale";

interface DisplayTextLine extends LaidOutTextLine {
  readonly inkInsetLeftPx: number;
  readonly inkInsetRightPx: number;
}

interface DisplayTextResult extends LayoutTextResult {
  readonly lines: readonly DisplayTextLine[];
}

export function useLayoutText(box: LayoutTextBox | undefined, scale = 1, widthPt = box?.rect.width) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const family = box?.style.fontFamily;
  const weight = layoutFontWeight(box?.style.fontWeight);
  const style = layoutFontStyle(box?.style.fontStyle);
  const fallback = family ? needsLayoutChineseFallback(family, box?.text, weight, style) : false;
  useEffect(() => {
    let active = true;
    setState("loading");
    if (family) void loadLayoutFont(family, weight, style, box?.text).then(
      () => { if (active) setState("ready"); },
      () => { if (active) setState("failed"); },
    );
    return () => { active = false; };
  }, [family, weight, style, fallback, attempt]);
  const result: DisplayTextResult | undefined = useMemo(() => {
    if (!box || state !== "ready") return undefined;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return undefined;
    const layout = layoutText({ ...box, rect: { ...box.rect, width: widthPt ?? box.rect.width } }, (text, size) => {
      context.font = layoutFontCssShorthand(box.style.fontFamily, size * 4 / 3, box.style.fontWeight, box.style.fontStyle);
      return context.measureText(text).width * 3 / 4;
    }, (text, size) => {
      context.font = layoutFontCssShorthand(box.style.fontFamily, size * scale, box.style.fontWeight, box.style.fontStyle);
      const ink = context.measureText(text);
      return (ink.width + Math.ceil(Math.max(0, ink.actualBoundingBoxRight - ink.width))
        + Math.ceil(Math.max(0, ink.actualBoundingBoxLeft))) / scale;
    });
    // Glyph ink can extend beyond its advance width, especially in serif and italic faces.
    context.font = layoutFontCssShorthand(box.style.fontFamily, box.style.fontSizePt * scale, box.style.fontWeight, box.style.fontStyle);
    return { ...layout, lines: layout.lines.map((line) => {
      const first = context.measureText(line.runs[0].text);
      const last = context.measureText(line.runs[line.runs.length - 1].text);
      return { ...line, inkInsetLeftPx: Math.ceil(Math.max(0, first.actualBoundingBoxLeft)),
        inkInsetRightPx: Math.ceil(Math.max(0, last.actualBoundingBoxRight - last.width)) };
    }) };
  }, [box, state, scale, widthPt]);
  return { result, state, retry: () => setAttempt((current) => current + 1) };
}

export function LayoutTextView({ box, scale }: { box: LayoutTextBox; scale: number }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [widthPt, setWidthPt] = useState(box.rect.width);
  useLayoutEffect(() => {
    const width = parseFloat(getComputedStyle(contentRef.current!).width);
    if (width > 0) setWidthPt(width / scale);
  }, [box.rect.width, scale]);
  const { result, state, retry } = useLayoutText(box, scale, widthPt);
  const { t } = useLocale();
  return <div ref={contentRef} className="layout-text-content" lang="zh-CN" style={{ color: box.style.color, fontFamily: layoutFontCssStack(box.style.fontFamily),
    fontWeight: layoutFontWeight(box.style.fontWeight) === "bold" ? 700 : 400, fontStyle: layoutFontStyle(box.style.fontStyle),
    fontSize: box.style.fontSizePt * scale, lineHeight: `${box.style.fontSizePt * box.style.lineHeight * scale}px`, textAlign: box.style.align }}>
    {state !== "ready" && <div className="layout-font-status" role={state === "failed" ? "alert" : "status"}>
      <span>{t(state === "failed" ? "layout.fontFailed" : "layout.fontLoading")}</span>
      {state === "failed" && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); retry(); }}>{t("common.retry")}</button>}
    </div>}
    {result?.lines.map((line, index) => <div className="layout-text-line" key={`${line.start}-${index}`} data-source-start={line.start}
      style={{ height: result.lineHeightPt * scale, paddingLeft: line.inkInsetLeftPx, paddingRight: line.inkInsetRightPx,
        justifyContent: line.runs.length > 1 ? "space-between" : box.style.align === "right" ? "flex-end" : box.style.align === "center" ? "center" : "flex-start" }}>
      {line.text ? line.runs.map((run, runIndex) => <span key={runIndex}>{run.text}</span>) : "\u00a0"}</div>)}
  </div>;
}
