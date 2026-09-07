import type { ReadingUnit, SequenceDocument, SequenceItem, SequenceItemId, SequenceSegment } from "../../contracts";

export interface SequenceLookup {
  readonly itemById: ReadonlyMap<SequenceItemId, SequenceItem>;
  readonly itemIndexById: ReadonlyMap<SequenceItemId, number>;
  readonly segmentByItemId: ReadonlyMap<SequenceItemId, SequenceSegment>;
  readonly unitByItemId: ReadonlyMap<SequenceItemId, ReadingUnit>;
  readonly unitIndexByItemId: ReadonlyMap<SequenceItemId, number>;
}

/** Builds the read-only lookup tables shared by Sequence rendering paths. */
export function createSequenceLookup(sequence: Pick<SequenceDocument, "items" | "segments" | "readingUnits">): SequenceLookup {
  const itemById = new Map<SequenceItemId, SequenceItem>();
  const itemIndexById = new Map<SequenceItemId, number>();
  const segmentByItemId = new Map<SequenceItemId, SequenceSegment>();
  const unitByItemId = new Map<SequenceItemId, ReadingUnit>();
  const unitIndexByItemId = new Map<SequenceItemId, number>();
  sequence.items.forEach((item, index) => {
    itemById.set(item.id, item);
    itemIndexById.set(item.id, index);
  });
  sequence.segments.forEach((segment) => segment.itemIds.forEach((itemId) => segmentByItemId.set(itemId, segment)));
  sequence.readingUnits.forEach((unit, index) => unitItemIds(unit).forEach((itemId) => {
    unitByItemId.set(itemId, unit);
    unitIndexByItemId.set(itemId, index);
  }));
  return { itemById, itemIndexById, segmentByItemId, unitByItemId, unitIndexByItemId };
}

function unitItemIds(unit: ReadingUnit): readonly SequenceItemId[] {
  return unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId];
}
