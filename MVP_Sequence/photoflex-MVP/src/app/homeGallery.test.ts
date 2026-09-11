import { describe, expect, it } from "vitest";
import type { PhotoId } from "../contracts";
import { createHomeGallery } from "./homeGallery";

const photos = Array.from({ length: 30 }, (_, index) => `photo-${index}` as PhotoId);

describe("Home photo composition", () => {
  it("samples Table photos without duplicates and gives each row its own sparse layout", () => {
    const rows = createHomeGallery(photos, () => .25);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.length >= 3 && row.length <= 6)).toBe(true);
    expect(new Set(rows.map((row) => row.map((photo) => photo.column).join(","))).size).toBe(3);
    expect(new Set(rows.flat().map((photo) => photo.photoId)).size).toBe(15);
    for (const row of rows) {
      expect(new Set(row.map((photo) => photo.column)).size).toBe(row.length);
      for (const photo of row) {
        expect(photos).toContain(photo.photoId);
        expect(photo.column).toBeGreaterThanOrEqual(1);
        expect(photo.column).toBeLessThanOrEqual(7);
      }
    }
  });

  it("resamples both photos and positions with fresh randomness", () => {
    const first = createHomeGallery(photos, () => .1);
    const next = createHomeGallery(photos, () => .8);
    expect(first.flat().map((photo) => photo.photoId)).not.toEqual(next.flat().map((photo) => photo.photoId));
    expect(first.map((row) => row.map((photo) => photo.column))).not.toEqual(next.map((row) => row.map((photo) => photo.column)));
  });

  it.each(Array.from({ length: 16 }, (_, index) => index))("fits a Table with %i photos without inventing or repeating photos", (count) => {
    const rows = createHomeGallery(photos.slice(0, count), () => .5);
    expect(rows.flat().length).toBeGreaterThanOrEqual(Math.min(count, 9));
    expect(rows.flat().length).toBeLessThanOrEqual(count);
    expect(new Set(rows.flat().map((photo) => photo.photoId)).size).toBe(rows.flat().length);
    expect(new Set(rows.map((row) => row.map((photo) => photo.column).join(","))).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.length).toBeGreaterThanOrEqual(Math.min(count, 3));
      expect(row.length).toBeLessThanOrEqual(6);
    }
  });
});
