import { useEffect, useMemo, useState } from "react";
import type { LayoutTextBox } from "../contracts";
import { layoutFontCssShorthand, layoutFontCssStack, layoutFontStyle, layoutFontWeight } from "../modules/layout/layoutFonts";
import { layoutText, type LayoutTextResult } from "../modules/layout/layoutText";
import { loadLayoutFont } from "../platform/browser/layoutFontAssets";
import { useLocale } from "./locale";

export function useLayoutText(box: LayoutTextBox | undefined) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const family = box?.style.fontFamily;
  const weight = layoutFontWeight(box?.style.fontWeight);
  const style = layoutFontStyle(box?.style.fontStyle);
  useEffect(() => {
    let active = true;
    setState("loading");
    if (family) void loadLayoutFont(family, weight, style).then(
      () => { if (active) setState("ready"); },
      () => { if (active) setState("failed"); },
    );
    return () => { active = false; };
  }, [family, weight, style, attempt]);
  const result: LayoutTextResult | undefined = useMemo(() => {
    if (!box || state !== "ready") return undefined;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return undefined;
    return layoutText(box, (text, size) => {
      context.font = layoutFontCssShorthand(box.style.fontFamily, size * 4 / 3, box.style.fontWeight, box.style.fontStyle);
      return context.measureText(text).width * 3 / 4;
    });
  }, [box, state]);
  return { result, state, retry: () => setAttempt((current) => current + 1) };
}

export function LayoutTextView({ box, scale }: { box: LayoutTextBox; scale: number }) {
  const { result, state, retry } = useLayoutText(box);
  const { t } = useLocale();
  return <div className="layout-text-content" lang="zh-CN" style={{ color: box.style.color, fontFamily: layoutFontCssStack(box.style.fontFamily),
    fontWeight: layoutFontWeight(box.style.fontWeight) === "bold" ? 700 : 400, fontStyle: layoutFontStyle(box.style.fontStyle),
    fontSize: box.style.fontSizePt * scale, lineHeight: `${box.style.fontSizePt * box.style.lineHeight * scale}px`, textAlign: box.style.align }}>
    {state !== "ready" && <div className="layout-font-status" role={state === "failed" ? "alert" : "status"}>
      <span>{t(state === "failed" ? "layout.fontFailed" : "layout.fontLoading")}</span>
      {state === "failed" && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); retry(); }}>{t("common.retry")}</button>}
    </div>}
    {result?.lines.map((line, index) => <div className="layout-text-line" key={`${line.start}-${index}`} data-source-start={line.start}>{line.text || "\u00a0"}</div>)}
  </div>;
}
