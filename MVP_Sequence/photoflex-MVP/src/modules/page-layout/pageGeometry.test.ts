import { describe, expect, it } from "vitest";
import {
  LAYOUT_TEMPLATES, MM_TO_PT, defaultCrop, defaultTemplate, resolveImagePlacement, templateRects,
} from "./pageGeometry";

describe("shared page geometry", () => {
  it("builds the five Layout templates on a physical A4 page", () => {
    const width = 210 * MM_TO_PT, height = 297 * MM_TO_PT;
    expect(LAYOUT_TEMPLATES).toEqual(["single", "diptych", "triptych", "quad-grid", "full-page"]);
    for (const [id, count] of [["single", 1], ["diptych", 2], ["triptych", 3], ["quad-grid", 4], ["full-page", 1]] as const) {
      const rects = templateRects(width, height, defaultTemplate(id));
      expect(rects).toHaveLength(count);
      expect(rects.every((rect) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height)).toBe(true);
    }
    expect(templateRects(width, height, defaultTemplate("full-page"))).toEqual([{ x: 0, y: 0, width, height }]);
    expect(templateRects(width, height, defaultTemplate("diptych", "vertical"))[1].y).toBeGreaterThan(0);
  });

  it("keeps Fit inside a frame and Fill covering it at independent focal points", () => {
    const image = { width: 1600, height: 900 }, frame = { width: 200, height: 300 };
    const fit = resolveImagePlacement(image, frame, defaultCrop("single"));
    expect(fit.width).toBe(200);
    expect(fit.height).toBeLessThan(300);
    expect(fit.y).toBeGreaterThan(0);

    const fill = resolveImagePlacement(image, frame, { mode: "fill", zoom: 2, focal: { x: .9, y: .2 } });
    expect(fill.x).toBeLessThanOrEqual(0);
    expect(fill.y).toBeLessThanOrEqual(0);
    expect(fill.x + fill.width).toBeGreaterThanOrEqual(frame.width);
    expect(fill.y + fill.height).toBeGreaterThanOrEqual(frame.height);
  });
});
