import { describe, expect, it } from "vitest";
import type { LayoutId, LayoutObjectId, LayoutPageId, PhotoId, ProjectId, SequenceId } from "../../contracts";
import { applyLayoutCommand, createEmptyLayout } from "./layoutDocument";
import { alignLayoutRect, createImageFrame, drawImageRect, imageTemplateFrames, panImageCrop, replaceFramePhoto, transformImageRect, zoomImageCropAtPoint } from "./layoutImages";
import { MM_TO_PT } from "../page-layout/pageGeometry";

const spec = { widthPt: 210 * MM_TO_PT, heightPt: 297 * MM_TO_PT };
describe("Layout image actions", () => {
  it("draws, snaps and resizes within the supported paper intersection", () => {
    expect(drawImageRect({ x: 20, y: 30 }, { x: 100, y: 130 }, spec)).toEqual({ x: 20, y: 30, width: 80, height: 100 });
    expect(drawImageRect({ x: 20, y: 30 }, { x: 21, y: 31 }, spec)).toBeUndefined();
    const rect = { x: 22, y: 30, width: 80, height: 100 };
    expect(transformImageRect(rect, "move", -20, 0, spec).x).toBe(0);
    expect(transformImageRect(rect, "e", -500, 0, spec).width).toBeCloseTo(MM_TO_PT);
    expect(transformImageRect(rect, "se", 15, 20, spec)).toEqual({ x: 22, y: 30, width: 95, height: 120 });
  });

  it("snaps moved and resized frames to the page and neighboring objects with visible guide positions", () => {
    const page = { widthPt: 600, heightPt: 800 };
    const neighbor = { x: 300, y: 200, width: 100, height: 100 };
    expect(alignLayoutRect({ x: 196, y: 194, width: 100, height: 100 }, "move", page, [neighbor], 7)).toEqual({
      rect: { x: 200, y: 200, width: 100, height: 100 }, guides: [{ axis: "x", value: 300 }, { axis: "y", value: 200 }],
    });
    expect(alignLayoutRect({ x: 100, y: 100, width: 195, height: 100 }, "e", page, [neighbor], 7)).toEqual({
      rect: { x: 100, y: 100, width: 200, height: 100 }, guides: [{ axis: "x", value: 300 }],
    });
    expect(alignLayoutRect({ x: 246, y: 100, width: 100, height: 100 }, "move", page, [], 7).guides)
      .toContainEqual({ axis: "x", value: 300 });
    expect(alignLayoutRect({ x: 120, y: 120, width: 100, height: 100 }, "move", page, [], 7).guides).toEqual([]);
  });

  it("keeps photos independent and constrains crop focal and zoom", () => {
    const first = createImageFrame("frame" as LayoutObjectId, { x: 0, y: 0, width: 100, height: 100 }, "a" as PhotoId);
    const moved = panImageCrop(first.crop, { width: 200, height: 100 }, first.rect, 1000, -1000);
    expect(moved.focal).toEqual({ x: 0, y: 1 });
    expect(replaceFramePhoto(first, "b" as PhotoId)).toMatchObject({ photoId: "b", crop: { mode: "fit", zoom: 1, focal: { x: .5, y: .5 } } });
    expect(first.photoId).toBe("a");
    const zoomed = zoomImageCropAtPoint(first.crop, { width: 200, height: 100 }, first.rect, 2, { x: 25, y: 50 });
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.focal.x).toBeLessThan(.5);
  });

  it("replaces image frames in one document command while preserving text, and templates become ordinary frames", () => {
    const document = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId, sequenceId: "sequence" as SequenceId,
      pageId: "page" as LayoutPageId, name: "Book", createdAt: "now" });
    const text = { kind: "text-box" as const, id: "text" as LayoutObjectId, rect: { x: 20, y: 20, width: 120, height: 100 }, text: "Preserve me",
      style: { fontFamily: "noto-sans-sc" as const, fontSizePt: 12, lineHeight: 1.4, color: "#171513", align: "left" as const } };
    const withText = applyLayoutCommand(document, { type: "upsert-object", pageId: document.pages[0].id, object: text });
    expect(withText.ok).toBe(true);
    if (!withText.ok) return;
    const photo = "photo" as PhotoId;
    let id = 0;
    for (const template of ["single", "diptych", "triptych", "quad-grid", "full-page"] as const) {
      const frames = imageTemplateFrames({ id: template, direction: "horizontal", spec, marginMm: 12, gapMm: 6, photoIds: [photo], newId: () => `frame-${++id}` as LayoutObjectId });
      expect(frames).toHaveLength({ single: 1, diptych: 2, triptych: 3, "quad-grid": 4, "full-page": 1 }[template]);
      expect(frames[0].photoId).toBe(photo);
      const result = applyLayoutCommand(withText.value, { type: "replace-image-frames", pageId: document.pages[0].id, frames });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.pages[0].objects.at(-1)).toEqual(text);
    }
  });
});
