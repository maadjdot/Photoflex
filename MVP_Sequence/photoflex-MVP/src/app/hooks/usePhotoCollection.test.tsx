// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { err, ok, type PhotoSource, type SourceId } from "../../contracts";
import { usePhotoCollection } from "./usePhotoCollection";

describe("usePhotoCollection", () => {
  it("空页代表已到底，不会因 indexedCount 较大而重复查询", async () => {
    const listPhotos = vi.fn(async () => ok({ items: [], nextCursor: null, issues: [] }));
    const photoSource = {
      listPhotos,
      chooseFolder: async () => err({ kind: "cancelled" as const }),
      restoreFolder: async (sourceId: SourceId) => err({ kind: "source-not-found" as const, sourceId }),
      removeSource: async (sourceId: SourceId) => err({ kind: "source-not-found" as const, sourceId }),
      scan: async function* () {},
      getSourceState: async (sourceId: SourceId) => err({ kind: "source-not-found" as const, sourceId }),
      getPhoto: async (photoId) => err({ kind: "photo-not-found" as const, photoId }),
      thumbnail: async (photoId) => err({ kind: "photo-not-found" as const, photoId }),
      preview: async (photoId) => err({ kind: "photo-not-found" as const, photoId }),
    } satisfies PhotoSource;

    renderHook(() => usePhotoCollection(photoSource, "source-1" as SourceId, 10));
    await waitFor(() => expect(listPhotos).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listPhotos).toHaveBeenCalledTimes(1);
  });
});
