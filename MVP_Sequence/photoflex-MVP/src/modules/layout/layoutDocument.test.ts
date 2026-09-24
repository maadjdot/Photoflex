import { describe, expect, it } from "vitest";
import type { LayoutId, LayoutObjectId, LayoutPageId, PhotoId, ProjectId, SequenceId } from "../../contracts";
import { applyLayoutCommand, createEmptyLayout, isLayoutDocument } from "./layoutDocument";
import { MM_TO_PT } from "../page-layout/pageGeometry";

const initial = () => createEmptyLayout({
  id: "layout" as LayoutId, projectId: "project" as ProjectId, sequenceId: "sequence" as SequenceId,
  pageId: "page-1" as LayoutPageId, name: "Story", createdAt: "2026-09-24T00:00:00.000Z",
});

describe("Layout document commands", () => {
  it("keeps editable pages and photo references while leaving the previous document intact", () => {
    const original = initial();
    const frame = { kind: "image-frame" as const, id: "frame-1" as LayoutObjectId,
      rect: { x: 20, y: 20, width: 200, height: 240 }, photoId: "photo-1" as PhotoId,
      crop: { mode: "fill" as const, zoom: 1.5, focal: { x: .4, y: .6 } } };
    const withFrame = applyLayoutCommand(original, { type: "upsert-object", pageId: original.pages[0].id, object: frame });
    expect(withFrame.ok).toBe(true);
    if (!withFrame.ok) return;
    expect(original.pages[0].objects).toEqual([]);
    const withPage = applyLayoutCommand(withFrame.value, { type: "add-page", page: { id: "page-2" as LayoutPageId, objects: [] } });
    expect(withPage.ok).toBe(true);
    if (!withPage.ok) return;
    expect(withPage.value.pages).toHaveLength(2);
    expect(withPage.value.pages[0].objects[0]).toEqual(frame);
    expect(applyLayoutCommand(withPage.value, { type: "move-page", pageId: "page-2" as LayoutPageId, to: 0 })).toMatchObject({ ok: true, value: { pages: [{ id: "page-2" }, { id: "page-1" }] } });
  });

  it("rejects malformed geometry, duplicate IDs and removing the last page", () => {
    const original = initial();
    expect(applyLayoutCommand(original, { type: "remove-page", pageId: original.pages[0].id })).toMatchObject({ ok: false });
    expect(applyLayoutCommand(original, { type: "add-page", page: { id: original.pages[0].id, objects: [] } })).toMatchObject({ ok: false });
    expect(isLayoutDocument({ ...original, pages: [{ ...original.pages[0], objects: [{ kind: "image-frame", id: "bad", rect: { x: 0, y: 0, width: -1, height: 100 }, photoId: null, crop: { mode: "fit", zoom: 1, focal: { x: .5, y: .5 } } }] }] })).toBe(false);
  });

  it("resizes existing frames with the page while keeping photo crop coordinates", () => {
    const original = initial();
    const frame = { kind: "image-frame" as const, id: "frame" as LayoutObjectId,
      rect: { x: 12 * MM_TO_PT, y: 18 * MM_TO_PT, width: 120 * MM_TO_PT, height: 180 * MM_TO_PT },
      photoId: "photo" as PhotoId, crop: { mode: "fill" as const, zoom: 1.5, focal: { x: .4, y: .6 } } };
    const added = applyLayoutCommand(original, { type: "upsert-object", pageId: original.pages[0].id, object: frame });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const resized = applyLayoutCommand(added.value, { type: "set-page-size", widthPt: 148 * MM_TO_PT, heightPt: 210 * MM_TO_PT });
    expect(resized.ok).toBe(true);
    if (!resized.ok) return;
    const resizedFrame = resized.value.pages[0].objects[0];
    expect(resizedFrame.rect.x).toBeCloseTo(frame.rect.x * 148 / 210);
    expect(resizedFrame.rect.y).toBeCloseTo(frame.rect.y * 210 / 297);
    expect(resizedFrame.rect.width).toBeCloseTo(frame.rect.width * 148 / 210);
    expect(resizedFrame.rect.height).toBeCloseTo(frame.rect.height * 210 / 297);
    if (resizedFrame.kind === "image-frame") expect(resizedFrame.crop).toEqual(frame.crop);
    expect(added.value.pageSpec.widthPt).toBe(210 * MM_TO_PT);
    expect(applyLayoutCommand(added.value, { type: "set-page-size", widthPt: 10, heightPt: 10 }).ok).toBe(false);
  });
});
