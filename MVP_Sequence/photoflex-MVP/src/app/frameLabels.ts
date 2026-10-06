import type { FrameEdgeStyle, FrameTemplateFamily, FrameTemplateId } from "../contracts";
import { FRAME_TEMPLATE_LABELS } from "../modules/worktable/frameLayout";

const families: Record<FrameTemplateFamily, string> = {
  plain: "普通页面", instax: "Instax", polaroid: "宝丽来", frames: "画框", sheets: "既有画框",
};
const templates: Record<FrameTemplateId, string> = {
  single: "单图", diptych: "双图", triptych: "三图", "quad-grid": "四宫格", "full-page": "满版", "square-nine-grid": "九宫格",
  "instax-mini": "Instax 迷你", "instax-square": "Instax 方形", "instax-wide": "Instax 宽幅",
  "polaroid-classic": "经典 600", "polaroid-square": "方形", "polaroid-land": "Land 相机",
  "gallery-single": "画廊单图", "sheet-proof": "4 × 3 样片", "sheet-film": "35mm 胶卷", "sheet-bw": "黑白接触印样", "sheet-portra": "Portra 400",
};
const edgeColors: Record<string, string> = {
  Black: "黑色", Charcoal: "炭灰", Walnut: "胡桃木", Espresso: "深咖啡", "Ink blue": "墨蓝", Forest: "森林绿",
  Burgundy: "酒红", Oak: "橡木", "Natural ash": "自然白蜡木", "Gallery white": "画廊白",
};
const edgeMaterials: Record<FrameEdgeStyle["material"], string> = { flat: "平面", wood: "木纹", metal: "拉丝金属", beveled: "立体斜边" };

export const frameTemplateLabel = (id: FrameTemplateId, zh: boolean) => zh ? templates[id] : FRAME_TEMPLATE_LABELS[id];
export const frameFamilyLabel = (family: { id: FrameTemplateFamily; label: string }, zh: boolean) => zh ? families[family.id] : family.label;
export const frameEdgeColorLabel = (name: string, zh: boolean) => zh ? edgeColors[name] ?? name : name;
export const frameEdgeMaterialLabel = (material: { id: FrameEdgeStyle["material"]; label: string }, zh: boolean) => zh ? edgeMaterials[material.id] : material.label;
