import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, WorktableDraft } from "../../contracts";
import { visibleWorktablePhotoIds } from "./virtualizer";

const draft: WorktableDraft = {
  projectId: "p" as ProjectId,
  entryOrder: ["near", "far"] as PhotoId[],
  placements: {
    near: { photoId: "near" as PhotoId, x: 0, y: 0, width: 200, height: 150, z: 0, filename: "near.jpg" },
    far: { photoId: "far" as PhotoId, x: 2000, y: 2000, width: 200, height: 150, z: 1, filename: "far.jpg" },
  } as WorktableDraft["placements"],
  pileOrder: [],
  pilePlacements: {},
  links: [],
  groups: [],
};

describe("worktable virtualizer", () => {
  it("keeps only cards in the visible world bounds plus overscan", () => {
    expect([...visibleWorktablePhotoIds(draft, { originX: 0, originY: 0, zoom: 1 }, { width: 800, height: 600 })]).toEqual(["near"]);
    expect([...visibleWorktablePhotoIds(draft, { originX: -1800, originY: -1800, zoom: 1 }, { width: 800, height: 600 })]).toEqual(["far"]);
  });
});
