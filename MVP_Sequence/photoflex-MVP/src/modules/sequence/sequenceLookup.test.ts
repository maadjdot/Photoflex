import { expect, it } from "vitest";
import type { ProjectId, ReadingUnitId, SequenceDocument, SequenceItemId, SequenceSegmentId, VersionId } from "../../contracts";
import { createSequenceLookup } from "./sequenceLookup";

it("indexes items, segments and Reading Units in one sequence pass", () => {
  const firstId = "lookup-first" as SequenceItemId;
  const secondId = "lookup-second" as SequenceItemId;
  const blankId = "lookup-blank" as SequenceItemId;
  const segmentId = "lookup-segment" as SequenceSegmentId;
  const spreadId = "lookup-spread" as ReadingUnitId;
  const blankUnitId = "lookup-blank-unit" as ReadingUnitId;
  const sequence: SequenceDocument = {
    id: "lookup-sequence" as SequenceDocument["id"],
    projectId: "lookup-project" as ProjectId,
    name: "Lookup",
    items: [{ id: firstId, kind: "blank" }, { id: secondId, kind: "blank" }, { id: blankId, kind: "blank" }],
    segments: [{ id: segmentId, name: "Opening", itemIds: [firstId, secondId] }],
    readingUnits: [{ id: spreadId, kind: "spread", leftItemId: firstId, rightItemId: secondId }, { id: blankUnitId, kind: "blank", itemId: blankId }],
    currentVersionId: "lookup-version" as VersionId,
    revision: 0 as SequenceDocument["revision"],
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };

  const lookup = createSequenceLookup(sequence);

  expect(lookup.itemIndexById.get(secondId)).toBe(1);
  expect(lookup.segmentByItemId.get(secondId)?.id).toBe(segmentId);
  expect(lookup.unitByItemId.get(firstId)?.id).toBe(spreadId);
  expect(lookup.unitByItemId.get(secondId)?.id).toBe(spreadId);
  expect(lookup.unitIndexByItemId.get(blankId)).toBe(1);
});
