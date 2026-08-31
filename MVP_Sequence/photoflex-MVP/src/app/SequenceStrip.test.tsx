// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ok, type PhotoId, type PhotoSource, type ProjectId, type SequenceItemId, type WorktableDraft } from "../contracts";
import { SequenceStrip } from "./SequenceStrip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SequenceStrip", () => {
  it("mounts thumbnails only for the horizontal virtual range", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 550, height: 104, right: 550, bottom: 104, x: 0, y: 0, toJSON() {},
    });
    const items = Array.from({ length: 500 }, (_, index) => ({
      id: `item-${index}` as SequenceItemId,
      photoId: `photo-${index}` as PhotoId,
    }));
    const thumbnail = vi.fn(async (photoId: PhotoId) => ok({ url: `thumbnail:${photoId}`, release() {} }));
    const worktable: WorktableDraft = {
      projectId: "project" as ProjectId,
      entryOrder: [],
      placements: {},
      groups: [],
      links: [],
    };

    render(<SequenceStrip
      sequence={{ projectId: worktable.projectId, items }}
      worktable={worktable}
      photoSource={{ thumbnail } as unknown as PhotoSource}
      onPhotoError={() => {}}
      onReorder={() => {}}
      onSelect={() => {}}
    />);

    await waitFor(() => expect(thumbnail).toHaveBeenCalled());
    expect(thumbnail.mock.calls.length).toBeLessThanOrEqual(8);
  });
});
