import { describe, expect, it } from "vitest";
import { resolveLayoutFontAsset } from "./layoutFontAssets";

describe("Layout font assets", () => {
  it("uses native faces when present and marks only missing variants for synthesis", () => {
    expect(resolveLayoutFontAsset("roboto", "bold", "italic")).toMatchObject({ syntheticBold: false, syntheticItalic: false });
    expect(resolveLayoutFontAsset("noto-sans-sc", "bold", "italic")).toMatchObject({ syntheticBold: false, syntheticItalic: true });
    expect(resolveLayoutFontAsset("architects-daughter", "bold", "italic")).toMatchObject({ syntheticBold: true, syntheticItalic: true });
  });
});
