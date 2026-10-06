import { describe, expect, it } from "vitest";
import type { LayoutId, LayoutObjectId, LayoutPageId, PhotoId, PhotoSource, ProjectId, SequenceId } from "../../contracts";
import { createEmptyLayout } from "../../modules/layout/layoutDocument";
import { jpegOrientation, preflightLayoutPdf } from "./exportLayoutPdf";

describe("Layout PDF preflight", () => {
  it("reports exact empty, missing, and low resolution frames without hiding other pages", async () => {
    const base = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId,
      sequenceId: "sequence" as SequenceId, pageId: "one" as LayoutPageId, name: "Photo", createdAt: "2026-09-24" });
    const frame = (id: string, photoId: string | null) => ({ kind: "image-frame" as const, id: id as LayoutObjectId,
      rect: { x: 30, y: 40, width: 200, height: 200 }, photoId: photoId as PhotoId | null,
      crop: { mode: "fill" as const, zoom: 1, focal: { x: .5, y: .5 } } });
    const snapshot = { ...base, pages: [
      { ...base.pages[0], objects: [frame("empty", null), frame("missing", "offline")] },
      { id: "two" as LayoutPageId, objects: [frame("small", "tiny")] },
    ] };
    const source = {
      getPhoto: async (id: PhotoId) => id === "offline" ? { ok: false } : { ok: true, value: { width: 100, height: 100 } },
      readOriginalFile: async (id: PhotoId) => id === "offline" ? { ok: false } : { ok: true, value: new Blob(["x"]) },
    } as unknown as PhotoSource;
    const result = await preflightLayoutPdf(snapshot, source);
    expect(result.blocking).toEqual([
      { page: 1, objectId: "empty", kind: "empty" }, { page: 1, objectId: "missing", kind: "missing" },
    ]);
    expect(result.warnings).toEqual([{ page: 2, objectId: "small", kind: "low-resolution" }]);
  });
});

describe("JPEG export path", () => {
  it("embeds unrotated JPEGs directly and reserves rotated files for browser normalization", () => {
    const exif = (orientation: number) => Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0xff, 0xd9,
    ]);
    expect(jpegOrientation(exif(1))).toBe(1);
    expect(jpegOrientation(exif(6))).toBe(6);
    expect(jpegOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBe(1);
    expect(jpegOrientation(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});
