import { afterEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_FONTS } from "../../modules/layout/layoutFonts";
import { resolveLayoutFontAsset } from "./layoutFontAssets";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Layout font assets", () => {
  it("deduplicates in-flight requests, evicts failures and reuses a successful fallback", async () => {
    vi.resetModules();
    const { loadLayoutFont } = await import("./layoutFontAssets");
    let failed = true;
    const load = vi.fn(async (font: string) => {
      if (font.includes("Architects") && failed) throw Error("Font offline");
      return [];
    });
    vi.stubGlobal("document", { fonts: { load } });
    vi.stubGlobal("FontFace", undefined);
    const attempts = await Promise.allSettled([loadLayoutFont("architects-daughter"), loadLayoutFont("architects-daughter")]);
    expect(attempts.map((attempt) => attempt.status)).toEqual(["rejected", "rejected"]);
    expect(load).toHaveBeenCalledTimes(2);
    failed = false;
    await loadLayoutFont("architects-daughter");
    await loadLayoutFont("architects-daughter");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("recreates an errored browser face on retry while retaining synthetic variants", async () => {
    vi.resetModules();
    const { loadLayoutFont } = await import("./layoutFontAssets");
    const add = vi.fn();
    const load = vi.fn(async (font: string) => { if (font.includes("Architects")) throw Error("CSS face failed"); return []; });
    const freshLoad = vi.fn(async function (this: object) { return this; });
    const faces: { family: string; source: string; options: FontFaceDescriptors }[] = [];
    vi.stubGlobal("document", { fonts: { load, add } });
    vi.stubGlobal("FontFace", class {
      constructor(family: string, source: string, options: FontFaceDescriptors) { faces.push({ family, source, options }); }
      load = freshLoad;
    });
    await expect(loadLayoutFont("architects-daughter", "bold", "italic")).rejects.toThrow("CSS face failed");
    await loadLayoutFont("architects-daughter", "bold", "italic");
    expect(faces).toMatchObject([{ family: "PhotoFlex Architects Daughter", options: { weight: "400", style: "normal" } }]);
    expect(freshLoad).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(2);
  });
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
