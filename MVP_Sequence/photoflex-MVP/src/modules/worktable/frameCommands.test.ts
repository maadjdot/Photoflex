import { describe, expect, it } from "vitest";
import type { FrameId, FrameSlotId, FrameTemplateId, PhotoId, ProjectId, WorktableFrame } from "../../contracts";
import { createEmptyWorktable, createWorktableEditor } from "./worktableEditor";
import { defaultFrameCrop, frameTemplateRects, frameTemplateSource, resolveFramePhoto, FRAME_MM_TO_PT } from "./frameLayout";

const pageWidth = 210 * FRAME_MM_TO_PT, pageHeight = 297 * FRAME_MM_TO_PT;
function frame(templateId: FrameTemplateId): WorktableFrame {
  const template = frameTemplateSource(templateId);
  const widthPt = pageWidth, heightPt = templateId === "square-nine-grid" ? pageWidth : pageHeight;
  return { id: "frame-a" as FrameId, name: "Frame 01", x: 20, y: 30, z: 1, displayScale: .5,
    page: { widthPt, heightPt, templateSource: template,
      slots: frameTemplateRects(widthPt, heightPt, template).map((rect, index) => ({ id: `slot-${index}` as FrameSlotId, rect, photoId: null, crop: defaultFrameCrop(templateId) })) } };
}

describe("Frame editing", () => {
  it("builds six page layouts at physical page size", () => {
    for (const [id, count] of [["single", 1], ["diptych", 2], ["triptych", 3], ["quad-grid", 4], ["full-page", 1], ["square-nine-grid", 9]] as const) {
      const result = frame(id);
      expect(result.page.slots).toHaveLength(count);
      expect(result.page.slots.every((slot) => slot.rect.x >= 0 && slot.rect.y >= 0 && slot.rect.x + slot.rect.width <= pageWidth && slot.rect.y + slot.rect.height <= pageHeight)).toBe(true);
    }
    expect(frame("full-page").page.slots[0].rect).toEqual({ x: 0, y: 0, width: pageWidth, height: pageHeight });
    const nine = frame("square-nine-grid");
    expect(nine.page.widthPt).toBe(nine.page.heightPt);
    expect(nine.page.slots[0].rect).toEqual({ x: 0, y: 0, width: pageWidth / 3, height: pageWidth / 3 });
    expect(nine.page.slots[8].rect.x + nine.page.slots[8].rect.width).toBeCloseTo(pageWidth);
    expect(nine.page.slots[8].rect.y + nine.page.slots[8].rect.height).toBeCloseTo(pageWidth);
  });

  it("keeps photo cards independent, rejects overflow atomically, and undoes a template change in one step", () => {
    const editor = createWorktableEditor(createEmptyWorktable("project" as ProjectId));
    const initial = frame("diptych");
    expect(editor.execute({ type: "create-frame", frame: initial }).ok).toBe(true);
    expect(editor.execute({ type: "fill-frame-slots", frameId: initial.id, photoIds: ["photo-a", "photo-b"] as PhotoId[] }).ok).toBe(true);
    const before = editor.snapshot();
    expect(editor.execute({ type: "fill-frame-slots", frameId: initial.id, photoIds: ["photo-c"] as PhotoId[] })).toMatchObject({ ok: false, error: { kind: "frame-capacity" } });
    expect(editor.snapshot()).toEqual(before);
    expect(editor.execute({ type: "apply-frame-template", frameId: initial.id, template: frameTemplateSource("single"), expectedSlotIds: initial.page.slots.map((slot) => slot.id) }).ok).toBe(true);
    expect(editor.snapshot().frames?.[initial.id].page.slots.map((slot) => slot.photoId)).toEqual(["photo-a", "photo-b"]);
    expect(editor.snapshot().frames?.[initial.id].page.slots[1].origin).toBe("manual");
    expect(editor.undo()).toEqual(before);
    expect(editor.redo().frames?.[initial.id].page.slots).toHaveLength(2);
  });

  it("adds and removes photo boxes independently of the template", () => {
    const editor = createWorktableEditor(createEmptyWorktable("project" as ProjectId));
    const initial = frame("single");
    editor.execute({ type: "create-frame", frame: initial });
    const manualId = "slot-manual" as FrameSlotId;
    expect(editor.execute({ type: "add-frame-slot", frameId: initial.id, slotId: manualId }).ok).toBe(true);
    expect(editor.snapshot().frames?.[initial.id].page.slots.map((slot) => slot.id)).toEqual([initial.page.slots[0].id, manualId]);
    const changed = frameTemplateSource("diptych");
    expect(editor.execute({ type: "apply-frame-template", frameId: initial.id, template: changed, expectedSlotIds: [initial.page.slots[0].id, manualId] }).ok).toBe(true);
    expect(editor.snapshot().frames?.[initial.id].page.slots).toHaveLength(3);
    expect(editor.snapshot().frames?.[initial.id].page.slots[2].id).toBe(manualId);
    expect(editor.execute({ type: "remove-frame-slot", frameId: initial.id, slotId: manualId }).ok).toBe(true);
    expect(editor.snapshot().frames?.[initial.id].page.slots).toHaveLength(2);
    expect(editor.undo().frames?.[initial.id].page.slots).toHaveLength(3);
  });

  it("switches to a square nine-grid, saves page styling, and brings a photo box forward", () => {
    const editor = createWorktableEditor(createEmptyWorktable("project" as ProjectId));
    const initial = frame("diptych");
    editor.execute({ type: "create-frame", frame: initial });
    expect(editor.execute({ type: "apply-frame-template", frameId: initial.id, template: frameTemplateSource("square-nine-grid"), expectedSlotIds: initial.page.slots.map((slot) => slot.id) }).ok).toBe(true);
    let page = editor.snapshot().frames?.[initial.id].page;
    expect(page?.widthPt).toBe(page?.heightPt);
    expect(page?.slots).toHaveLength(9);
    const first = page!.slots[0].id;
    expect(editor.execute({ type: "bring-frame-slot-to-front", frameId: initial.id, slotId: first }).ok).toBe(true);
    expect(editor.snapshot().frames?.[initial.id].page.slots.at(-1)?.id).toBe(first);
    expect(editor.execute({ type: "set-frame-background", frameId: initial.id, background: "black" }).ok).toBe(true);
    expect(editor.execute({ type: "set-frame-slot-corner-radius", frameId: initial.id, slotId: first, cornerRadiusPt: 12 }).ok).toBe(true);
    expect(editor.execute({ type: "set-frame-bleed", frameId: initial.id, bleedPt: 3 * FRAME_MM_TO_PT }).ok).toBe(true);
    page = editor.snapshot().frames?.[initial.id].page;
    expect(page).toMatchObject({ background: "black", bleedPt: 3 * FRAME_MM_TO_PT });
    expect(page?.slots.at(-1)?.cornerRadiusPt).toBe(12);
    expect(page?.slots[0].cornerRadiusPt).toBeUndefined();
    expect(editor.execute({ type: "resize-frame-page", frameId: initial.id, widthPt: pageWidth, heightPt: pageHeight, reflow: true }).ok).toBe(false);
  });

  it("copies IDs and crop independently and keeps Fill inside the slot", () => {
    const editor = createWorktableEditor(createEmptyWorktable("project" as ProjectId));
    const first = frame("single");
    editor.execute({ type: "create-frame", frame: first });
    editor.execute({ type: "replace-frame-photo", frameId: first.id, slotId: first.page.slots[0].id, photoId: "photo-a" as PhotoId });
    const duplicate = editor.execute({ type: "duplicate-frame", frameId: first.id, copyId: "frame-b" as FrameId, slotIds: ["slot-b" as FrameSlotId] });
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;
    editor.execute({ type: "set-frame-photo-crop", frameId: "frame-b" as FrameId, slotId: "slot-b" as FrameSlotId, crop: { mode: "fill", zoom: 2, focal: { x: .9, y: .2 } } });
    expect(editor.snapshot().frames?.[first.id].page.slots[0].crop.zoom).toBe(1);
    const photo = resolveFramePhoto({ width: 1600, height: 900 }, { width: 200, height: 300 }, { mode: "fill", zoom: 2, focal: { x: .9, y: .2 } });
    expect(photo.x).toBeLessThanOrEqual(0);
    expect(photo.y).toBeLessThanOrEqual(0);
    expect(photo.x + photo.width).toBeGreaterThanOrEqual(200);
    expect(photo.y + photo.height).toBeGreaterThanOrEqual(300);
  });

  it("reflows an orientation change as one undoable edit while retaining photo references", () => {
    const editor = createWorktableEditor(createEmptyWorktable("project" as ProjectId));
    const initial = frame("diptych");
    editor.execute({ type: "create-frame", frame: initial });
    editor.execute({ type: "fill-frame-slots", frameId: initial.id, photoIds: ["photo-a", "photo-b"] as PhotoId[] });
    const before = editor.snapshot();
    const changed = editor.execute({ type: "resize-frame-page", frameId: initial.id, widthPt: pageHeight, heightPt: pageWidth, reflow: true });
    expect(changed.ok).toBe(true);
    const page = editor.snapshot().frames?.[initial.id].page;
    expect(page?.widthPt).toBe(pageHeight);
    expect(page?.slots.map((slot) => slot.photoId)).toEqual(["photo-a", "photo-b"]);
    expect(page?.slots.every((slot) => slot.rect.x + slot.rect.width <= pageHeight && slot.rect.y + slot.rect.height <= pageWidth)).toBe(true);
    expect(editor.undo()).toEqual(before);
  });

  it("does not add history for an unchanged Frame edit", () => {
    const editor = createWorktableEditor(createEmptyWorktable("project" as ProjectId));
    const initial = frame("single");
    editor.execute({ type: "create-frame", frame: initial });
    expect(editor.execute({ type: "move-frame", frameId: initial.id, by: { x: 0, y: 0 } }).ok).toBe(true);
    expect(editor.undo().frameOrder).toEqual([]);
  });
});
