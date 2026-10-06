import { describe, expect, it } from "vitest";
import { LAYOUT_FONTS } from "../../modules/layout/layoutFonts";
import { resolveLayoutFontAsset } from "./layoutFontAssets";

describe("Layout font assets", () => {
  it("uses native faces when present and marks only missing variants for synthesis", () => {
    expect(resolveLayoutFontAsset("roboto", "bold", "italic")).toMatchObject({ syntheticBold: false, syntheticItalic: false });
    expect(resolveLayoutFontAsset("noto-sans-sc", "bold", "italic")).toMatchObject({ syntheticBold: false, syntheticItalic: true });
    expect(resolveLayoutFontAsset("architects-daughter", "bold", "italic")).toMatchObject({ syntheticBold: true, syntheticItalic: true });
    expect(resolveLayoutFontAsset("eb-garamond", "bold", "italic")).toMatchObject({ syntheticBold: false, syntheticItalic: false });
    expect(resolveLayoutFontAsset("lxgw-wenkai-tc", "bold", "italic")).toMatchObject({ syntheticBold: false, syntheticItalic: true });
    expect(resolveLayoutFontAsset("ancizar-serif", "bold", "italic")).toMatchObject({ syntheticBold: true, syntheticItalic: true });
    expect(resolveLayoutFontAsset("zcool-kuaile").url).toBe(resolveLayoutFontAsset("noto-serif-sc").url);
  });

  it("offers added fonts but keeps a removed font only for legacy documents", () => {
    const families = LAYOUT_FONTS.map((font) => font.family);
    expect(families).toEqual(expect.arrayContaining(["ancizar-serif", "eb-garamond", "lxgw-wenkai-tc"]));
    expect(families).not.toContain("zcool-kuaile");
  });
});
