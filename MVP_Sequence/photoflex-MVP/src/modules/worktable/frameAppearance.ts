import type { FrameCaptionStyle, FrameEdgeStyle, FrameInnerEdge, WorktableFrame } from "../../contracts";
import { framePaper, FRAME_MM_TO_PT } from "./frameLayout";
import { isDarkLayoutPaper } from "../layout/layoutPaper";
import { isLayoutFontFamily } from "../layout/layoutFonts";

type Page = WorktableFrame["page"];
export const FRAME_EDGE_MATERIALS = [
  { id: "flat", label: "Flat" }, { id: "wood", label: "Wood grain" },
  { id: "metal", label: "Brushed metal" }, { id: "beveled", label: "Beveled / 3D" },
] as const;
export function frameInnerEdge(page: Page): FrameInnerEdge { return page.innerEdge ?? { mode: "none", color: "#FFFFFF", widthPt: FRAME_MM_TO_PT }; }
export function frameEdgeStyle(page: Page): FrameEdgeStyle { return page.edgeStyle ?? { widthPt: page.widthPt * .025, material: "flat", shadowStrength: .25, photoElevationPt: 0 }; }
export function frameCaptionStyle(page: Page): FrameCaptionStyle {
  return page.captionStyle ?? { rect: { x: page.widthPt * .08, y: page.heightPt * .87, width: page.widthPt * .84, height: page.heightPt * .09 },
    fontFamily: "courier-prime", fontSizePt: Math.max(6, page.widthPt * .028), lineHeight: 1.4,
    color: isDarkLayoutPaper(framePaper(page)) ? "#EAE7DE" : "#484238", align: "left", fontWeight: "normal", fontStyle: "normal" };
}
export function reflowFrameCaption(page: Page, widthPt: number, heightPt: number): Pick<Page, "captionStyle"> {
  if (!page.captionStyle) return {};
  const rect = page.captionStyle.rect;
  return { captionStyle: { ...page.captionStyle, rect: { x: rect.x * widthPt / page.widthPt, y: rect.y * heightPt / page.heightPt,
    width: Math.max(FRAME_MM_TO_PT, rect.width * widthPt / page.widthPt), height: Math.max(FRAME_MM_TO_PT, rect.height * heightPt / page.heightPt) } } };
}
const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const within = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
export function validFrameInnerEdge(edge: FrameInnerEdge): boolean {
  return Boolean(edge && ["none", "color", "bevel"].includes(edge.mode) && color(edge.color) && within(edge.widthPt, 0, 20 * FRAME_MM_TO_PT));
}
export function validFrameEdgeStyle(style: FrameEdgeStyle): boolean {
  return Boolean(style && FRAME_EDGE_MATERIALS.some((entry) => entry.id === style.material) && within(style.widthPt, 0, 100 * FRAME_MM_TO_PT)
    && within(style.shadowStrength, 0, 1) && within(style.photoElevationPt, 0, 20 * FRAME_MM_TO_PT));
}
export function validFrameCaptionStyle(style: FrameCaptionStyle, page: Page): boolean {
  if (!style?.rect) return false;
  const { x, y, width, height } = style.rect;
  return isLayoutFontFamily(style.fontFamily) && within(style.fontSizePt, 3, 144) && within(style.lineHeight, .8, 3) && color(style.color)
    && ["left", "center", "right"].includes(style.align) && (style.fontWeight === undefined || ["normal", "bold"].includes(style.fontWeight))
    && (style.fontStyle === undefined || ["normal", "italic"].includes(style.fontStyle)) && [x, y, width, height].every(Number.isFinite)
    && width >= FRAME_MM_TO_PT && height >= FRAME_MM_TO_PT && x + width > 0 && y + height > 0 && x < page.widthPt && y < page.heightPt;
}
