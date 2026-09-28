import type { LayoutFontFamily, LayoutFontStyle, LayoutFontWeight } from "../../contracts";

export interface LayoutFontDefinition {
  readonly family: LayoutFontFamily;
  readonly label: string;
  readonly cssFamily: string;
}

export const DEFAULT_LAYOUT_FONT: LayoutFontFamily = "noto-sans-sc";
export const LAYOUT_CHINESE_FALLBACK_FONT: LayoutFontFamily = "noto-serif-sc";

export const LAYOUT_FONT_BY_FAMILY: Readonly<Record<LayoutFontFamily, LayoutFontDefinition>> = {
  "noto-sans-sc": { family: "noto-sans-sc", label: "Noto Sans SC", cssFamily: "PhotoFlex Noto Sans SC" },
  "noto-serif-sc": { family: "noto-serif-sc", label: "Noto Serif SC", cssFamily: "PhotoFlex Noto Serif SC" },
  "noto-serif": { family: "noto-serif", label: "Noto Serif", cssFamily: "PhotoFlex Noto Serif" },
  "google-sans": { family: "google-sans", label: "Google Sans", cssFamily: "PhotoFlex Google Sans" },
  "roboto": { family: "roboto", label: "Roboto", cssFamily: "PhotoFlex Roboto" },
  "gudea": { family: "gudea", label: "Gudea", cssFamily: "PhotoFlex Gudea" },
  "courier-prime": { family: "courier-prime", label: "Courier Prime", cssFamily: "PhotoFlex Courier Prime" },
  "architects-daughter": { family: "architects-daughter", label: "Architects Daughter", cssFamily: "PhotoFlex Architects Daughter" },
  "patrick-hand": { family: "patrick-hand", label: "Patrick Hand", cssFamily: "PhotoFlex Patrick Hand" },
  "special-elite": { family: "special-elite", label: "Special Elite", cssFamily: "PhotoFlex Special Elite" },
  "zcool-kuaile": { family: "zcool-kuaile", label: "ZCOOL KuaiLe", cssFamily: "PhotoFlex ZCOOL KuaiLe" },
  "zcool-qingke-huangyou": { family: "zcool-qingke-huangyou", label: "ZCOOL QingKe HuangYou", cssFamily: "PhotoFlex ZCOOL QingKe HuangYou" },
  "zcool-xiaowei": { family: "zcool-xiaowei", label: "ZCOOL XiaoWei", cssFamily: "PhotoFlex ZCOOL XiaoWei" },
};

export const LAYOUT_FONTS: readonly LayoutFontDefinition[] = Object.values(LAYOUT_FONT_BY_FAMILY);

export const layoutFontWeight = (weight?: LayoutFontWeight): LayoutFontWeight => weight ?? "normal";
export const layoutFontStyle = (style?: LayoutFontStyle): LayoutFontStyle => style ?? "normal";

export function isLayoutFontFamily(value: unknown): value is LayoutFontFamily {
  return typeof value === "string" && value in LAYOUT_FONT_BY_FAMILY;
}

/** Browser fallback is glyph-based, so unsupported Chinese uses Noto Serif SC without changing Latin glyphs. */
export function layoutFontCssStack(family: LayoutFontFamily): string {
  const primary = LAYOUT_FONT_BY_FAMILY[family].cssFamily;
  const fallback = LAYOUT_FONT_BY_FAMILY[LAYOUT_CHINESE_FALLBACK_FONT].cssFamily;
  return primary === fallback ? `"${primary}", serif` : `"${primary}", "${fallback}", serif`;
}

export function layoutFontCssShorthand(family: LayoutFontFamily, sizePx: number, weight?: LayoutFontWeight, style?: LayoutFontStyle): string {
  return `${layoutFontStyle(style)} ${layoutFontWeight(weight) === "bold" ? 700 : 400} ${sizePx}px ${layoutFontCssStack(family)}`;
}
