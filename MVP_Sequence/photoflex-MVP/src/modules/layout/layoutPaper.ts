import type { CSSProperties } from "react";
import type { LayoutPage, LayoutPaper, LayoutPaperMaterial } from "../../contracts";
import finePaperUrl from "../../assets/layout-paper/fine-paper.jpg";
import naturalFiberUrl from "../../assets/layout-paper/natural-fiber.jpg";
import fineLinenUrl from "../../assets/layout-paper/fine-linen.jpg";
import coarseLinenUrl from "../../assets/layout-paper/coarse-linen.jpg";
import bookclothUrl from "../../assets/layout-paper/bookcloth.jpg";

export const DEFAULT_LAYOUT_PAPER: LayoutPaper = { color: "#FFFFFF", material: "none" };

export interface LayoutPaperColor {
  readonly name: string;
  readonly nameZh: string;
  readonly color: string;
}

export const LAYOUT_PAPER_COLORS: readonly LayoutPaperColor[] = [
  { name: "Pure White", nameZh: "纯白", color: "#FFFFFF" },
  { name: "Snow White", nameZh: "雪绒白", color: "#F8F7F3" },
  { name: "Apricot White", nameZh: "蜜杏白", color: "#FDF6EC" },
  { name: "Mist Green White", nameZh: "雾绿白", color: "#FAFBF6" },
  { name: "Linen White", nameZh: "亚麻白", color: "#F0EEE8" },
  { name: "Old Paper", nameZh: "旧纸米", color: "#F1EDE1" },
  { name: "Warm Ivory", nameZh: "暖象牙", color: "#F4EFE5" },
  { name: "Stone Grey", nameZh: "岩灰", color: "#8B8984" },
  { name: "Charcoal", nameZh: "炭黑", color: "#28282A" },
  { name: "Cocoa Brown", nameZh: "可可棕", color: "#432E28" },
  { name: "Taupe", nameZh: "灰褐", color: "#5B4C45" },
  { name: "Deep Moss", nameZh: "深苔绿", color: "#465146" },
  { name: "Dark Olive", nameZh: "暗橄榄", color: "#5B603E" },
  { name: "Ink Blue", nameZh: "墨水蓝", color: "#1E2B45" },
  { name: "Smoke Blue", nameZh: "烟雾蓝", color: "#404A58" },
  { name: "Dusty Rose", nameZh: "灰玫瑰", color: "#835660" },
  { name: "Dark Mulberry", nameZh: "暗桑葚", color: "#5D4149" },
] as const;

export interface LayoutPaperMaterialOption {
  readonly id: LayoutPaperMaterial;
  readonly name: string;
  readonly nameZh: string;
  readonly textureUrl?: string;
  readonly size: string;
  readonly sizeRatio: number;
  readonly lightOpacity: number;
  readonly darkOpacity: number;
  readonly filter: string;
  readonly repeat: "repeat" | "no-repeat";
  readonly position: string;
}

export const LAYOUT_PAPER_MATERIALS: readonly LayoutPaperMaterialOption[] = [
  { id: "none", name: "No texture", nameZh: "无纹理", size: "cover", sizeRatio: 1, lightOpacity: 0, darkOpacity: 0, filter: "none", repeat: "no-repeat", position: "center" },
  { id: "fine-paper", name: "Fine cotton paper", nameZh: "细纹棉纸", textureUrl: finePaperUrl, size: "42% auto", sizeRatio: .42, lightOpacity: .16, darkOpacity: .30, filter: "grayscale(1) brightness(.55) contrast(1.7)", repeat: "repeat", position: "0 0" },
  { id: "natural-fiber", name: "Natural fibre paper", nameZh: "自然纤维纸", textureUrl: naturalFiberUrl, size: "58% auto", sizeRatio: .58, lightOpacity: .20, darkOpacity: .42, filter: "grayscale(1) brightness(.55) contrast(2)", repeat: "repeat", position: "0 0" },
  { id: "fine-linen", name: "Fine linen", nameZh: "细麻布纹", textureUrl: fineLinenUrl, size: "36% auto", sizeRatio: .36, lightOpacity: .22, darkOpacity: .44, filter: "grayscale(1) brightness(.56) contrast(2.25)", repeat: "repeat", position: "0 0" },
  { id: "coarse-linen", name: "Coarse linen", nameZh: "粗麻布纹", textureUrl: coarseLinenUrl, size: "52% auto", sizeRatio: .52, lightOpacity: .26, darkOpacity: .50, filter: "grayscale(1) brightness(.58) contrast(2.35)", repeat: "repeat", position: "0 0" },
  { id: "bookcloth", name: "Diagonal bookcloth", nameZh: "斜纹装帧布", textureUrl: bookclothUrl, size: "cover", sizeRatio: 1, lightOpacity: .20, darkOpacity: .42, filter: "grayscale(1) brightness(2.9) contrast(1.8)", repeat: "no-repeat", position: "center" },
] as const;

const PAPER_MATERIAL_IDS = new Set<LayoutPaperMaterial>(LAYOUT_PAPER_MATERIALS.map((material) => material.id));

export function isLayoutPaperMaterial(value: unknown): value is LayoutPaperMaterial {
  return typeof value === "string" && PAPER_MATERIAL_IDS.has(value as LayoutPaperMaterial);
}

export function isLayoutPaper(value: unknown): value is LayoutPaper {
  if (!value || typeof value !== "object") return false;
  const paper = value as Partial<LayoutPaper>;
  return typeof paper.color === "string" && /^#[0-9a-fA-F]{6}$/.test(paper.color) && isLayoutPaperMaterial(paper.material);
}

export function resolveLayoutPaper(page: Pick<LayoutPage, "paper">): LayoutPaper {
  return page.paper ?? DEFAULT_LAYOUT_PAPER;
}

export function layoutPaperMaterial(material: LayoutPaperMaterial): LayoutPaperMaterialOption {
  return LAYOUT_PAPER_MATERIALS.find((entry) => entry.id === material) ?? LAYOUT_PAPER_MATERIALS[0];
}

export function layoutPaperLuminance(color: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return 1;
  const channel = (offset: number) => {
    const value = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  };
  return .2126 * channel(0) + .7152 * channel(2) + .0722 * channel(4);
}

export function isDarkLayoutPaper(paper: LayoutPaper): boolean {
  return layoutPaperLuminance(paper.color) < .32;
}

export type LayoutPaperStyle = CSSProperties & Record<`--layout-paper-${string}`, string | number>;

export function layoutPaperStyle(paper: LayoutPaper): LayoutPaperStyle {
  const material = layoutPaperMaterial(paper.material);
  const dark = isDarkLayoutPaper(paper);
  return {
    backgroundColor: paper.color,
    "--layout-paper-texture": material.textureUrl ? `url("${material.textureUrl}")` : "none",
    "--layout-paper-texture-size": material.size,
    "--layout-paper-texture-opacity": dark ? material.darkOpacity : material.lightOpacity,
    "--layout-paper-texture-filter": dark ? material.filter : "none",
    "--layout-paper-texture-blend": "soft-light",
    "--layout-paper-texture-repeat": material.repeat,
    "--layout-paper-texture-position": material.position,
  };
}
