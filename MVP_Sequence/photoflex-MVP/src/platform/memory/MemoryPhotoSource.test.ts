import { describe, expect, it } from "vitest";
import type { PhotoId, SourceId } from "../../contracts";
import { MemoryPhotoSource } from "./MemoryPhotoSource";

describe("MemoryPhotoSource", () => {
  it("重复移除来源是幂等操作", async () => {
    const sourceId = "memory-source" as SourceId;
    const photoId = "memory-photo" as PhotoId;
    const source = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Memory", status: "ready", restored: true },
      photos: [{ id: photoId, sourceId, relativePath: "photo.jpg", width: 100, height: 100 }],
    }]);

    expect(await source.removeSource(sourceId)).toEqual({ ok: true, value: { photoIds: [photoId] } });
    expect(await source.removeSource(sourceId)).toEqual({ ok: true, value: { photoIds: [] } });
  });
});
