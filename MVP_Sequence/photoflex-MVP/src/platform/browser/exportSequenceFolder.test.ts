// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ok, type PhotoId, type SequenceDocument, type SequenceItemId, type SourceId } from "../../contracts";
import { exportSequenceFolder } from "./exportSequenceFolder";

afterEach(() => vi.unstubAllGlobals());

describe("exportSequenceFolder", () => {
  it("preserves source filenames, resolves duplicate names, and writes only to the new folder", async () => {
    const parent = new FakeDirectory("Exports");
    vi.stubGlobal("showDirectoryPicker", vi.fn(async () => parent.asHandle()));
    const source = {
      getPhoto: vi.fn(async (photoId: PhotoId) => ok({ id: photoId, sourceId: "source" as SourceId, relativePath: "one.jpg", width: 100, height: 100 })),
      readOriginalFile: vi.fn(async (photoId: PhotoId) => ok(new Blob([photoId], { type: "image/jpeg" }))),
      isExportDirectorySafe: vi.fn(async () => true),
    };
    const sequence = { name: "Selects / June", items: [
      { id: "item-a" as SequenceItemId, kind: "photo" as const, photoId: "photo-a" as PhotoId },
      { id: "item-b" as SequenceItemId, kind: "photo" as const, photoId: "photo-b" as PhotoId },
    ] } satisfies Pick<SequenceDocument, "name" | "items">;

    const result = await exportSequenceFolder(sequence, source);
    const folder = parent.directories.get("Selects _ June");

    expect(result).toMatchObject({ folderName: "Selects _ June", copied: 2, failed: [] });
    expect([...folder?.files.keys() ?? []]).toEqual(["one.jpg", "one (2).jpg"]);
    expect(folder?.files.get("one.jpg")?.size).toBe("photo-a".length);
    expect(folder?.files.get("one (2).jpg")?.size).toBe("photo-b".length);
  });
});

class FakeDirectory {
  readonly directories = new Map<string, FakeDirectory>();
  readonly files = new Map<string, Blob>();

  constructor(readonly name: string) {}

  asHandle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
    const existing = this.directories.get(name);
    if (existing) return existing.asHandle();
    if (!options?.create) throw new DOMException("Directory not found", "NotFoundError");
    const created = new FakeDirectory(name);
    this.directories.set(name, created);
    return created.asHandle();
  }

  async getFileHandle(name: string): Promise<FileSystemFileHandle> {
    const directory = this;
    return {
      kind: "file",
      name,
      async createWritable() {
        return {
          async write(value: Blob) { directory.files.set(name, value); },
          async close() {},
          async abort() {},
        } as unknown as FileSystemWritableFileStream;
      },
    } as unknown as FileSystemFileHandle;
  }
}
