import {
  err,
  MVP_SEQUENCE_ITEM_LIMIT,
  ok,
  type Result,
  type SequenceDraft,
  type SequenceItemId,
  type SequenceVersion,
  type VersionDiff,
  type VersionValidationError,
  type CreateVersionInput,
  type Versioning,
} from "../../contracts";

export function createVersionSnapshot(input: CreateVersionInput): Result<SequenceVersion, VersionValidationError> {
  const name = input.name.trim();
  if (!name) return err({ kind: "empty-name" });
  if (!input.items.length) return err({ kind: "empty-sequence" });
  if (input.items.length > MVP_SEQUENCE_ITEM_LIMIT) return err({ kind: "sequence-limit-exceeded", limit: MVP_SEQUENCE_ITEM_LIMIT, actual: input.items.length });
  const seen = new Set<SequenceItemId>();
  for (const item of input.items) {
    if (seen.has(item.id)) return err({ kind: "duplicate-item", itemId: item.id });
    seen.add(item.id);
  }
  const ids = new Set(input.items.map((item) => item.id));
  if (!input.readingUnits.length && input.items.length) return err({ kind: "empty-sequence" });
  const occupied = new Set<SequenceItemId>();
  for (const unit of input.readingUnits) {
    const members = unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId];
    if (!members.every((id) => ids.has(id)) || members.some((id) => occupied.has(id))) return err({ kind: "empty-sequence" });
    members.forEach((id) => occupied.add(id));
  }
  if (occupied.size !== input.items.length) return err({ kind: "empty-sequence" });
  const segmentOccupied = new Set<SequenceItemId>();
  for (const segment of input.segments) {
    if (!segment.name.trim() || !segment.itemIds.length || segment.itemIds.some((id) => !ids.has(id) || segmentOccupied.has(id))) return err({ kind: "empty-sequence" });
    const indices = segment.itemIds.map((id) => input.items.findIndex((item) => item.id === id)).sort((a, b) => a - b);
    if (indices.some((index, position) => position > 0 && index !== indices[position - 1] + 1)) return err({ kind: "empty-sequence" });
    if (input.readingUnits.some((unit) => { const members = unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId]; return members.some((id) => segment.itemIds.includes(id)) && !members.every((id) => segment.itemIds.includes(id)); })) return err({ kind: "empty-sequence" });
    segment.itemIds.forEach((id) => segmentOccupied.add(id));
  }
  return ok({
    id: input.id, projectId: input.projectId, sequenceId: input.sequenceId,
    parentVersionId: input.parentVersionId, name, memo: input.memo,
    itemCount: input.items.length,
    items: input.items.map((item) => ({ ...item })),
    segments: input.segments.map((segment) => ({ ...segment, itemIds: [...segment.itemIds] })),
    readingUnits: input.readingUnits.map((unit) => ({ ...unit })),
    createdAt: input.createdAt, updatedAt: input.updatedAt ?? input.createdAt,
  });
}

export function openVersionAsDraft(version: SequenceVersion): SequenceDraft {
  return {
    projectId: version.projectId, baseVersionId: version.id,
    items: version.items.map((item) => ({ ...item })),
    segments: version.segments.map((segment) => ({ ...segment, itemIds: [...segment.itemIds] })),
    readingUnits: version.readingUnits.map((unit) => ({ ...unit })),
  };
}

export function compareVersions(left: SequenceVersion, right: SequenceVersion): Result<VersionDiff, { readonly kind: "different-projects" }> {
  if (left.projectId !== right.projectId) return err({ kind: "different-projects" });
  const leftIds = left.items.map((item) => item.id), rightIds = right.items.map((item) => item.id);
  const leftSet = new Set(leftIds), rightSet = new Set(rightIds);
  const added = rightIds.filter((id) => !leftSet.has(id));
  const removed = leftIds.filter((id) => !rightSet.has(id));
  const leftShared = leftIds.filter((id) => rightSet.has(id));
  const rightShared = rightIds.filter((id) => leftSet.has(id));
  const leftPositions = new Map(leftIds.map((id, index) => [id, index]));
  const rightPositions = new Map(rightIds.map((id, index) => [id, index]));
  const leftSharedPositions = new Map(leftShared.map((id, index) => [id, index]));
  const moved = rightShared.flatMap((itemId, to) => {
    const sharedFrom = leftSharedPositions.get(itemId);
    if (sharedFrom === to) return [];
    return [{ itemId, from: leftPositions.get(itemId)!, to: rightPositions.get(itemId)! }];
  });
  const readingUnitChanged = changedItemsByUnit(left, right), segmentChanged = changedItemsBySegment(left, right);
  return ok({ leftVersionId: left.id, rightVersionId: right.id, added, removed, moved, readingUnitChanged, segmentChanged });
}

function changedItemsByUnit(left: SequenceVersion, right: SequenceVersion): SequenceItemId[] {
  const index = (version: SequenceVersion) => {
    const map = new Map<SequenceItemId, string>();
    for (const unit of version.readingUnits) {
      const members = unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId];
      members.forEach((id) => map.set(id, unit.kind + ":" + members.join(",")));
    }
    return map;
  };
  const a = index(left), b = index(right);
  return [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id) !== b.get(id));
}

function changedItemsBySegment(left: SequenceVersion, right: SequenceVersion): SequenceItemId[] {
  const index = (version: SequenceVersion) => {
    const map = new Map<SequenceItemId, string>();
    version.segments.forEach((segment, index) => segment.itemIds.forEach((id) => map.set(id, index + ":" + segment.id + ":" + segment.name)));
    return map;
  };
  const a = index(left), b = index(right);
  return [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id) !== b.get(id));
}

export const createSnapshot = createVersionSnapshot;

export function createVersioning(): Versioning {
  return {
    createSnapshot: createVersionSnapshot,
    openAsDraft: openVersionAsDraft,
    compare: compareVersions,
  };
}
