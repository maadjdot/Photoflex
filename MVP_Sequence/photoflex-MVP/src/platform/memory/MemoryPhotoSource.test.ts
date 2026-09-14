import { describe, expect, it } from "vitest";
import type { PhotoId, SourceId } from "../../contracts";
import { MemoryPhotoSource } from "./MemoryPhotoSource";

describe("MemoryPhotoSource", () => {
  it("deduplicates an external original while reporting unsupported drops", async () => {
    const source = new MemoryPhotoSource();
    const sourceId = "external-source" as SourceId;
    const handle = {
      kind: "file" as const,
      name: "outside.jpg",
      async getFile() { return new File(["photo"], "outside.jpg", { type: "image/jpeg" }); },
      async isSameEntry(other: FileSystemHandle) { return other === handle; },
    } as unknown as FileSystemFileHandle;
    const folder = { kind: "directory" as const, name: "ignored" } as FileSystemDirectoryHandle;

    const first = await source.ingestDroppedFiles([handle, folder], [], sourceId);
    const second = await source.ingestDroppedFiles([handle], [], sourceId);

    expect(first.ok && first.value.items[0].status).toBe("created");
    expect(first.ok && first.value.skipped).toEqual([{ kind: "unsupported-file", relativePath: "ignored" }]);
    expect(second.ok && second.value.items[0].status).toBe("reused");
    expect(first.ok && second.ok && first.value.items[0].photo.id).toBe(second.ok ? second.value.items[0].photo.id : undefined);
  });

  it("does not merge different external handles with identical file metadata", async () => {
    const source = new MemoryPhotoSource();
    const sourceId = "external-source" as SourceId;
    const makeHandle = (identity: string) => ({
      kind: "file" as const,
      name: "same.jpg",
      identity,
      async getFile() { return new File(["same"], "same.jpg", { type: "image/jpeg", lastModified: 42 }); },
      async isSameEntry(other: FileSystemHandle) {
        return (other as FileSystemHandle & { identity?: string }).identity === identity;
      },
    } as unknown as FileSystemFileHandle);

    const result = await source.ingestDroppedFiles([makeHandle("one"), makeHandle("two")], [], sourceId);

    expect(result.ok && result.value.items.map((item) => item.status)).toEqual(["created", "created"]);
    expect(result.ok && new Set(result.value.items.map((item) => item.photo.id)).size).toBe(2);
  });

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
