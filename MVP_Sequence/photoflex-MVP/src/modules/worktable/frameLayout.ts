import type { FrameCrop, FrameDirection, FrameRect, FrameTemplateId, FrameTemplateSource } from "../../contracts/frame";

export const FRAME_MM_TO_PT = 72 / 25.4;
export const FRAME_PAGE_PRESETS = {
  A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Square: [210, 210], Panoramic: [297, 148],
} as const;
export const FRAME_TEMPLATE_LABELS: Record<FrameTemplateId, string> = {
  single: "Single", diptych: "Diptych", triptych: "Triptych", "quad-grid": "Quad Grid", "full-page": "Full Page", "square-nine-grid": "Square Nine Grid",
};
export const FRAME_TEMPLATES = Object.keys(FRAME_TEMPLATE_LABELS) as FrameTemplateId[];
export const DEFAULT_FRAME_MARGINS_PT = 12 * FRAME_MM_TO_PT;
export const DEFAULT_FRAME_GAP_PT = 6 * FRAME_MM_TO_PT;

export function frameTemplateSource(id: FrameTemplateId, direction: FrameDirection = "horizontal"): FrameTemplateSource {
  return {
    id, version: 1, direction: id === "diptych" || id === "triptych" ? direction : "horizontal",
    marginsPt: { top: id === "square-nine-grid" ? 0 : DEFAULT_FRAME_MARGINS_PT, right: id === "square-nine-grid" ? 0 : DEFAULT_FRAME_MARGINS_PT,
      bottom: id === "square-nine-grid" ? 0 : DEFAULT_FRAME_MARGINS_PT, left: id === "square-nine-grid" ? 0 : DEFAULT_FRAME_MARGINS_PT },
    gapPt: id === "square-nine-grid" ? 0 : DEFAULT_FRAME_GAP_PT, modified: false,
  };
}

export function defaultFrameCrop(id: FrameTemplateId): FrameCrop {
  return { mode: id === "single" ? "fit" : "fill", zoom: 1, focal: { x: .5, y: .5 } };
}

export function frameTemplateRects(width: number, height: number, template: FrameTemplateSource): readonly FrameRect[] {
  if (![width, height].every((n) => Number.isFinite(n) && n >= 50 * FRAME_MM_TO_PT && n <= 600 * FRAME_MM_TO_PT)) throw new Error("Invalid page size");
  const { top, right, bottom, left } = template.marginsPt;
  const gap = template.gapPt;
  if (![top, right, bottom, left, gap].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("Invalid margin or gap");
  if (template.id === "square-nine-grid") {
    if (Math.abs(width - height) > .01) throw new Error("Nine grid requires a square page");
    const side = width / 3;
    return Array.from({ length: 9 }, (_, index) => ({ x: (index % 3) * side, y: Math.floor(index / 3) * side, width: side, height: side }));
  }
  if (template.id === "full-page") return [{ x: 0, y: 0, width, height }];
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  let rects: FrameRect[];
  if (template.id === "single") rects = [{ x: left, y: top, width: innerWidth, height: innerHeight }];
  else if (template.id === "quad-grid") {
    const w = (innerWidth - gap) / 2, h = (innerHeight - gap) / 2;
    rects = [0, 1, 2, 3].map((i) => ({ x: left + (i % 2) * (w + gap), y: top + Math.floor(i / 2) * (h + gap), width: w, height: h }));
  } else {
    const count = template.id === "diptych" ? 2 : 3;
    rects = Array.from({ length: count }, (_, i) => template.direction === "vertical"
      ? { x: left, y: top + i * ((innerHeight - (count - 1) * gap) / count + gap), width: innerWidth, height: (innerHeight - (count - 1) * gap) / count }
      : { x: left + i * ((innerWidth - (count - 1) * gap) / count + gap), y: top, width: (innerWidth - (count - 1) * gap) / count, height: innerHeight });
  }
  if (rects.some((rect) => rect.width < FRAME_MM_TO_PT || rect.height < FRAME_MM_TO_PT)) throw new Error("Template leaves too little room for photos");
  return rects;
}

export function validFrameCrop(crop: FrameCrop): boolean {
  return (crop.mode === "fit" || crop.mode === "fill") && Number.isFinite(crop.zoom) && crop.zoom >= 1 && crop.zoom <= 8
    && Number.isFinite(crop.focal.x) && crop.focal.x >= 0 && crop.focal.x <= 1
    && Number.isFinite(crop.focal.y) && crop.focal.y >= 0 && crop.focal.y <= 1;
}

export function resolveFramePhoto(image: { width: number; height: number }, frame: { width: number; height: number }, crop: FrameCrop) {
  if (![image.width, image.height, frame.width, frame.height].every((n) => Number.isFinite(n) && n > 0) || !validFrameCrop(crop)) throw new Error("Invalid photo placement");
  const base = crop.mode === "fill" ? Math.max(frame.width / image.width, frame.height / image.height) : Math.min(frame.width / image.width, frame.height / image.height);
  const width = image.width * base * crop.zoom, height = image.height * base * crop.zoom;
  const offset = (frameLength: number, drawnLength: number, focal: number) => drawnLength <= frameLength ? (frameLength - drawnLength) / 2 : Math.max(frameLength - drawnLength, Math.min(0, frameLength / 2 - focal * drawnLength));
  return { x: offset(frame.width, width, crop.focal.x), y: offset(frame.height, height, crop.focal.y), width, height };
}

export function frameWorldSize(frame: { page: { widthPt: number; heightPt: number }; displayScale: number }) {
  return { width: frame.page.widthPt * frame.displayScale, height: frame.page.heightPt * frame.displayScale };
}
