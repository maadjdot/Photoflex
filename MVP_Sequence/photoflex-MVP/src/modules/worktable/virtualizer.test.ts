import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, WorktableDraft } from "../../contracts";
import { visibleWorktablePhotoIds } from "./virtualizer";

const near = "near" as PhotoId;
const buffered = "buffered" as PhotoId;
const far = "far" as PhotoId;
const draft: WorktableDraft = {
  projectId: "project" as ProjectId,
  entryOrder: [near, buffered, far],
  placements: {
    [near]: { photoId: near, filename: "near.jpg", x: 20, y: 30, width: 200, height: 150, z: 0 },
    [buffered]: { photoId: buffered, filename: "buffered.jpg", x: 610, y: 30, width: 200, height: 150, z: 1 },
    [far]: { photoId: far, filename: "far.jpg", x: 1000, y: 30, width: 200, height: 150, z: 2 },
  },
  groups: [],
  links: [],
};

describe("visibleWorktablePhotoIds", () => {
  it("includes the viewport and screen-pixel overscan without mounting distant photos", () => {
    const visible = visibleWorktablePhotoIds(
      draft,
      { originX: 0, originY: 0, zoom: 1 },
      { width: 500, height: 400 },
      192,
    );
    expect([...visible]).toEqual([near, buffered]);
  });

  it("converts the viewport through pan and zoom", () => {
    const visible = visibleWorktablePhotoIds(
      draft,
      { originX: -1800, originY: 0, zoom: 2 },
      { width: 500, height: 400 },
      0,
    );
    expect([...visible]).toEqual([far]);
  });

  it("mounts nothing while the stage size is still zero", () => {
    expect([...visibleWorktablePhotoIds(draft, { originX: 0, originY: 0, zoom: 1 }, { width: 0, height: 0 })]).toEqual([]);
  });
});
