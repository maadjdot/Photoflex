import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, WorktableDraft, WorktableItemId, WorktablePlacement } from "../../contracts";
import { orderPhotoIdsByTablePosition, orderWorktableItemIdsByTablePosition } from "./spatialOrder";

const photoId = (value: string) => value as PhotoId;

function placement(id: string, x: number, y: number, height = 120): WorktablePlacement {
  return { photoId: photoId(id), x, y, z: 1, width: 160, height, filename: `${id}.jpg` };
}

describe("orderPhotoIdsByTablePosition", () => {
  it("reads selected Table photos left-to-right and then top-to-bottom", () => {
    const draft: WorktableDraft = {
      projectId: "spatial-order-project" as ProjectId,
      entryOrder: [photoId("a"), photoId("b"), photoId("c"), photoId("d")],
      placements: {
        [photoId("a")]: placement("a", 390, 40),
        [photoId("b")]: placement("b", 30, 48),
        [photoId("c")]: placement("c", 410, 280),
        [photoId("d")]: placement("d", 40, 270),
      },
      groups: [], links: [], pileOrder: [], pilePlacements: {},
    };

    expect(orderPhotoIdsByTablePosition(draft, [photoId("a"), photoId("b"), photoId("c"), photoId("d")]))
      .toEqual(["b", "a", "d", "c"]);
  });

  it("keeps left-to-right priority while photo vertical ranges overlap", () => {
    const ids = ["street", "bin", "rail", "car", "leaves", "shed"].map(photoId);
    const draft: WorktableDraft = {
      projectId: "overlap-order-project" as ProjectId,
      entryOrder: ids,
      placements: {
        [ids[0]]: placement("street", 20, 30, 190),
        [ids[1]]: placement("bin", 220, 28, 190),
        [ids[2]]: placement("rail", 450, 76, 145),
        [ids[3]]: placement("car", 680, 42, 190),
        [ids[4]]: placement("leaves", 900, 54, 145),
        [ids[5]]: placement("shed", 1140, 48, 190),
      },
      groups: [], links: [], pileOrder: [], pilePlacements: {},
    };

    expect(orderPhotoIdsByTablePosition(draft, ids)).toEqual(ids);
  });

  it("treats a photo as lower only after its full top clears the upper photo", () => {
    const upper = photoId("upper");
    const lower = photoId("lower");
    const draft: WorktableDraft = {
      projectId: "strict-row-project" as ProjectId,
      entryOrder: [lower, upper],
      placements: {
        [upper]: placement("upper", 500, 20, 100),
        [lower]: placement("lower", 10, 120, 100),
      },
      groups: [], links: [], pileOrder: [], pilePlacements: {},
    };

    expect(orderPhotoIdsByTablePosition(draft, [lower, upper])).toEqual([upper, lower]);
  });

  it("ignores unselected and unknown photos", () => {
    const draft: WorktableDraft = {
      projectId: "spatial-order-project" as ProjectId,
      entryOrder: [photoId("a"), photoId("b")],
      placements: { [photoId("a")]: placement("a", 200, 20), [photoId("b")]: placement("b", 20, 20) },
      groups: [], links: [], pileOrder: [], pilePlacements: {},
    };

    expect(orderPhotoIdsByTablePosition(draft, [photoId("a"), photoId("missing")])).toEqual(["a"]);
  });

  it("preserves distinct Table occurrences of the same source photo", () => {
    const first = "occurrence-a" as WorktableItemId;
    const second = "occurrence-b" as WorktableItemId;
    const source = photoId("same-source");
    const draft: WorktableDraft = {
      projectId: "duplicate-order-project" as ProjectId,
      entryOrder: [first, second],
      placements: {
        [first]: { ...placement("same-source", 300, 20), id: first, photoId: source },
        [second]: { ...placement("same-source", 20, 20), id: second, photoId: source },
      },
      groups: [], links: [], pileOrder: [], pilePlacements: {},
    };

    expect(orderWorktableItemIdsByTablePosition(draft, [first, second])).toEqual([second, first]);
    expect(orderPhotoIdsByTablePosition(draft, [first, second])).toEqual([source, source]);
  });
});
