/** Physical page geometry shared by Table Frame and Layout. Coordinates are points. */
export const MM_TO_PT = 72 / 25.4;
export const PAGE_PRESETS_MM = {
  A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Square: [210, 210], Panoramic: [297, 148],
} as const;
export const DEFAULT_MARGINS_PT = 12 * MM_TO_PT;
export const DEFAULT_GAP_PT = 6 * MM_TO_PT;

export type PageTemplateId = "single" | "diptych" | "triptych" | "quad-grid" | "full-page" | "square-nine-grid";
export type LayoutTemplateId = Exclude<PageTemplateId, "square-nine-grid">;
export const LAYOUT_TEMPLATES: readonly LayoutTemplateId[] = ["single", "diptych", "triptych", "quad-grid", "full-page"];
export type TemplateDirection = "horizontal" | "vertical";

export interface PageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PageTemplateOptions {
  readonly id: PageTemplateId;
  readonly direction: TemplateDirection;
  readonly marginsPt: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly gapPt: number;
}

export interface ImageCrop {
  readonly mode: "fit" | "fill";
  readonly zoom: number;
  readonly focal: { readonly x: number; readonly y: number };
}

export function defaultTemplate(id: PageTemplateId, direction: TemplateDirection = "horizontal"): PageTemplateOptions {
  return {
    id, direction: id === "diptych" || id === "triptych" ? direction : "horizontal",
    marginsPt: { top: id === "square-nine-grid" ? 0 : DEFAULT_MARGINS_PT, right: id === "square-nine-grid" ? 0 : DEFAULT_MARGINS_PT,
      bottom: id === "square-nine-grid" ? 0 : DEFAULT_MARGINS_PT, left: id === "square-nine-grid" ? 0 : DEFAULT_MARGINS_PT },
    gapPt: id === "square-nine-grid" ? 0 : DEFAULT_GAP_PT,
  };
}

export function defaultCrop(id: PageTemplateId): ImageCrop {
  return { mode: id === "single" ? "fit" : "fill", zoom: 1, focal: { x: .5, y: .5 } };
}

export function templateRects(width: number, height: number, template: PageTemplateOptions): readonly PageRect[] {
  if (![width, height].every((n) => Number.isFinite(n) && n >= 50 * MM_TO_PT && n <= 600 * MM_TO_PT)) throw new Error("Invalid page size");
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
  let rects: PageRect[];
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
  if (rects.some((rect) => rect.width < MM_TO_PT || rect.height < MM_TO_PT)) throw new Error("Template leaves too little room for photos");
  return rects;
}

export function validCrop(crop: ImageCrop): boolean {
  return (crop.mode === "fit" || crop.mode === "fill") && Number.isFinite(crop.zoom) && crop.zoom >= 1 && crop.zoom <= 8
    && Number.isFinite(crop.focal.x) && crop.focal.x >= 0 && crop.focal.x <= 1
    && Number.isFinite(crop.focal.y) && crop.focal.y >= 0 && crop.focal.y <= 1;
}

export function resolveImagePlacement(image: { width: number; height: number }, frame: { width: number; height: number }, crop: ImageCrop) {
  if (![image.width, image.height, frame.width, frame.height].every((n) => Number.isFinite(n) && n > 0) || !validCrop(crop)) throw new Error("Invalid photo placement");
  const base = crop.mode === "fill" ? Math.max(frame.width / image.width, frame.height / image.height) : Math.min(frame.width / image.width, frame.height / image.height);
  const width = image.width * base * crop.zoom, height = image.height * base * crop.zoom;
  const offset = (frameLength: number, drawnLength: number, focal: number) => drawnLength <= frameLength ? (frameLength - drawnLength) / 2 : Math.max(frameLength - drawnLength, Math.min(0, frameLength / 2 - focal * drawnLength));
  return { x: offset(frame.width, width, crop.focal.x), y: offset(frame.height, height, crop.focal.y), width, height };
}
