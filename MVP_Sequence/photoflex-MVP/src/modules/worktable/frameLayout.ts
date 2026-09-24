import type { FrameDirection, FrameTemplateId, FrameTemplateSource } from "../../contracts/frame";
import { defaultTemplate } from "../page-layout/pageGeometry";

// Keep Frame's existing interface while the pure rules live at the shared seam.
export {
  MM_TO_PT as FRAME_MM_TO_PT,
  PAGE_PRESETS_MM as FRAME_PAGE_PRESETS,
  DEFAULT_MARGINS_PT as DEFAULT_FRAME_MARGINS_PT,
  DEFAULT_GAP_PT as DEFAULT_FRAME_GAP_PT,
  defaultCrop as defaultFrameCrop,
  templateRects as frameTemplateRects,
  validCrop as validFrameCrop,
  resolveImagePlacement as resolveFramePhoto,
} from "../page-layout/pageGeometry";

export const FRAME_TEMPLATE_LABELS: Record<FrameTemplateId, string> = {
  single: "Single", diptych: "Diptych", triptych: "Triptych", "quad-grid": "Quad Grid", "full-page": "Full Page", "square-nine-grid": "Square Nine Grid",
};
export const FRAME_TEMPLATES = Object.keys(FRAME_TEMPLATE_LABELS) as FrameTemplateId[];

export function frameTemplateSource(id: FrameTemplateId, direction: FrameDirection = "horizontal"): FrameTemplateSource {
  return { ...defaultTemplate(id, direction), version: 1, modified: false };
}

export function frameWorldSize(frame: { page: { widthPt: number; heightPt: number }; displayScale: number }) {
  return { width: frame.page.widthPt * frame.displayScale, height: frame.page.heightPt * frame.displayScale };
}
