import { describe, expect, it } from "vitest";
import type { LayoutDocument, LayoutEditCommand, LayoutId, LayoutObjectId, LayoutPage, LayoutPageId, PhotoId, ProjectId, SequenceId } from "../../contracts";
import { applyLayoutCommand, createEmptyLayout, isLayoutDocument } from "./layoutDocument";
import { DEFAULT_LAYOUT_PAPER, resolveLayoutPaper } from "./layoutPaper";
import { MM_TO_PT } from "../page-layout/pageGeometry";

const initial = () => createEmptyLayout({
  id: "layout" as LayoutId, projectId: "project" as ProjectId, sequenceId: "sequence" as SequenceId,
  pageId: "page-1" as LayoutPageId, name: "Story", createdAt: "2026-09-24T00:00:00.000Z",
});

describe("Layout document commands", () => {
  it("saves photo effects on selected pages and accepts legacy defaults", () => {
    const original = initial();
    const innerEdge = { mode: "bevel" as const, color: "#F1EDE1", widthPt: 3 * MM_TO_PT };
    const edited = applyLayoutCommand(original, { type: "set-photo-appearance", pageIds: [original.pages[0].id], innerEdge, photoElevationPt: 5 * MM_TO_PT });
    expect(edited).toMatchObject({ ok: true, value: { pages: [{ innerEdge, photoElevationPt: 5 * MM_TO_PT }] } });
    expect(original.pages[0].innerEdge).toBeUndefined();
    expect(isLayoutDocument(original)).toBe(true);
    expect(applyLayoutCommand(original, { type: "set-photo-appearance", pageIds: [original.pages[0].id], innerEdge, photoElevationPt: -1 }).ok).toBe(false);
    expect(isLayoutDocument({ ...original, pages: [{ ...original.pages[0], innerEdge: { ...innerEdge, color: "bad" } }] })).toBe(false);
  });

  it("adds explicit covers at book boundaries and keeps them out of body reordering", () => {
    const original = initial();
    const front = applyLayoutCommand(original, { type: "add-page", at: 0, page: { id: "front" as LayoutPageId, kind: "cover", objects: [] } });
    if (!front.ok) throw Error("cover rejected");
    const back = applyLayoutCommand(front.value, { type: "add-page", page: { id: "back" as LayoutPageId, kind: "back-cover", objects: [] } });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.pages.map((page) => page.kind)).toEqual(["cover", undefined, "back-cover"]);
    expect(applyLayoutCommand(back.value, { type: "move-page", pageId: "back" as LayoutPageId, to: 1 }).ok).toBe(false);
  });
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

  it("keeps legacy pages white and applies one paper command to one or many pages", () => {
    const original = initial();
    const second: LayoutPage = { id: "page-2" as LayoutPageId, objects: [] };
    const legacy: LayoutDocument = { ...original, pages: [original.pages[0], second] };
    expect(isLayoutDocument(legacy)).toBe(true);
    expect(resolveLayoutPaper(legacy.pages[0])).toEqual(DEFAULT_LAYOUT_PAPER);
    const paper = { color: "#1E2B45", material: "fine-linen" as const };
    const changed = applyLayoutCommand(legacy, { type: "set-paper", pageIds: legacy.pages.map((page) => page.id), paper });
    expect(changed).toMatchObject({ ok: true, value: { pages: [{ paper }, { paper }] } });
    expect(legacy.pages[0].paper).toBeUndefined();
    expect(applyLayoutCommand(legacy, { type: "set-paper", pageIds: ["missing" as LayoutPageId], paper }).ok).toBe(false);
    expect(applyLayoutCommand(legacy, { type: "set-paper", pageIds: [legacy.pages[0].id],
      paper: { color: "red", material: "unknown" } } as unknown as LayoutEditCommand).ok).toBe(false);
  });

  it("accepts the supported Layout fonts and rejects unknown font identifiers", () => {
    const original = initial();
    const text = { kind: "text-box", id: "text" as LayoutObjectId, rect: { x: 20, y: 20, width: 200, height: 80 }, text: "上海 Album",
      style: { fontFamily: "architects-daughter", fontWeight: "bold", fontStyle: "italic", fontSizePt: 12, lineHeight: 1.2, color: "#171513", align: "left" } };
    expect(isLayoutDocument({ ...original, pages: [{ ...original.pages[0], objects: [text] }] })).toBe(true);
    expect(isLayoutDocument({ ...original, pages: [{ ...original.pages[0], objects: [
      { ...text, style: { ...text.style, fontFamily: "not-installed" } },
    ] }] })).toBe(false);
    expect(isLayoutDocument({ ...original, pages: [{ ...original.pages[0], objects: [
      { ...text, style: { ...text.style, fontWeight: "heavy" } },
    ] }] })).toBe(false);
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

  it("saves objects across a facing pair and moves a selection in one command", () => {
    const base = initial();
    const blank = (id: string) => ({ id: id as LayoutPageId, objects: [] });
    const pages = [base.pages[0], blank("left"), blank("right")];
    const frame = { kind: "image-frame" as const, id: "wide" as LayoutObjectId,
      rect: { x: base.pageSpec.widthPt - 40, y: 30, width: 200, height: 100 }, photoId: "photo" as PhotoId,
      crop: { mode: "fit" as const, zoom: 1, focal: { x: .5, y: .5 } } };
    const text = { kind: "text-box" as const, id: "caption" as LayoutObjectId,
      rect: { x: -40, y: 160, width: 180, height: 60 }, text: "Across the gutter",
      style: { fontFamily: "noto-sans-sc" as const, fontSizePt: 12, lineHeight: 1.2, color: "#171513", align: "left" as const } };
    const result = applyLayoutCommand({ ...base, pages }, { type: "upsert-objects", updates: [
      { pageId: pages[1].id, object: frame }, { pageId: pages[2].id, object: text },
    ] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pages[1].objects).toEqual([frame]);
    expect(result.value.pages[2].objects).toEqual([text]);
    const shifted = applyLayoutCommand(result.value, { type: "upsert-object", pageId: pages[1].id,
      object: { ...frame, rect: { ...frame.rect, x: base.pageSpec.widthPt + 20 } } });
    expect(shifted.ok).toBe(true);
    if (!shifted.ok) return;
    const resized = applyLayoutCommand(shifted.value, { type: "set-page-size", widthPt: 148 * MM_TO_PT, heightPt: 210 * MM_TO_PT });
    expect(resized.ok).toBe(true);
    if (resized.ok) expect(resized.value.pages[1].objects[0].rect.x).toBeCloseTo((base.pageSpec.widthPt + 20) * 148 / 210);
    expect(applyLayoutCommand(result.value, { type: "remove-objects", objectIds: [frame.id, text.id] }))
      .toMatchObject({ ok: true, value: { pages: [{}, { objects: [] }, { objects: [] }] } });
  });
});
