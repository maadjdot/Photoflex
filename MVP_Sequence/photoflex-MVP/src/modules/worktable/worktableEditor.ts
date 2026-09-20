import {
  err,
  ok,
  type PhotoId,
  type Result,
  type WorktableCommandError,
  type WorktableDraft,
  type WorktableMemo,
  type WorktableEditCommand,
  type WorktableEditor,
  type WorktableLayout,
  type WorktableLink,
  type WorktablePoint,
  type WorktablePlacement,
  type WorktableSequencePilePlacement,
  type WorktableGroup,
  type WorktableItemId,
  type SequenceId,
} from "../../contracts";

// A deliberately generous working size keeps every card legible before the
// photographer starts arranging it. New placements retain source proportions.
export const DEFAULT_WORKTABLE_CARD_WIDTH = 235;
export const DEFAULT_WORKTABLE_CARD_HEIGHT = 175;
export const DEFAULT_WORKTABLE_GAP = 24;

const DEFAULT_ORIGIN = { x: 64, y: 64 } as const;
const DEFAULT_COLUMNS = 7;
const DEFAULT_CELL_WIDTH = DEFAULT_WORKTABLE_CARD_WIDTH + 40;
const DEFAULT_CELL_HEIGHT = DEFAULT_WORKTABLE_CARD_HEIGHT + 72;
const GROUP_GAP = 6;
const GROUP_COLUMNS = 4;
const PLACEMENT_CLEARANCE = 18;
const PLACEMENT_SEARCH_STEP = 32;
const HORIZONTAL_ROW_OVERLAP_RATIO = 0.4;
const HORIZONTAL_ROW_GAP_FACTOR = 2;

export function createEmptyWorktable(projectId: WorktableDraft["projectId"]): WorktableDraft {
  return { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [], pilePlacements: {} };
}

export function migratePoolToWorktable(
  projectId: WorktableDraft["projectId"],
  poolPhotoIds: readonly PhotoId[],
): WorktableDraft {
  const editor = createWorktableEditor(createEmptyWorktable(projectId));
  const uniquePhotoIds = [...new Set(poolPhotoIds)];
  editor.execute({
    type: "place",
    items: uniquePhotoIds.map((photoId) => ({
      photoId,
      width: DEFAULT_WORKTABLE_CARD_WIDTH,
      height: DEFAULT_WORKTABLE_CARD_HEIGHT,
      filename: placeholderFilename(photoId),
    })),
  });
  const migrated = editor.snapshot();
  // Keep the historical pool migration geometry stable. New placements use
  // the more compact seven-column layout, but existing projects should not
  // jump when their legacy pool is converted to a Table draft.
  const placements = Object.fromEntries(uniquePhotoIds.map((photoId, index) => {
    const placement = migrated.placements[photoId];
    return [photoId, {
      ...placement,
      x: DEFAULT_ORIGIN.x + (index % 4) * 283,
      y: DEFAULT_ORIGIN.y + Math.floor(index / 4) * 263,
    }];
  })) as WorktableDraft["placements"];
  return { ...migrated, placements };
}

export function createWorktableEditor(initial: WorktableDraft): WorktableEditor {
  return new Editor(initial);
}

class Editor implements WorktableEditor {
  private current: WorktableDraft;
  private readonly undoStack: WorktableDraft[] = [];
  private readonly redoStack: WorktableDraft[] = [];

  constructor(initial: WorktableDraft) {
    this.current = copyDraft(initial);
  }

  snapshot(): WorktableDraft {
    return copyDraft(this.current);
  }

  execute(command: WorktableEditCommand): Result<WorktableDraft, WorktableCommandError> {
    const result = applyCommand(this.current, command);
    if (!result.ok) return result;
    if (result.value === this.current) return ok(this.snapshot());
    this.undoStack.push(this.current);
    this.current = result.value;
    this.redoStack.length = 0;
    return ok(this.snapshot());
  }

  undo(): WorktableDraft {
    const previous = this.undoStack.pop();
    if (!previous) return this.snapshot();
    this.redoStack.push(this.current);
    this.current = previous;
    return this.snapshot();
  }

  redo(): WorktableDraft {
    const next = this.redoStack.pop();
    if (!next) return this.snapshot();
    this.undoStack.push(this.current);
    this.current = next;
    return this.snapshot();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

function applyCommand(
  draft: WorktableDraft,
  command: WorktableEditCommand,
): Result<WorktableDraft, WorktableCommandError> {
  if (command.type === "create-memo" || command.type === "update-memo" || command.type === "remove-memo") return editMemo(draft, command);
  if (command.type === "place") return place(draft, command);
  if (command.type === "remove-group") return removeGroup(draft, command.groupId);
  if (command.type === "remove-link") return removeLink(draft, command.linkId);
  if (command.type === "add-to-group") return addToGroup(draft, command.groupId, command.photoId);
  if (command.type === "remove-from-group") return removeFromGroup(draft, command.photoId);
  if (command.type === "place-sequence-pile") return placeSequencePile(draft, command.placement);
  if (command.type === "move-sequence-piles") return moveSequencePiles(draft, command.sequenceIds, command.by.x, command.by.y);
  if (command.type === "resize-sequence-pile") return resizeSequencePile(draft, command.sequenceId, command.scale, command.baseSize);
  if (command.type === "bring-sequence-piles-to-front") return bringSequencePilesToFront(draft, command.sequenceIds);
  if (command.type === "remove-sequence-piles") return removeSequencePiles(draft, command.sequenceIds);
  const validation = validateKnown(draft, command.photoIds);
  if (!validation.ok) return validation;
  if (command.type === "set-locked") return setLocked(draft, command.photoIds, command.locked);
  if (command.type === "move") return move(draft, command.photoIds, command.by.x, command.by.y);
  if (command.type === "resize") return resize(draft, command.photoIds, command.scale);
  if (command.type === "arrange") return arrange(draft, command.photoIds, command.layout);
  if (command.type === "shuffle") return shuffle(draft, command.photoIds);
  if (command.type === "create-group") return createGroup(draft, command.photoIds);
  if (command.type === "create-link") return createLink(draft, command.photoIds);
  if (command.type === "bring-to-front") return bringToFront(draft, command.photoIds);
  return remove(draft, command.photoIds);
}

function editMemo(draft: WorktableDraft, command: Extract<WorktableEditCommand, { type: "create-memo" | "update-memo" | "remove-memo" }>): Result<WorktableDraft, WorktableCommandError> {
  const memos = draft.memos ?? [];
  if (command.type === "remove-memo") {
    if (!memos.some((memo) => memo.id === command.memoId)) return err({ kind: "invalid-relation" });
    return ok({ ...draft, memos: memos.filter((memo) => memo.id !== command.memoId) });
  }
  const previous = command.type === "update-memo" ? memos.find((memo) => memo.id === command.memoId) : undefined;
  if (command.type === "update-memo" && !previous) return err({ kind: "invalid-relation" });
  let memo: WorktableMemo = command.type === "create-memo" ? command.memo : { ...previous!, ...command.changes };
  if (!memo.id || (command.type === "create-memo" && memos.some((item) => item.id === memo.id))) return err({ kind: "invalid-relation" });
  if (![memo.x, memo.y, memo.width, memo.height, memo.fontSize, ...(memo.z === undefined ? [] : [memo.z])].every(Number.isFinite) || memo.width < 120 || memo.height < 80 || memo.fontSize < 10 || memo.fontSize > 72) return err({ kind: "invalid-coordinate" });
  if (typeof memo.text !== "string" || new Set(memo.photoIds).size !== memo.photoIds.length || memo.photoIds.some((id) => !draft.placements[id])) return err({ kind: "invalid-relation" });
  if (command.type === "create-memo") {
    const [positioned] = moveRectsToOpenArea(draft, [memo]);
    memo = { ...memo, x: positioned.x, y: positioned.y, z: maximumZ(draft) + 1 };
  }
  const next = { ...memo, photoIds: [...memo.photoIds] };
  return ok({ ...draft, memos: command.type === "create-memo" ? [...memos, next] : memos.map((item) => item.id === next.id ? next : item) });
}

function createGroup(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
): Result<WorktableDraft, WorktableCommandError> {
  if (photoIds.length < 2 || new Set(photoIds).size !== photoIds.length) return err({ kind: "invalid-relation" });
  if (draft.groups.some((group) => group.photoIds.some((photoId) => photoIds.includes(photoId)))) {
    return err({ kind: "invalid-relation" });
  }
  const ordered = draft.entryOrder.filter((photoId) => photoIds.includes(photoId));
  if (ordered.length !== photoIds.length) return err({ kind: "invalid-relation" });
  const originX = Math.min(...ordered.map((photoId) => draft.placements[photoId].x));
  const originY = Math.min(...ordered.map((photoId) => draft.placements[photoId].y));
  const packed = packGroupGrid(draft, ordered, originX, originY);
  return ok({
    ...packed,
    groups: [...packed.groups, { id: nextRelationId("group", packed.groups), name: `GROUP ${String(packed.groups.length + 1).padStart(2, "0")}`, photoIds: ordered }],
  });
}

function removeGroup(draft: WorktableDraft, groupId: string): Result<WorktableDraft, WorktableCommandError> {
  if (!draft.groups.some((group) => group.id === groupId)) return err({ kind: "invalid-relation" });
  return ok({ ...draft, groups: draft.groups.filter((group) => group.id !== groupId) });
}

function addToGroup(
  draft: WorktableDraft,
  groupId: string,
  photoId: WorktableItemId,
): Result<WorktableDraft, WorktableCommandError> {
  const group = draft.groups.find((candidate) => candidate.id === groupId);
  if (!group || !draft.placements[photoId] || draft.groups.some((candidate) => candidate.photoIds.includes(photoId))) {
    return err({ kind: "invalid-relation" });
  }
  const photoIds = [...group.photoIds, photoId];
  const originX = Math.min(...group.photoIds.map((memberId) => draft.placements[memberId].x));
  const originY = Math.min(...group.photoIds.map((memberId) => draft.placements[memberId].y));
  const packed = packGroupGrid(draft, photoIds, originX, originY);
  return ok({ ...packed, groups: packed.groups.map((candidate) => candidate.id === groupId ? { ...candidate, photoIds } : candidate) });
}

function removeFromGroup(draft: WorktableDraft, photoId: WorktableItemId): Result<WorktableDraft, WorktableCommandError> {
  const group = draft.groups.find((candidate) => candidate.photoIds.includes(photoId));
  if (!group) return err({ kind: "invalid-relation" });
  const members = group.photoIds.filter((memberId) => memberId !== photoId);
  const originX = Math.min(...group.photoIds.map((memberId) => draft.placements[memberId].x));
  const originY = Math.min(...group.photoIds.map((memberId) => draft.placements[memberId].y));
  const packed = members.length > 1 ? packGroupGrid(draft, members, originX, originY) : draft;
  return ok({
    ...packed,
    groups: members.length > 1
      ? packed.groups.map((candidate) => candidate.id === group.id ? { ...candidate, photoIds: members } : candidate)
      : packed.groups.filter((candidate) => candidate.id !== group.id),
  });
}

function createLink(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
): Result<WorktableDraft, WorktableCommandError> {
  if (photoIds.length < 2 || photoIds.length > 6 || new Set(photoIds).size !== photoIds.length) return err({ kind: "invalid-relation" });
  const ordered = draft.entryOrder.filter((photoId) => photoIds.includes(photoId));
  if (ordered.length !== photoIds.length) return err({ kind: "invalid-relation" });
  const touchesGroup = draft.groups.some((group) => ordered.some((photoId) => group.photoIds.includes(photoId)));
  const anchor = draft.placements[ordered.at(-1)!];
  const packed = touchesGroup ? draft : packNearAnchor(draft, ordered, anchor.x, anchor.y, 28);
  return ok({
    ...packed,
    links: [...packed.links, { id: nextRelationId("link", packed.links), name: `LINK ${String(packed.links.length + 1).padStart(2, "0")}`, photoIds: ordered }],
  });
}

function removeLink(draft: WorktableDraft, linkId: string): Result<WorktableDraft, WorktableCommandError> {
  if (!draft.links.some((link) => link.id === linkId)) return err({ kind: "invalid-relation" });
  return ok({ ...draft, links: draft.links.filter((link) => link.id !== linkId) });
}

function packNearAnchor(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
  anchorX: number,
  anchorY: number,
  gap: number,
): WorktableDraft {
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;
  // The last selected/ordered member is the anchor. Pack earlier members to
  // its left so creating a relation does not make the photographer lose it.
  const widthBeforeAnchor = photoIds.slice(0, -1).reduce((sum, photoId) => sum + placements[photoId].width + gap, 0);
  let x = anchorX - widthBeforeAnchor;
  for (const photoId of photoIds) {
    const placement = placements[photoId];
    placements[photoId] = { ...placement, x, y: anchorY };
    x += placement.width + gap;
  }
  return { ...draft, placements };
}

function packGroupGrid(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
  originX: number,
  originY: number,
): WorktableDraft {
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;
  for (let rowStart = 0, y = originY; rowStart < photoIds.length; rowStart += GROUP_COLUMNS) {
    const row = photoIds.slice(rowStart, rowStart + GROUP_COLUMNS);
    const rowHeight = Math.max(...row.map((photoId) => placements[photoId].height));
    let x = originX;
    row.forEach((photoId) => {
      const current = placements[photoId];
      placements[photoId] = { ...current, x, y };
      x += current.width + GROUP_GAP;
    });
    y += rowHeight + GROUP_GAP;
  }
  return { ...draft, placements };
}

function nextRelationId(prefix: "group" | "link", relations: readonly WorktableGroup[] | readonly WorktableLink[]): string {
  const maximum = relations.reduce((max, relation) => Math.max(max, Number(relation.id.split("-").at(-1)) || 0), 0);
  return `${prefix}-${maximum + 1}`;
}

function resize(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
  scale: number,
): Result<WorktableDraft, WorktableCommandError> {
  if (!Number.isFinite(scale) || scale <= 0) return err({ kind: "invalid-coordinate" });
  if (Math.abs(scale - 1) < .0001) return ok(draft);
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;
  let changed = false;
  for (const photoId of photoIds) {
    const current = placements[photoId];
    const minimumScale = Math.max(72 / current.width, 72 / current.height);
    const maximumScale = Math.min(1200 / current.width, 1200 / current.height);
    const appliedScale = Math.max(minimumScale, Math.min(maximumScale, scale));
    const resized = {
      ...current,
      width: current.width * appliedScale,
      height: current.height * appliedScale,
    };
    placements[photoId] = resized;
    changed ||= resized.width !== current.width || resized.height !== current.height;
  }
  return ok(changed ? { ...draft, placements } : draft);
}

function place(
  draft: WorktableDraft,
  command: Extract<WorktableEditCommand, { type: "place" }>,
): Result<WorktableDraft, WorktableCommandError> {
  const seen = new Set<WorktableItemId>();
  for (const item of command.items) {
    const itemId = item.id ?? item.photoId;
    if (seen.has(itemId)) return err({ kind: "duplicate-photo-id", photoId: itemId });
    seen.add(itemId);
    if (![item.width, item.height].every(isPositiveFinite)
      || (item.x !== undefined && !Number.isFinite(item.x))
      || (item.y !== undefined && !Number.isFinite(item.y))) return err({ kind: "invalid-coordinate" });
  }
  if (command.at && ![command.at.x, command.at.y].every(Number.isFinite)) {
    return err({ kind: "invalid-coordinate" });
  }

  const additions = command.items
    .map((item) => ({ ...item, id: item.id ?? item.photoId }))
    .filter((item) => !draft.placements[item.id]);
  if (!additions.length) return ok(draft);
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;
  const entryOrder = [...draft.entryOrder];
  const maxZ = maximumZ(draft);
  const origin = command.at ?? DEFAULT_ORIGIN;
  const proposed = additions.map((item, offset) => {
    const index = command.at ? offset : entryOrder.length + offset;
    return {
      ...item,
      x: item.x ?? origin.x + (index % DEFAULT_COLUMNS) * DEFAULT_CELL_WIDTH,
      y: item.y ?? origin.y + Math.floor(index / DEFAULT_COLUMNS) * DEFAULT_CELL_HEIGHT,
    };
  });
  const positioned = moveRectsToOpenArea(draft, proposed);

  positioned.forEach((item, offset) => {
    placements[item.id] = {
      ...item,
      z: maxZ + offset + 1,
    };
    entryOrder.push(item.id);
  });
  return ok({ ...draft, placements, entryOrder });
}

function move(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
  dx: number,
  dy: number,
): Result<WorktableDraft, WorktableCommandError> {
  if (![dx, dy].every(Number.isFinite)) return err({ kind: "invalid-coordinate" });
  if (!dx && !dy) return ok(draft);
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;
  for (const photoId of photoIds) {
    const current = placements[photoId];
    placements[photoId] = { ...current, x: current.x + dx, y: current.y + dy };
  }
  return ok({ ...draft, placements });
}

function arrange(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
  layout: WorktableLayout,
): Result<WorktableDraft, WorktableCommandError> {
  if (photoIds.length < 2) return ok(draft);
  const requested = new Set(photoIds);
  const ordered = draft.entryOrder.filter((photoId) => requested.has(photoId));
  const selected = ordered.map((photoId) => draft.placements[photoId]);
  const minX = Math.min(...selected.map((item) => item.x));
  const minY = Math.min(...selected.map((item) => item.y));
  const maxRight = Math.max(...selected.map((item) => item.x + item.width));
  const maxBottom = Math.max(...selected.map((item) => item.y + item.height));
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;

  if (layout.type === "grid") {
    const columns = layout.columns ?? Math.ceil(Math.sqrt(selected.length));
    const gap = layout.gap ?? DEFAULT_WORKTABLE_GAP;
    if (!Number.isInteger(columns) || columns < 1 || !isNonNegativeFinite(gap)) {
      return err({ kind: "invalid-layout" });
    }
    const cellWidth = Math.max(...selected.map((item) => item.width)) + gap;
    const cellHeight = Math.max(...selected.map((item) => item.height)) + gap + 20;
    ordered.forEach((photoId, index) => {
      placements[photoId] = {
        ...placements[photoId],
        x: minX + (index % columns) * cellWidth,
        y: minY + Math.floor(index / columns) * cellHeight,
      };
    });
  } else if (layout.type === "row") {
    const gap = layout.gap ?? DEFAULT_WORKTABLE_GAP;
    if (!isNonNegativeFinite(gap)) return err({ kind: "invalid-layout" });
    let x = minX;
    ordered.forEach((photoId) => {
      placements[photoId] = { ...placements[photoId], x, y: minY };
      x += placements[photoId].width + gap;
    });
  } else {
    ordered.forEach((photoId) => {
      const item = placements[photoId];
      if (layout.edge === "left") placements[photoId] = { ...item, x: minX };
      if (layout.edge === "center-x") placements[photoId] = { ...item, x: (minX + maxRight - item.width) / 2 };
      if (layout.edge === "right") placements[photoId] = { ...item, x: maxRight - item.width };
      if (layout.edge === "top") placements[photoId] = { ...item, y: minY };
      if (layout.edge === "center-y") placements[photoId] = { ...item, y: (minY + maxBottom - item.height) / 2 };
      if (layout.edge === "bottom") placements[photoId] = { ...item, y: maxBottom - item.height };
    });
  }
  const changed = ordered.some((photoId) => {
    const before = draft.placements[photoId];
    const after = placements[photoId];
    return before.x !== after.x || before.y !== after.y;
  });
  return ok(changed ? { ...draft, placements } : draft);
}

function shuffle(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
): Result<WorktableDraft, WorktableCommandError> {
  if (photoIds.length < 2) return ok(draft);
  const requested = new Set(photoIds);
  const ordered = draft.entryOrder.filter((photoId) => requested.has(photoId));
  const horizontalRows = findHorizontalRows(draft, ordered).filter((row) => row.length > 1);
  const rowMembers = new Set(horizontalRows.flat());
  const ungrouped = ordered.filter((photoId) => !rowMembers.has(photoId));
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;

  horizontalRows.forEach((slotOwners) => {
    const shuffled = shuffleCycle(slotOwners);
    const slots = slotOwners.map((photoId) => ({ x: draft.placements[photoId].x, y: draft.placements[photoId].y }));
    placePhotosInSlots(placements, shuffled, slots);
    reflowHorizontalShuffle(draft, placements, slotOwners, shuffled, slots);
  });

  if (ungrouped.length > 1) {
    const shuffled = shuffleCycle(ungrouped);
    const slots = ungrouped.map((photoId) => ({ x: draft.placements[photoId].x, y: draft.placements[photoId].y }));
    placePhotosInSlots(placements, shuffled, slots);
    ungrouped.forEach((photoId) => {
      const current = placements[photoId];
      const stayedInPlace = current.x === draft.placements[photoId].x && current.y === draft.placements[photoId].y;
      if (stayedInPlace || !shufflePositionIsAllowed(draft, placements, photoId, current)) {
        placements[photoId] = findSafeShufflePosition(draft, placements, photoId, current);
      }
    });
  }
  const changed = ordered.some((photoId) => {
    const before = draft.placements[photoId];
    const after = placements[photoId];
    return before.x !== after.x || before.y !== after.y;
  });
  return ok(changed ? { ...draft, placements } : draft);
}

function shuffleCycle(photoIds: readonly WorktableItemId[]): WorktableItemId[] {
  const shuffled = [...photoIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    // Sattolo's algorithm creates one cycle, so every selected photo leaves
    // its own slot instead of a shuffle degenerating into a two-photo swap.
    const swapIndex = Math.floor(Math.random() * index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function placePhotosInSlots(
  placements: Record<WorktableItemId, WorktablePlacement>,
  photoIds: readonly WorktableItemId[],
  slots: readonly WorktablePoint[],
): void {
  photoIds.forEach((photoId, index) => {
    placements[photoId] = { ...placements[photoId], ...slots[index] };
  });
}

function findHorizontalRows(draft: WorktableDraft, photoIds: readonly WorktableItemId[]): WorktableItemId[][] {
  const rows: WorktableItemId[][] = [];
  const leftToRight = [...photoIds].sort((leftId, rightId) => (
    draft.placements[leftId].x - draft.placements[rightId].x
    || draft.placements[leftId].y - draft.placements[rightId].y
  ));
  leftToRight.forEach((photoId) => {
    const placement = draft.placements[photoId];
    const candidates = rows.flatMap((row, index) => {
      const previous = draft.placements[row.at(-1)!];
      const horizontalGap = placement.x - (previous.x + previous.width);
      const closeEnough = horizontalGap <= Math.max(previous.width, placement.width) * HORIZONTAL_ROW_GAP_FACTOR;
      const overlapsWholeRow = row.every((memberId) => (
        verticalOverlapRatio(placement, draft.placements[memberId]) >= HORIZONTAL_ROW_OVERLAP_RATIO
      ));
      if (!closeEnough || !overlapsWholeRow) return [];
      const minimumOverlap = Math.min(...row.map((memberId) => verticalOverlapRatio(placement, draft.placements[memberId])));
      return [{ index, score: minimumOverlap }];
    }).sort((left, right) => right.score - left.score);
    const row = candidates.length ? rows[candidates[0].index] : undefined;
    if (row) row.push(photoId);
    else rows.push([photoId]);
  });
  return rows;
}

function verticalOverlapRatio(left: WorktableRect, right: WorktableRect): number {
  const overlap = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return overlap / Math.min(left.height, right.height);
}

function reflowHorizontalShuffle(
  draft: WorktableDraft,
  placements: Record<WorktableItemId, WorktablePlacement>,
  slotOwners: readonly WorktableItemId[],
  shuffled: readonly WorktableItemId[],
  slots: readonly WorktablePoint[],
): void {
  const selected = new Set(shuffled);
  const placed = new Set<WorktableItemId>();
  const originalGaps = slotOwners.slice(1).map((_, index) => (
    slots[index + 1].x - (slots[index].x + draft.placements[slotOwners[index]].width)
  ));
  const nonOverlappingGaps = originalGaps.filter((gap) => gap >= 0);
  const rowGap = nonOverlappingGaps.length ? Math.min(...nonOverlappingGaps) : 0;
  let previousRight: number | undefined;
  shuffled.forEach((photoId, index) => {
    const current = placements[photoId];
    let x = previousRight === undefined ? slots[0].x : previousRight + rowGap;
    let candidate = { ...current, x };
    const relevantIds = draft.entryOrder.filter((otherId) => !selected.has(otherId) || placed.has(otherId));
    while (true) {
      const blockers = relevantIds.filter((otherId) => (
        otherId !== photoId
        && rectsOverlap(candidate, placements[otherId])
        && !rectsOverlap(draft.placements[photoId], draft.placements[otherId])
      ));
      if (!blockers.length) break;
      x = Math.max(...blockers.map((otherId) => placements[otherId].x + placements[otherId].width + rowGap));
      candidate = { ...candidate, x };
    }
    placements[photoId] = candidate;
    placed.add(photoId);
    previousRight = candidate.x + candidate.width;
  });
}

function shufflePositionIsAllowed(
  draft: WorktableDraft,
  placements: Readonly<Record<WorktableItemId, WorktablePlacement>>,
  photoId: WorktableItemId,
  candidate: WorktablePlacement,
): boolean {
  return draft.entryOrder.every((otherId) => (
    otherId === photoId
    || !rectsOverlap(candidate, placements[otherId])
    || rectsOverlap(draft.placements[photoId], draft.placements[otherId])
  ));
}

function findSafeShufflePosition(
  draft: WorktableDraft,
  placements: Readonly<Record<WorktableItemId, WorktablePlacement>>,
  photoId: WorktableItemId,
  desired: WorktablePlacement,
): WorktablePlacement {
  const original = draft.placements[photoId];
  const fits = (x: number, y: number) => {
    if (x === original.x && y === original.y) return false;
    return shufflePositionIsAllowed(draft, placements, photoId, { ...desired, x, y });
  };
  for (let radius = 1; radius <= 32; radius += 1) {
    const candidates: [number, number][] = [];
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) === radius) {
          candidates.push([desired.x + x * PLACEMENT_SEARCH_STEP, desired.y + y * PLACEMENT_SEARCH_STEP]);
        }
      }
    }
    candidates.sort((left, right) => (
      Math.hypot(left[0] - desired.x, left[1] - desired.y) - Math.hypot(right[0] - desired.x, right[1] - desired.y)
      || right[0] - left[0]
      || right[1] - left[1]
    ));
    const position = candidates.find(([x, y]) => fits(x, y));
    if (position) return { ...desired, x: position[0], y: position[1] };
  }
  const otherPhotos = draft.entryOrder.filter((otherId) => otherId !== photoId).map((otherId) => placements[otherId]);
  let x = Math.max(...otherPhotos.map((item) => item.x + item.width)) + DEFAULT_WORKTABLE_GAP;
  if (x === original.x && desired.y === original.y) x += PLACEMENT_SEARCH_STEP;
  return { ...desired, x, y: desired.y };
}

function bringToFront(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
): Result<WorktableDraft, WorktableCommandError> {
  const selected = new Set(photoIds);
  const ordered = draft.entryOrder.filter((photoId) => selected.has(photoId));
  const maxZ = maximumZ(draft);
  const alreadyTop = ordered.every((photoId, index) => draft.placements[photoId].z === maxZ - ordered.length + index + 1);
  if (alreadyTop) return ok(draft);
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;
  ordered.forEach((photoId, index) => {
    placements[photoId] = { ...placements[photoId], z: maxZ + index + 1 };
  });
  return ok({ ...draft, placements });
}

function remove(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
): Result<WorktableDraft, WorktableCommandError> {
  if (!photoIds.length) return ok(draft);
  const removed = new Set(photoIds);
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;
  photoIds.forEach((photoId) => delete placements[photoId]);
  return ok({
    ...draft,
    memos: draft.memos?.map((memo) => ({ ...memo, photoIds: memo.photoIds.filter((id) => !removed.has(id)) })),
    entryOrder: draft.entryOrder.filter((photoId) => !removed.has(photoId)),
    placements,
    groups: draft.groups.flatMap((group) => {
      const members = group.photoIds.filter((photoId) => !removed.has(photoId));
      return members.length > 1 ? [{ ...group, photoIds: members }] : [];
    }),
    links: draft.links.flatMap((link) => {
      const members = link.photoIds.filter((photoId) => !removed.has(photoId));
      return members.length > 1 ? [{ ...link, photoIds: members }] : [];
    }),
  });
}

function validateKnown(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
): Result<true, WorktableCommandError> {
  const seen = new Set<WorktableItemId>();
  for (const photoId of photoIds) {
    if (seen.has(photoId)) return err({ kind: "duplicate-photo-id", photoId });
    seen.add(photoId);
    if (!draft.placements[photoId]) return err({ kind: "unknown-placement", photoId });
  }
  return ok(true);
}

function placeSequencePile(
  draft: WorktableDraft,
  placement: WorktableSequencePilePlacement,
): Result<WorktableDraft, WorktableCommandError> {
  if (draft.pilePlacements[placement.sequenceId]) return err({ kind: "duplicate-sequence-pile", sequenceId: placement.sequenceId });
  if (![placement.x, placement.y, placement.z, placement.width, placement.height].every(Number.isFinite)
    || placement.width <= 0 || placement.height <= 0) return err({ kind: "invalid-coordinate" });
  return ok({
    ...draft,
    pileOrder: [...draft.pileOrder, placement.sequenceId],
    pilePlacements: { ...draft.pilePlacements, [placement.sequenceId]: { ...placement } },
  });
}

function moveSequencePiles(
  draft: WorktableDraft,
  sequenceIds: readonly SequenceId[],
  dx: number,
  dy: number,
): Result<WorktableDraft, WorktableCommandError> {
  const validation = validateKnownPiles(draft, sequenceIds);
  if (!validation.ok) return validation;
  if (![dx, dy].every(Number.isFinite)) return err({ kind: "invalid-coordinate" });
  if (!dx && !dy) return ok(draft);
  const pilePlacements = { ...draft.pilePlacements } as Record<SequenceId, WorktableSequencePilePlacement>;
  sequenceIds.forEach((sequenceId) => {
    const current = pilePlacements[sequenceId];
    pilePlacements[sequenceId] = { ...current, x: current.x + dx, y: current.y + dy };
  });
  return ok({ ...draft, pilePlacements });
}

function resizeSequencePile(
  draft: WorktableDraft,
  sequenceId: SequenceId,
  scale: number,
  baseSize?: { readonly width: number; readonly height: number },
): Result<WorktableDraft, WorktableCommandError> {
  const pile = draft.pilePlacements[sequenceId];
  if (!pile || !Number.isFinite(scale) || scale <= 0) return err({ kind: "unknown-sequence-pile", sequenceId });
  if (baseSize && (!Number.isFinite(baseSize.width) || !Number.isFinite(baseSize.height) || baseSize.width <= 0 || baseSize.height <= 0)) {
    return err({ kind: "invalid-coordinate" });
  }
  const nextScale = Math.max(0.5, Math.min(2.5, scale));
  if (Math.abs(nextScale - 1) < 0.001) return ok(draft);
  const baseWidth = baseSize?.width ?? pile.width;
  const baseHeight = baseSize?.height ?? pile.height;
  const width = Math.max(120, baseWidth * nextScale), height = Math.max(80, baseHeight * nextScale);
  return ok({ ...draft, pilePlacements: { ...draft.pilePlacements, [sequenceId]: { ...pile, width, height, x: pile.x + (baseWidth - width) / 2, y: pile.y + (baseHeight - height) / 2 } } });
}

function setLocked(
  draft: WorktableDraft,
  photoIds: readonly WorktableItemId[],
  locked: boolean,
): Result<WorktableDraft, WorktableCommandError> {
  const placements = { ...draft.placements } as Record<WorktableItemId, WorktablePlacement>;
  let changed = false;
  photoIds.forEach((photoId) => {
    const current = placements[photoId];
    if (current.locked === locked) return;
    placements[photoId] = { ...current, locked };
    changed = true;
  });
  return ok(changed ? { ...draft, placements } : draft);
}

function bringSequencePilesToFront(
  draft: WorktableDraft,
  sequenceIds: readonly SequenceId[],
): Result<WorktableDraft, WorktableCommandError> {
  const validation = validateKnownPiles(draft, sequenceIds);
  if (!validation.ok) return validation;
  const maxZ = maximumZ(draft);
  const pilePlacements = { ...draft.pilePlacements } as Record<SequenceId, WorktableSequencePilePlacement>;
  draft.pileOrder.filter((sequenceId) => sequenceIds.includes(sequenceId)).forEach((sequenceId, index) => {
    pilePlacements[sequenceId] = { ...pilePlacements[sequenceId], z: maxZ + index + 1 };
  });
  return ok({ ...draft, pilePlacements });
}

function removeSequencePiles(
  draft: WorktableDraft,
  sequenceIds: readonly SequenceId[],
): Result<WorktableDraft, WorktableCommandError> {
  const validation = validateKnownPiles(draft, sequenceIds);
  if (!validation.ok) return validation;
  const removed = new Set(sequenceIds);
  const pilePlacements = { ...draft.pilePlacements } as Record<SequenceId, WorktableSequencePilePlacement>;
  sequenceIds.forEach((sequenceId) => delete pilePlacements[sequenceId]);
  return ok({ ...draft, pileOrder: draft.pileOrder.filter((sequenceId) => !removed.has(sequenceId)), pilePlacements });
}

function validateKnownPiles(draft: WorktableDraft, sequenceIds: readonly SequenceId[]): Result<true, WorktableCommandError> {
  const seen = new Set<SequenceId>();
  for (const sequenceId of sequenceIds) {
    if (seen.has(sequenceId)) return err({ kind: "duplicate-sequence-pile", sequenceId });
    seen.add(sequenceId);
    if (!draft.pilePlacements[sequenceId]) return err({ kind: "unknown-sequence-pile", sequenceId });
  }
  return ok(true);
}

function maximumZ(draft: WorktableDraft): number {
  const graphicZ = Math.max(-1, ...Object.values(draft.placements).map((item) => item.z), ...Object.values(draft.pilePlacements).map((item) => item.z));
  return Math.max(graphicZ, ...(draft.memos ?? []).map((memo, index) => memo.z ?? graphicZ + index + 1));
}

interface WorktableRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Keeps a newly-created batch near its requested point without covering existing Table material. */
function moveRectsToOpenArea<T extends WorktableRect>(draft: WorktableDraft, rects: readonly T[]): T[] {
  const occupied: WorktableRect[] = [
    ...Object.values(draft.placements),
    ...Object.values(draft.pilePlacements),
    ...(draft.memos ?? []),
  ];
  const fits = (dx: number, dy: number) => rects.every((rect, index) => {
    const shifted = { ...rect, x: rect.x + dx, y: rect.y + dy };
    return occupied.every((item) => !rectsOverlap(shifted, item, PLACEMENT_CLEARANCE))
      && rects.slice(0, index).every((item) => !rectsOverlap(shifted, { ...item, x: item.x + dx, y: item.y + dy }, PLACEMENT_CLEARANCE));
  });
  if (fits(0, 0)) return rects.map((rect) => ({ ...rect }));
  for (let radius = 1; radius <= 32; radius += 1) {
    const candidates: [number, number][] = [];
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) === radius) candidates.push([x * PLACEMENT_SEARCH_STEP, y * PLACEMENT_SEARCH_STEP]);
      }
    }
    candidates.sort((left, right) => Math.hypot(...left) - Math.hypot(...right) || right[0] - left[0] || right[1] - left[1]);
    const offset = candidates.find(([dx, dy]) => fits(dx, dy));
    if (offset) return rects.map((rect) => ({ ...rect, x: rect.x + offset[0], y: rect.y + offset[1] }));
  }
  return rects.map((rect) => ({ ...rect }));
}

function rectsOverlap(left: WorktableRect, right: WorktableRect, gap = 0): boolean {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function copyDraft(draft: WorktableDraft): WorktableDraft {
  const placements = Object.fromEntries(
    Object.entries(draft.placements).map(([photoId, placement]) => [photoId, { ...placement }]),
  ) as Record<WorktableItemId, WorktablePlacement>;
  const pilePlacements = Object.fromEntries(
    Object.entries(draft.pilePlacements).map(([sequenceId, placement]) => [sequenceId, { ...placement }]),
  ) as Record<SequenceId, WorktableSequencePilePlacement>;
  return {
    ...draft,
    ...(draft.memos ? { memos: draft.memos.map((memo) => ({ ...memo, photoIds: [...memo.photoIds] })) } : {}),
    entryOrder: [...draft.entryOrder],
    placements,
    groups: draft.groups.map((group) => ({ ...group, photoIds: [...group.photoIds] })),
    links: draft.links.map((link) => ({ ...link, photoIds: [...link.photoIds] })),
    pileOrder: [...draft.pileOrder],
    pilePlacements,
  };
}

function placeholderFilename(photoId: PhotoId): string {
  const token = photoId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `Photo ${token || "UNKNOWN"} (filename unavailable)`;
}
