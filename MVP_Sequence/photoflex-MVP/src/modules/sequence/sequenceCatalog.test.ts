import type { PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, SequenceRevision, VersionId } from "../../contracts";
import { describe, expect, it } from "vitest";
import { compareSequences, toSequenceSummary } from "./sequenceCatalog";

const projectId = "project" as ProjectId;
const document = (id: string, photos: string[]): SequenceDocument => ({
  id: id as SequenceId,
  projectId,
  name: id,
  items: photos.map((photoId) => ({ id: `${id}-${photoId}` as SequenceItemId, kind: "photo", photoId: photoId as PhotoId })),
  segments: [],
  readingUnits: photos.map((photoId) => ({ id: `unit-${id}-${photoId}` as ReadingUnitId, kind: "single", itemId: `${id}-${photoId}` as SequenceItemId })),
  currentVersionId: `version-${id}` as VersionId,
  revision: 0 as SequenceRevision,
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
});

describe("Sequence catalog", () => {
  it("keeps pile summaries small", () => {
    const summary = toSequenceSummary(document("a", ["1", "2", "3", "4", "5", "6", "7"]));
    expect(summary.itemCount).toBe(7);
    expect(summary.previewPhotoIds).toHaveLength(6);
  });

  it("compares independent sequences by photo identity", () => {
    const diff = compareSequences(document("a", ["1", "2", "3"]), document("b", ["2", "1", "4"]));
    expect(diff.leftOnly).toEqual(["3"]);
    expect(diff.rightOnly).toEqual(["4"]);
    expect(diff.shared.map((item) => [item.photoId, item.leftIndex, item.rightIndex])).toEqual([["1", 0, 1], ["2", 1, 0]]);
  });
});
