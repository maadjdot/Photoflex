import { describe, expect, it } from "vitest";
import { isDarkLayoutPaper, isLayoutPaper, layoutPaperStyle, LAYOUT_PAPER_COLORS, LAYOUT_PAPER_MATERIALS } from "./layoutPaper";

describe("Layout paper definitions", () => {
  it("keeps the supported palette and material IDs stable", () => {
    expect(LAYOUT_PAPER_COLORS).toHaveLength(17);
    expect(LAYOUT_PAPER_MATERIALS.map((material) => material.id)).toEqual([
      "none", "fine-paper", "natural-fiber", "fine-linen", "coarse-linen", "bookcloth",
    ]);
    expect(isLayoutPaper({ color: "#F8F7F3", material: "fine-paper" })).toBe(true);
    expect(isLayoutPaper({ color: "white", material: "fine-paper" })).toBe(false);
  });

  it("adapts texture blending to paper luminance and never tiles bookcloth", () => {
    const light = layoutPaperStyle({ color: "#F8F7F3", material: "coarse-linen" });
    const dark = layoutPaperStyle({ color: "#28282A", material: "coarse-linen" });
    const bookcloth = layoutPaperStyle({ color: "#F4EFE5", material: "bookcloth" });
    expect(light["--layout-paper-texture-blend"]).toBe("multiply");
    expect(Number(light["--layout-paper-texture-opacity"])).toBeGreaterThan(0);
    expect(dark["--layout-paper-texture-blend"]).toBe("soft-light");
    expect(Number(dark["--layout-paper-texture-opacity"])).toBeGreaterThan(Number(light["--layout-paper-texture-opacity"]));
    expect(bookcloth["--layout-paper-texture-repeat"]).toBe("no-repeat");
    expect(bookcloth["--layout-paper-texture-size"]).toBe("cover");
    expect(isDarkLayoutPaper({ color: "#28282A", material: "none" })).toBe(true);
  });
});
