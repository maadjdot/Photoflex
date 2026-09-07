import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceItemId, SequenceSegmentId, VersionId } from "../../contracts";
import { createInitialSequenceBundle } from "./sequenceFactory";

const projectId = "factory-project" as ProjectId;
const firstPhotoId = "factory-photo-a" as PhotoId;
const secondPhotoId = "factory-photo-b" as PhotoId;

describe("createInitialSequenceBundle", () => {
  it("creates a Sequence and matching initial Version from ordered photos", () => {
    const bundle = createInitialSequenceBundle({
      projectId,
      name: "First edit",
      content: { kind: "photos", photoIds: [firstPhotoId, secondPhotoId] },
    });

    expect(bundle.sequence.items.map((item) => item.kind === "photo" ? item.photoId : undefined)).toEqual([firstPhotoId, secondPhotoId]);
    expect(bundle.sequence.readingUnits).toHaveLength(2);
    expect(bundle.sequence.readingUnits.every((unit) => unit.kind === "single")).toBe(true);
    expect(bundle.initialVersion).toMatchObject({
      id: bundle.sequence.currentVersionId,
      projectId,
      sequenceId: bundle.sequence.id,
      name: "Initial · First edit",
      items: bundle.sequence.items,
      readingUnits: bundle.sequence.readingUnits,
    });
  });

  it("copies structure with fresh IDs while preserving photos and relationships", () => {
    const firstItemId = "old-item-a" as SequenceItemId;
    const secondItemId = "old-item-b" as SequenceItemId;
    const source: SequenceDocument = {
      id: "old-sequence" as SequenceDocument["id"],
      projectId,
      name: "Source",
      items: [
        { id: firstItemId, kind: "photo", photoId: firstPhotoId },
        { id: secondItemId, kind: "photo", photoId: secondPhotoId },
      ],
      readingUnits: [{ id: "old-unit" as ReadingUnitId, kind: "spread", leftItemId: firstItemId, rightItemId: secondItemId }],
      segments: [{ id: "old-segment" as SequenceSegmentId, name: "Opening", itemIds: [firstItemId, secondItemId] }],
      currentVersionId: "old-version" as VersionId,
      revision: 4 as SequenceDocument["revision"],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    };

    const bundle = createInitialSequenceBundle({ projectId, name: "Copy", content: { kind: "sequence", sequence: source } });
    const itemIds = bundle.sequence.items.map((item) => item.id);
    const spread = bundle.sequence.readingUnits[0];

    expect(bundle.sequence.id).not.toBe(source.id);
    expect(bundle.sequence.currentVersionId).not.toBe(source.currentVersionId);
    expect(itemIds).not.toEqual([firstItemId, secondItemId]);
    expect(bundle.sequence.items.map((item) => item.kind === "photo" ? item.photoId : undefined)).toEqual([firstPhotoId, secondPhotoId]);
    expect(spread.kind === "spread" && [spread.leftItemId, spread.rightItemId]).toEqual(itemIds);
    expect(bundle.sequence.segments[0].itemIds).toEqual(itemIds);
    expect(bundle.initialVersion.items).toEqual(bundle.sequence.items);
    expect(bundle.initialVersion.readingUnits).toEqual(bundle.sequence.readingUnits);
    expect(bundle.initialVersion.segments).toEqual(bundle.sequence.segments);
  });
});
