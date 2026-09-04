import { describe, expect, it } from "vitest";
import type { PhotoId, ProjectId, ReadingUnitId, SequenceId, SequenceItemId, VersionId } from "../../contracts";
import { compareVersions, createVersionSnapshot, openVersionAsDraft } from "./versioning";

const make = (ids: string[], versionId: string) => {
  const items = ids.map((id) => ({ id: id as SequenceItemId, kind: "photo" as const, photoId: `photo-${id}` as PhotoId }));
  return createVersionSnapshot({ id: versionId as VersionId, projectId: "p" as ProjectId, sequenceId: "s" as SequenceId, name: versionId, items, segments: [], readingUnits: items.map((item) => ({ id: `u-${item.id}` as ReadingUnitId, kind: "single" as const, itemId: item.id })), createdAt: "2026-01-01T00:00:00.000Z" });
};

describe("versioning", () => {
  it("clones snapshots and opens an editable draft", () => {
    const result = make(["a", "b"], "v1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const draft = openVersionAsDraft(result.value);
    expect(draft.baseVersionId).toBe(result.value.id);
    expect(draft.items).not.toBe(result.value.items);
  });

  it("compares by SequenceItemId, preserving duplicate photos", () => {
    const left = make(["a", "b"], "left");
    const right = make(["b", "a", "c"], "right");
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    const diff = compareVersions(left.value, right.value);
    expect(diff.ok && diff.value.added).toEqual(["c"]);
    expect(diff.ok && diff.value.moved.map((item) => item.itemId)).toEqual(["b", "a"]);
  });

  it("does not mark unchanged relative order as moved after insertion", () => {
    const left = make(["a", "b", "c"], "left");
    const right = make(["x", "a", "b", "c"], "right");
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    const diff = compareVersions(left.value, right.value);
    expect(diff.ok && diff.value.moved).toEqual([]);
  });
});
