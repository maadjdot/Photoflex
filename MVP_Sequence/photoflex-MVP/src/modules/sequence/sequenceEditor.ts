import {
  err,
  MVP_SEQUENCE_ITEM_LIMIT,
  ok,
  type ReadingUnit,
  type ReadingUnitId,
  type Result,
  type SequenceCommandError,
  type SequenceDraft,
  type SequenceEditCommand,
  type SequenceEditor,
  type SequenceItem,
  type SequenceItemId,
  type SequenceSegment,
} from "../../contracts";

export function createSequenceEditor(initial: SequenceDraft): SequenceEditor {
  return new Editor(normalize(initial));
}

class Editor implements SequenceEditor {
  private current: SequenceDraft;
  private readonly undoStack: SequenceDraft[] = [];
  private readonly redoStack: SequenceDraft[] = [];

  constructor(initial: SequenceDraft) { this.current = copy(initial); }
  snapshot(): SequenceDraft { return copy(this.current); }
  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  undo(): SequenceDraft {
    const previous = this.undoStack.pop();
    if (!previous) return this.snapshot();
    this.redoStack.push(this.current);
    this.current = previous;
    return this.snapshot();
  }
  redo(): SequenceDraft {
    const next = this.redoStack.pop();
    if (!next) return this.snapshot();
    this.undoStack.push(this.current);
    this.current = next;
    return this.snapshot();
  }
  execute(command: SequenceEditCommand): Result<SequenceDraft, SequenceCommandError> {
    const result = apply(this.current, command);
    if (!result.ok || result.value === this.current) return result.ok ? ok(this.snapshot()) : result;
    this.undoStack.push(this.current);
    this.current = result.value;
    this.redoStack.length = 0;
    return ok(this.snapshot());
  }
}

function apply(draft: SequenceDraft, command: SequenceEditCommand): Result<SequenceDraft, SequenceCommandError> {
  if (command.type === "add") return addItems(draft, command.items, command.at ?? draft.items.length);
  if (command.type === "addBlank") {
    const added = addItems(draft, [{ id: command.itemId, kind: "blank" }], command.at);
    if (!added.ok) return added;
    return ok({ ...added.value, readingUnits: replaceUnitId(added.value.readingUnits, command.itemId, command.unitId) });
  }
  if (command.type === "createSpread") return createSpread(draft, command.unitId, command.itemIds);
  if (command.type === "splitSpread") return splitSpread(draft, command.unitId);
  if (command.type === "createSegment") return createSegment(draft, command.segment);
  if (command.type === "renameSegment") {
    const segment = draft.segments.find((value) => value.id === command.segmentId);
    if (!segment) return err({ kind: "unknown-segment", segmentId: command.segmentId });
    const name = command.name.trim();
    if (!name) return err({ kind: "empty-name" });
    if (segment.name === name) return ok(draft);
    return ok({ ...draft, segments: draft.segments.map((value) => value.id === segment.id ? { ...value, name } : value) });
  }
  if (command.type === "ungroupSegment") {
    if (!draft.segments.some((value) => value.id === command.segmentId)) return err({ kind: "unknown-segment", segmentId: command.segmentId });
    return ok({ ...draft, segments: draft.segments.filter((value) => value.id !== command.segmentId) });
  }
  if (command.type === "moveSegment") {
    const segment = draft.segments.find((value) => value.id === command.segmentId);
    if (!segment) return err({ kind: "unknown-segment", segmentId: command.segmentId });
    return moveItems(draft, segment.itemIds, command.to);
  }
  if (command.type === "removeBlank") {
    const item = draft.items.find((value) => value.id === command.itemId);
    if (!item) return err({ kind: "unknown-item", itemId: command.itemId });
    if (item.kind !== "blank") return err({ kind: "invalid-reading-unit" });
    return removeItems(draft, [command.itemId]);
  }
  const missing = command.itemIds.find((itemId) => !draft.items.some((item) => item.id === itemId));
  if (missing) return err({ kind: "unknown-item", itemId: missing });
  if (command.type === "remove") return removeItems(draft, command.itemIds);
  return moveItems(draft, command.itemIds, command.to);
}

function addItems(draft: SequenceDraft, items: readonly SequenceItem[], at: number): Result<SequenceDraft, SequenceCommandError> {
  const known = new Set(draft.items.map((item) => item.id));
  for (const item of items) {
    if (known.has(item.id)) return err({ kind: "duplicate-item", itemId: item.id });
    known.add(item.id);
  }
  if (!Number.isInteger(at) || at < 0 || at > draft.items.length) return err({ kind: "invalid-target", target: at });
  if (draft.items.length + items.length > MVP_SEQUENCE_ITEM_LIMIT) return err({ kind: "sequence-limit-exceeded", limit: MVP_SEQUENCE_ITEM_LIMIT, current: draft.items.length, attempted: items.length });
  return ok(normalize({ ...draft, items: [...draft.items.slice(0, at), ...items, ...draft.items.slice(at)] }, new Set(items.map((item) => item.id))));
}

function removeItems(draft: SequenceDraft, itemIds: readonly SequenceItemId[]): Result<SequenceDraft, SequenceCommandError> {
  const removed = new Set(itemIds);
  if (!removed.size) return ok(draft);
  if (draft.items.length - removed.size < 1) return err({ kind: "cannot-remove-last-item" });
  return ok(normalize({ ...draft, items: draft.items.filter((item) => !removed.has(item.id)) }));
}

function moveItems(draft: SequenceDraft, itemIds: readonly SequenceItemId[], to: number): Result<SequenceDraft, SequenceCommandError> {
  if (!Number.isInteger(to) || to < 0 || to > draft.items.length) return err({ kind: "invalid-target", target: to });
  const selected = new Set(itemIds);
  const moving = draft.items.filter((item) => selected.has(item.id));
  if (!moving.length) return ok(draft);
  const remaining = draft.items.filter((item) => !selected.has(item.id));
  const beforeTarget = draft.items.slice(0, to).filter((item) => !selected.has(item.id)).length;
  const nextItems = [...remaining.slice(0, beforeTarget), ...moving, ...remaining.slice(beforeTarget)];
  if (nextItems.every((item, index) => item.id === draft.items[index]?.id)) return ok(draft);
  return ok(normalize({ ...draft, items: nextItems }, selected));
}

function createSpread(draft: SequenceDraft, unitId: ReadingUnitId, itemIds: readonly [SequenceItemId, SequenceItemId]): Result<SequenceDraft, SequenceCommandError> {
  if (draft.readingUnits.some((unit) => unit.id === unitId)) return err({ kind: "invalid-reading-unit" });
  const [leftId, rightId] = itemIds;
  const leftIndex = draft.items.findIndex((item) => item.id === leftId);
  const rightIndex = draft.items.findIndex((item) => item.id === rightId);
  if (leftIndex < 0) return err({ kind: "unknown-item", itemId: leftId });
  if (rightIndex < 0) return err({ kind: "unknown-item", itemId: rightId });
  if (rightIndex !== leftIndex + 1 || draft.items[leftIndex].kind !== "photo" || draft.items[rightIndex].kind !== "photo") return err({ kind: "invalid-reading-unit" });
  const leftSegment = draft.segments.find((segment) => segment.itemIds.includes(leftId))?.id;
  const rightSegment = draft.segments.find((segment) => segment.itemIds.includes(rightId))?.id;
  if (leftSegment !== rightSegment) return err({ kind: "invalid-reading-unit" });
  const units = draft.readingUnits.filter((unit) => !unitContains(unit, leftId) && !unitContains(unit, rightId));
  const insertionIndex = unitInsertionIndex(draft.items, units, leftIndex);
  units.splice(insertionIndex, 0, { id: unitId, kind: "spread", leftItemId: leftId, rightItemId: rightId });
  return ok({ ...draft, readingUnits: units });
}

function splitSpread(draft: SequenceDraft, unitId: ReadingUnitId): Result<SequenceDraft, SequenceCommandError> {
  const index = draft.readingUnits.findIndex((unit) => unit.id === unitId);
  if (index < 0) return err({ kind: "unknown-unit", unitId });
  const unit = draft.readingUnits[index];
  if (unit.kind !== "spread") return err({ kind: "invalid-reading-unit" });
  const readingUnits = [...draft.readingUnits];
  readingUnits.splice(index, 1, singleUnit(unit.leftItemId), singleUnit(unit.rightItemId));
  return ok({ ...draft, readingUnits });
}

function createSegment(draft: SequenceDraft, segment: SequenceSegment): Result<SequenceDraft, SequenceCommandError> {
  if (!segment.name.trim()) return err({ kind: "empty-name" });
  if (draft.segments.some((value) => value.id === segment.id)) return err({ kind: "invalid-segment" });
  const selected = new Set(segment.itemIds);
  if (!selected.size || segment.itemIds.some((id) => !draft.items.some((item) => item.id === id))) return err({ kind: "invalid-segment" });
  const indices = segment.itemIds.map((id) => draft.items.findIndex((item) => item.id === id)).sort((a, b) => a - b);
  if (indices.some((value, index) => index > 0 && value !== indices[index - 1] + 1)) return err({ kind: "invalid-segment" });
  if (draft.segments.some((value) => value.itemIds.some((id) => selected.has(id)))) return err({ kind: "invalid-segment" });
  if (draft.readingUnits.some((unit) => unit.kind === "spread" && unitItemIds(unit).some((id) => selected.has(id)) && !unitItemIds(unit).every((id) => selected.has(id)))) return err({ kind: "invalid-segment" });
  const orderedIds = draft.items.filter((item) => selected.has(item.id)).map((item) => item.id);
  return ok({ ...draft, segments: [...draft.segments, { ...segment, name: segment.name.trim(), itemIds: orderedIds }] });
}

function normalize(draft: SequenceDraft, moving = new Set<SequenceItemId>()): SequenceDraft {
  const itemById = new Map(draft.items.map((item) => [item.id, item]));
  const indexById = new Map(draft.items.map((item, index) => [item.id, index]));
  const covered = new Set<SequenceItemId>();
  const units: ReadingUnit[] = [];
  for (const unit of draft.readingUnits ?? []) {
    if (unit.kind === "spread") {
      const left = itemById.get(unit.leftItemId), right = itemById.get(unit.rightItemId);
      if (left?.kind === "photo" && right?.kind === "photo" && indexById.get(right.id) === (indexById.get(left.id) ?? -2) + 1) { units.push(unit); covered.add(left.id); covered.add(right.id); }
      else {
        if (left?.kind === "photo" && !covered.has(left.id)) { units.push(singleUnit(left.id)); covered.add(left.id); }
        if (right?.kind === "photo" && !covered.has(right.id)) { units.push(singleUnit(right.id)); covered.add(right.id); }
      }
    } else {
      const item = itemById.get(unit.itemId);
      if (item && !covered.has(item.id) && ((unit.kind === "blank") === (item.kind === "blank"))) { units.push(unit); covered.add(item.id); }
    }
  }
  for (const item of draft.items) if (!covered.has(item.id)) units.push(item.kind === "blank" ? blankUnit(item.id) : singleUnit(item.id));
  units.sort((a, b) => firstIndex(a, indexById) - firstIndex(b, indexById));

  const occupied = new Set<SequenceItemId>();
  const segments = (draft.segments ?? []).flatMap((segment) => {
    let ids = segment.itemIds.filter((id) => itemById.has(id) && !occupied.has(id));
    if (!ids.length) return [];
    const range = ids.map((id) => indexById.get(id)!).sort((a, b) => a - b);
    for (const item of draft.items.filter((value) => moving.has(value.id) && !ids.includes(value.id))) {
      const index = indexById.get(item.id)!;
      if (index >= range[0] - 1 && index <= range[range.length - 1] + 1) ids = [...ids, item.id];
    }
    ids = [...longestContiguous(ids, draft.items)];
    ids.forEach((id) => occupied.add(id));
    return ids.length ? [{ ...segment, itemIds: ids }] : [];
  });
  return { ...draft, items: draft.items.map((item) => ({ ...item })), readingUnits: units, segments };
}

function longestContiguous(ids: readonly SequenceItemId[], items: readonly SequenceItem[]): readonly SequenceItemId[] {
  const wanted = new Set(ids); let best: SequenceItemId[] = [], current: SequenceItemId[] = [];
  for (const item of items) { if (wanted.has(item.id)) { current.push(item.id); if (current.length > best.length) best = [...current]; } else current = []; }
  return best;
}

function unitContains(unit: ReadingUnit, id: SequenceItemId): boolean { return unitItemIds(unit).includes(id); }
function unitItemIds(unit: ReadingUnit): readonly SequenceItemId[] { return unit.kind === "spread" ? [unit.leftItemId, unit.rightItemId] : [unit.itemId]; }
function singleUnit(itemId: SequenceItemId): ReadingUnit { return { id: `unit-${itemId}` as ReadingUnitId, kind: "single", itemId }; }
function blankUnit(itemId: SequenceItemId): ReadingUnit { return { id: `unit-${itemId}` as ReadingUnitId, kind: "blank", itemId }; }
function firstIndex(unit: ReadingUnit, indices: ReadonlyMap<SequenceItemId, number>): number { return Math.min(...unitItemIds(unit).map((id) => indices.get(id) ?? Number.MAX_SAFE_INTEGER)); }
function unitInsertionIndex(items: readonly SequenceItem[], units: readonly ReadingUnit[], itemIndex: number): number { const indices = new Map(items.map((item, index) => [item.id, index])); const found = units.findIndex((unit) => firstIndex(unit, indices) > itemIndex); return found < 0 ? units.length : found; }
function replaceUnitId(units: readonly ReadingUnit[], itemId: SequenceItemId, unitId: ReadingUnitId): readonly ReadingUnit[] { return units.map((unit) => unitContains(unit, itemId) ? { ...unit, id: unitId } : unit); }
function copy(draft: SequenceDraft): SequenceDraft { return { ...draft, items: draft.items.map((item) => ({ ...item })), segments: draft.segments.map((segment) => ({ ...segment, itemIds: [...segment.itemIds] })), readingUnits: draft.readingUnits.map((unit) => ({ ...unit })) }; }
