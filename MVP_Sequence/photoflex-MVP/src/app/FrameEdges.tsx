import type { CSSProperties } from "react";
import type { FrameInnerEdge, FrameRect, WorktableFrame } from "../contracts";
import { frameEdgeStyle } from "../modules/worktable/frameAppearance";

export function FrameEdge({ page }: { readonly page: WorktableFrame["page"] }) {
  const edge = frameEdgeStyle(page);
  const color = page.edgeColor ?? "#242320";
  const style = { borderWidth: edge.widthPt, borderColor: color, "--frame-edge-width": `${edge.widthPt}px`, "--frame-edge-color": color,
    boxShadow: edge.widthPt && edge.shadowStrength ? `inset 0 0 ${edge.widthPt * 1.5}px rgb(0 0 0 / ${edge.shadowStrength * .3})` : "none" } as CSSProperties;
  return <div className={`table-frame-gallery-edge edge-material-${edge.material}`} aria-hidden="true" style={style}>
    {edge.widthPt > 0 && edge.material !== "flat" && (["top", "right", "bottom", "left"] as const).map((side) => <span key={side} className={`table-frame-edge-surface edge-${side}`} />)}
  </div>;
}

export function FramePhotoEdge({ edge, cornerRadiusPt, rect }: { readonly edge: FrameInnerEdge; readonly cornerRadiusPt: number; readonly rect: FrameRect }) {
  if (edge.mode === "none" || edge.widthPt <= 0) return null;
  const color = edge.color;
  return <span className={`table-frame-inner-edge inner-edge-${edge.mode}`} aria-hidden="true" style={{ left: rect.x - edge.widthPt, top: rect.y - edge.widthPt, width: rect.width + edge.widthPt * 2, height: rect.height + edge.widthPt * 2, borderWidth: edge.widthPt, borderColor: color, borderRadius: cornerRadiusPt + edge.widthPt,
    ...(edge.mode === "bevel" ? { borderTopColor: `color-mix(in srgb, ${color} 65%, #000)`, borderLeftColor: `color-mix(in srgb, ${color} 82%, #000)`,
      borderBottomColor: `color-mix(in srgb, ${color} 70%, #fff)`, borderRightColor: `color-mix(in srgb, ${color} 90%, #fff)` } : {}) }} />;
}
