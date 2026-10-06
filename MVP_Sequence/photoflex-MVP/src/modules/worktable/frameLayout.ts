import type { FrameDirection, FrameTemplateFamily, FrameTemplateId, FrameTemplateSource, PlainFrameTemplateId, WorktableFrame } from "../../contracts/frame";
import { defaultCrop, defaultTemplate, MM_TO_PT, templateRects } from "../page-layout/pageGeometry";
import type { LayoutPaper } from "../../contracts";

export {
  MM_TO_PT as FRAME_MM_TO_PT, PAGE_PRESETS_MM as FRAME_PAGE_PRESETS,
  DEFAULT_MARGINS_PT as DEFAULT_FRAME_MARGINS_PT, DEFAULT_GAP_PT as DEFAULT_FRAME_GAP_PT,
  validCrop as validFrameCrop, resolveImagePlacement as resolveFramePhoto,
} from "../page-layout/pageGeometry";

export const FRAME_FAMILIES: readonly { id: FrameTemplateFamily; label: string; description: string; templateIds: readonly FrameTemplateId[] }[] = [
  { id: "plain", label: "Plain Page", description: "Simple photo layouts", templateIds: ["single", "diptych", "triptych", "quad-grid", "full-page", "square-nine-grid"] },
  { id: "instax", label: "Instax", description: "Small-format instant film", templateIds: ["instax-mini", "instax-square", "instax-wide"] },
  { id: "polaroid", label: "Polaroid", description: "Classic instant proportions", templateIds: ["polaroid-classic", "polaroid-square", "polaroid-land"] },
  { id: "frames", label: "Frames", description: "Museum-style compositions", templateIds: ["gallery-single"] },
];
export const FRAME_TEMPLATE_LABELS: Record<FrameTemplateId, string> = {
  single: "Single", diptych: "Diptych", triptych: "Triptych", "quad-grid": "Quad Grid", "full-page": "Full Page", "square-nine-grid": "Square Nine Grid",
  "instax-mini": "Instax mini", "instax-square": "Instax square", "instax-wide": "Instax wide",
  "polaroid-classic": "Classic 600", "polaroid-square": "Square type", "polaroid-land": "Land camera",
  "sheet-proof": "4 × 3 proof sheet", "sheet-film": "35mm film roll", "sheet-bw": "B&W contact sheet", "sheet-portra": "Portra 400", "gallery-single": "Gallery single",
};
export const FRAME_TEMPLATES = Object.keys(FRAME_TEMPLATE_LABELS) as FrameTemplateId[];
const sizes: Partial<Record<FrameTemplateId, readonly [number, number]>> = {
  "instax-mini": [54, 86], "instax-square": [86, 72], "instax-wide": [108, 86],
  "polaroid-classic": [88.9, 107.95], "polaroid-square": [88.9, 88.9], "polaroid-land": [107.95, 86.36],
  "sheet-proof": [240, 225], "sheet-film": [297, 250], "sheet-bw": [297, 238], "sheet-portra": [148, 182],
  "gallery-single": [609.6, 762], "square-nine-grid": [210, 210],
};
export const FRAME_EDGE_COLORS = [
  { name: "Black", color: "#242320" }, { name: "Charcoal", color: "#3D3E40" },
  { name: "Walnut", color: "#493025" }, { name: "Espresso", color: "#2E211D" },
  { name: "Ink blue", color: "#263345" }, { name: "Forest", color: "#2C3D33" },
  { name: "Burgundy", color: "#4A2932" }, { name: "Oak", color: "#865F3F" },
  { name: "Natural ash", color: "#B3A68C" }, { name: "Gallery white", color: "#EEECE5" },
] as const;

// Existing sheets remain readable after their creation entry is removed.
const legacySheets = { id: "sheets" as const, label: "Existing frame", description: "", templateIds: [] as readonly FrameTemplateId[] };
export function frameFamily(id: FrameTemplateId) { return id.startsWith("sheet-") ? legacySheets : FRAME_FAMILIES.find((family) => family.templateIds.includes(id))!; }
export function framePageSize(id: FrameTemplateId) { const [width, height] = sizes[id] ?? [210, 297]; return { widthPt: width * MM_TO_PT, heightPt: height * MM_TO_PT }; }
export function frameCapacity(id: FrameTemplateId) { return id === "sheet-proof" ? 12 : id === "sheet-film" ? 36 : id === "sheet-bw" ? 30 : id === "sheet-portra" || id === "triptych" ? 3 : id === "quad-grid" ? 4 : id === "diptych" ? 2 : id === "square-nine-grid" ? 9 : 1; }
export function frameTemplateNote(id: FrameTemplateId) {
  if (frameFamily(id).id === "plain") return `${frameCapacity(id)} slots`;
  if (frameFamily(id).id === "sheets") return `${frameCapacity(id)} ${id === "sheet-proof" ? "square exposures" : "exposures"}`;
  const [width, height] = sizes[id]!; return `${width} × ${height} mm`;
}
export function frameTemplateSource(id: FrameTemplateId, direction: FrameDirection = "horizontal"): FrameTemplateSource {
  const source = defaultTemplate(frameFamily(id).id === "plain" ? id as PlainFrameTemplateId : "single", direction);
  return { ...source, id, version: 1, modified: false };
}
export function defaultFrameCrop(id: FrameTemplateId) { return defaultCrop(frameFamily(id).id === "plain" ? id as PlainFrameTemplateId : "full-page"); }
export function framePaper(page: WorktableFrame["page"]): LayoutPaper {
  const family = frameFamily(page.templateSource.id).id;
  return page.paper ?? { color: page.background === "black" ? "#161616" : family === "plain" || family === "instax" || family === "polaroid" ? "#FFFFFF" : family === "sheets" ? page.templateSource.id === "sheet-bw" ? "#080808" : "#170B07" : "#F4EFE5", material: "none" };
}
export function frameTemplateRects(width: number, height: number, template: FrameTemplateSource) {
  const family = frameFamily(template.id);
  if (!family) throw new Error("Unknown frame template");
  if (family.id === "plain") return templateRects(width, height, { ...template, id: template.id as PlainFrameTemplateId });
  if (![width, height].every((n) => Number.isFinite(n) && n >= 50 * MM_TO_PT && n <= 1000 * MM_TO_PT)) throw new Error("Invalid frame size");
  const id = template.id;
  if (id === "gallery-single") return [{ x: width * .365, y: height * .355, width: width * .27, height: height * .29 }];
  if (family.id === "instax" || family.id === "polaroid") {
    const side = width * (id === "instax-mini" ? .08 : .06), top = height * .055;
    const bottom = height * (id === "polaroid-square" ? .13 : .20);
    return [{ x: side, y: top, width: width - side * 2, height: height - top - bottom }];
  }
  if (id === "sheet-portra") return Array.from({ length: 3 }, (_, i) => ({ x: width * .06, y: height * (.065 + i * .31), width: width * .88, height: height * .245 }));
  const columns = id === "sheet-proof" ? 4 : 6;
  const rows = id === "sheet-proof" ? 3 : id === "sheet-bw" ? 5 : 6;
  const outer = width * .022, gap = width * (id === "sheet-proof" ? .012 : .006);
  const band = width * (id === "sheet-proof" ? .025 : .012);
  const cellWidth = (width - outer * 2 - gap * (columns - 1)) / columns;
  const maxHeight = (height - outer * 2 - (rows - 1) * gap) / rows - band;
  const ratio = id === "sheet-proof" ? 1 : id === "sheet-bw" ? 1.34 : 1.5;
  const cellHeight = Math.min(maxHeight, cellWidth / ratio);
  const photoWidth = cellHeight * ratio;
  if (Math.min(photoWidth, cellHeight) < MM_TO_PT) throw new Error("Page leaves too little room for photos");
  const left = (width - columns * photoWidth - (columns - 1) * gap) / 2;
  const top = id === "sheet-bw" ? outer : (height - rows * (cellHeight + band) - (rows - 1) * gap) / 2;
  return Array.from({ length: columns * rows }, (_, i) => ({ x: left + (i % columns) * (photoWidth + gap), y: top + Math.floor(i / columns) * (cellHeight + band + gap), width: photoWidth, height: cellHeight }));
}
export function frameWorldSize(frame: { page: { widthPt: number; heightPt: number }; displayScale: number }) {
  return { width: frame.page.widthPt * frame.displayScale, height: frame.page.heightPt * frame.displayScale };
}
