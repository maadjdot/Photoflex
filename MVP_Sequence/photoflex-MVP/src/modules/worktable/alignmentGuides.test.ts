import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, WorktableDraft, WorktableItemId, WorktablePlacement } from "../../contracts";
import { calculateAlignmentPreview } from "./alignmentGuides";

const projectId = "alignment-project" as ProjectId;

function placement(id: string, x: number, y: number, width = 100, height = 100): WorktablePlacement {
  return { id: id as WorktableItemId, photoId: id as PhotoId, x, y, z: 1, width, height, filename: `${id}.jpg` };
}

function draft(items: readonly WorktablePlacement[]): WorktableDraft {
  return {
    projectId,
    entryOrder: items.map((item) => item.id!),
    placements: Object.fromEntries(items.map((item) => [item.id, item])) as WorktableDraft["placements"],
    groups: [],
    links: [],
    pileOrder: [],
    pilePlacements: {},
  };
}

describe("calculateAlignmentPreview", () => {
  it("snaps left, center and right edges on the x axis", () => {
    const reference = placement("reference", 300, 300);
    const moving = placement("moving", 100, 100, 80, 80);
    expect(calculateAlignmentPreview({ draft: draft([moving, reference]), movingIds: [moving.id!], delta: { x: 198, y: 0 }, zoom: 1 }).delta.x).toBe(200);
    expect(calculateAlignmentPreview({ draft: draft([moving, reference]), movingIds: [moving.id!], delta: { x: 208, y: 0 }, zoom: 1 }).delta.x).toBe(210);
    expect(calculateAlignmentPreview({ draft: draft([moving, reference]), movingIds: [moving.id!], delta: { x: 218, y: 0 }, zoom: 1 }).delta.x).toBe(220);
  });

  it("snaps top, center and bottom edges on the y axis", () => {
    const reference = placement("reference", 300, 300);
    const moving = placement("moving", 100, 100, 80, 80);
    expect(calculateAlignmentPreview({ draft: draft([moving, reference]), movingIds: [moving.id!], delta: { x: 0, y: 198 }, zoom: 1 }).delta.y).toBe(200);
    expect(calculateAlignmentPreview({ draft: draft([moving, reference]), movingIds: [moving.id!], delta: { x: 0, y: 208 }, zoom: 1 }).delta.y).toBe(210);
    expect(calculateAlignmentPreview({ draft: draft([moving, reference]), movingIds: [moving.id!], delta: { x: 0, y: 218 }, zoom: 1 }).delta.y).toBe(220);
  });

  it("snaps equal horizontal and vertical spacing when alignment is not closer", () => {
    const left = placement("left", 0, 0);
    const right = placement("right", 300, 0);
    const moving = placement("moving", 146, 0);
    const horizontal = calculateAlignmentPreview({ draft: draft([left, right, moving]), movingIds: [moving.id!], delta: { x: 0, y: 0 }, zoom: 1 });
    expect(horizontal.delta.x).toBe(4);
    expect(horizontal.guides.some((guide) => guide.kind === "spacing" && guide.axis === "x" && guide.distance === 50)).toBe(true);

    const top = placement("top", 0, 0);
    const bottom = placement("bottom", 0, 300);
    const verticalMoving = placement("vertical-moving", 0, 146);
    const vertical = calculateAlignmentPreview({ draft: draft([top, bottom, verticalMoving]), movingIds: [verticalMoving.id!], delta: { x: 0, y: 0 }, zoom: 1 });
    expect(vertical.delta.y).toBe(4);
    expect(vertical.guides.some((guide) => guide.kind === "spacing" && guide.axis === "y" && guide.distance === 50)).toBe(true);
  });

  it("respects the screen-space threshold, excludes moving photos, and uses a multi-photo bounds", () => {
    const reference = placement("reference", 300, 0);
    const moving = placement("moving", 100, 0);
    const far = calculateAlignmentPreview({ draft: draft([moving, reference]), movingIds: [moving.id!], delta: { x: 150, y: 0 }, zoom: 2 });
    expect(far.delta.x).toBe(150);

    const multiMoving = placement("multi-moving", 100, 0, 80, 80);
    const second = placement("second", 200, 0, 50, 50);
    const movingDraft = draft([multiMoving, second, reference]);
    const multi = calculateAlignmentPreview({ draft: movingDraft, movingIds: [multiMoving.id!, second.id!], delta: { x: 148, y: 0 }, zoom: 1 });
    expect(multi.delta.x).toBe(150);
    expect(multi.guides.some((guide) => guide.kind === "alignment" && guide.value === 400)).toBe(true);
  });
});
