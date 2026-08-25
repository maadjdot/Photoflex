import { describe, expect, it } from "vitest";
import { expandPhotoAssets, type PhotoAsset } from "../src/photoCatalog";

const assets: PhotoAsset[] = [
  { sourceId: "a", name: "a.jpg", url: "blob:a", bytes: 10 },
  { sourceId: "b", name: "b.jpg", url: "blob:b", bytes: 20 },
  { sourceId: "c", name: "c.jpg", url: "blob:c", bytes: 30 },
];

describe("Photo catalog public seam", () => {
  it("creates unique benchmark records while retaining their real source photo", () => {
    const records = expandPhotoAssets(assets, 8);

    expect(records.map((record) => record.recordId)).toEqual([
      "photo-00000", "photo-00001", "photo-00002", "photo-00003",
      "photo-00004", "photo-00005", "photo-00006", "photo-00007",
    ]);
    expect(records.map((record) => record.sourceId)).toEqual(["a", "b", "c", "a", "b", "c", "a", "b"]);
  });

  it("returns no records when no real photos were loaded", () => {
    expect(expandPhotoAssets([], 500)).toEqual([]);
  });
});
