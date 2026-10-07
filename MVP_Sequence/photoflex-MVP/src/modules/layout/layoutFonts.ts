import type { LayoutFontFamily, LayoutFontStyle, LayoutFontWeight } from "../../contracts";

export interface LayoutFontDefinition {
  readonly family: LayoutFontFamily;
  readonly label: string;
  readonly cssFamily: string;
  readonly selectable?: boolean;
}

export const DEFAULT_LAYOUT_FONT: LayoutFontFamily = "noto-sans-sc";
export const LAYOUT_CHINESE_FALLBACK_FONT: LayoutFontFamily = "noto-serif-sc";

export const LAYOUT_FONT_BY_FAMILY: Readonly<Record<LayoutFontFamily, LayoutFontDefinition>> = {
  "ancizar-serif": { family: "ancizar-serif", label: "Ancizar Serif", cssFamily: "PhotoFlex Ancizar Serif" },
  "noto-sans-sc": { family: "noto-sans-sc", label: "Noto Sans SC", cssFamily: "PhotoFlex Noto Sans SC" },
  "noto-serif-sc": { family: "noto-serif-sc", label: "Noto Serif SC", cssFamily: "PhotoFlex Noto Serif SC" },
  "noto-serif": { family: "noto-serif", label: "Noto Serif", cssFamily: "PhotoFlex Noto Serif" },
  "eb-garamond": { family: "eb-garamond", label: "EB Garamond", cssFamily: "PhotoFlex EB Garamond" },
  "google-sans": { family: "google-sans", label: "Google Sans", cssFamily: "PhotoFlex Google Sans" },
  "roboto": { family: "roboto", label: "Roboto", cssFamily: "PhotoFlex Roboto" },
  "gudea": { family: "gudea", label: "Gudea", cssFamily: "PhotoFlex Gudea" },
  "lxgw-wenkai-tc": { family: "lxgw-wenkai-tc", label: "LXGW WenKai TC", cssFamily: "PhotoFlex LXGW WenKai TC" },
  "courier-prime": { family: "courier-prime", label: "Courier Prime", cssFamily: "PhotoFlex Courier Prime" },
  "architects-daughter": { family: "architects-daughter", label: "Architects Daughter", cssFamily: "PhotoFlex Architects Daughter" },
  "patrick-hand": { family: "patrick-hand", label: "Patrick Hand", cssFamily: "PhotoFlex Patrick Hand" },
  "special-elite": { family: "special-elite", label: "Special Elite", cssFamily: "PhotoFlex Special Elite" },
  "zcool-kuaile": { family: "zcool-kuaile", label: "ZCOOL KuaiLe", cssFamily: "PhotoFlex Noto Serif SC", selectable: false },
  "zcool-qingke-huangyou": { family: "zcool-qingke-huangyou", label: "ZCOOL QingKe HuangYou", cssFamily: "PhotoFlex ZCOOL QingKe HuangYou" },
  "zcool-xiaowei": { family: "zcool-xiaowei", label: "ZCOOL XiaoWei", cssFamily: "PhotoFlex ZCOOL XiaoWei" },
};

export const LAYOUT_FONTS: readonly LayoutFontDefinition[] = Object.values(LAYOUT_FONT_BY_FAMILY).filter((font) => font.selectable !== false);

export const layoutFontWeight = (weight?: LayoutFontWeight): LayoutFontWeight => weight ?? "normal";
export const layoutFontStyle = (style?: LayoutFontStyle): LayoutFontStyle => style ?? "normal";

export function isLayoutFontFamily(value: unknown): value is LayoutFontFamily {
  return typeof value === "string" && Object.hasOwn(LAYOUT_FONT_BY_FAMILY, value);
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
