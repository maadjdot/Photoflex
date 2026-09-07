import {
  err,
  ok,
  type PhotoId,
  type Result,
  type WorktableCommandError,
  type WorktableDraft,
  type WorktableEditCommand,
  type WorktableEditor,
  type WorktableLayout,
  type WorktableLink,
  type WorktablePlacement,
  type WorktableSequencePilePlacement,
  type WorktableGroup,
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
  if (command.type === "place") return place(draft, command);
  if (command.type === "remove-group") return removeGroup(draft, command.groupId);
  if (command.type === "remove-link") return removeLink(draft, command.linkId);
  if (command.type === "add-to-group") return addToGroup(draft, command.groupId, command.photoId);
  if (command.type === "remove-from-group") return removeFromGroup(draft, command.photoId);
  if (command.type === "place-sequence-pile") return placeSequencePile(draft, command.placement);
  if (command.type === "move-sequence-piles") return moveSequencePiles(draft, command.sequenceIds, command.by.x, command.by.y);
  if (command.type === "resize-sequence-pile") return resizeSequencePile(draft, command.sequenceId, command.scale);
  if (command.type === "bring-sequence-piles-to-front") return bringSequencePilesToFront(draft, command.sequenceIds);
  if (command.type === "remove-sequence-piles") return removeSequencePiles(draft, command.sequenceIds);
  const validation = validateKnown(draft, command.photoIds);
  if (!validation.ok) return validation;
  if (command.type === "move") return move(draft, command.photoIds, command.by.x, command.by.y);
  if (command.type === "resize") return resize(draft, command.photoIds, command.scale);
  if (command.type === "arrange") return arrange(draft, command.photoIds, command.layout);
  if (command.type === "create-group") return createGroup(draft, command.photoIds);
  if (command.type === "create-link") return createLink(draft, command.photoIds);
  if (command.type === "bring-to-front") return bringToFront(draft, command.photoIds);
  return remove(draft, command.photoIds);
}

function createGroup(
  draft: WorktableDraft,
  photoIds: readonly PhotoId[],
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
  photoId: PhotoId,
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

function removeFromGroup(draft: WorktableDraft, photoId: PhotoId): Result<WorktableDraft, WorktableCommandError> {
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
  photoIds: readonly PhotoId[],
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
  photoIds: readonly PhotoId[],
  anchorX: number,
  anchorY: number,
  gap: number,
): WorktableDraft {
  const placements = { ...draft.placements } as Record<PhotoId, WorktablePlacement>;
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
  photoIds: readonly PhotoId[],
  originX: number,
  originY: number,
): WorktableDraft {
  const placements = { ...draft.placements } as Record<PhotoId, WorktablePlacement>;
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
  photoIds: readonly PhotoId[],
  scale: number,
): Result<WorktableDraft, WorktableCommandError> {
  if (!Number.isFinite(scale) || scale <= 0) return err({ kind: "invalid-coordinate" });
  if (Math.abs(scale - 1) < .0001) return ok(draft);
  const placements = { ...draft.placements } as Record<PhotoId, WorktablePlacement>;
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
  const seen = new Set<PhotoId>();
  for (const item of command.items) {
    if (seen.has(item.photoId)) return err({ kind: "duplicate-photo-id", photoId: item.photoId });
    seen.add(item.photoId);
    if (![item.width, item.height].every(isPositiveFinite)) return err({ kind: "invalid-coordinate" });
  }
  if (command.at && ![command.at.x, command.at.y].every(Number.isFinite)) {
    return err({ kind: "invalid-coordinate" });
  }

  const additions = command.items.filter((item) => !draft.placements[item.photoId]);
  if (!additions.length) return ok(draft);
  const placements = { ...draft.placements } as Record<PhotoId, WorktablePlacement>;
  const entryOrder = [...draft.entryOrder];
  const maxZ = maximumZ(draft);
  const origin = command.at ?? DEFAULT_ORIGIN;

  additions.forEach((item, offset) => {
    const index = command.at ? offset : entryOrder.length;
    placements[item.photoId] = {
      ...item,
      x: origin.x + (index % DEFAULT_COLUMNS) * DEFAULT_CELL_WIDTH,
      y: origin.y + Math.floor(index / DEFAULT_COLUMNS) * DEFAULT_CELL_HEIGHT,
      z: maxZ + offset + 1,
    };
    entryOrder.push(item.photoId);
  });
  return ok({ ...draft, placements, entryOrder });
}

function move(
  draft: WorktableDraft,
  photoIds: readonly PhotoId[],
  dx: number,
  dy: number,
): Result<WorktableDraft, WorktableCommandError> {
  if (![dx, dy].every(Number.isFinite)) return err({ kind: "invalid-coordinate" });
  if (!dx && !dy) return ok(draft);
  const placements = { ...draft.placements } as Record<PhotoId, WorktablePlacement>;
  for (const photoId of photoIds) {
    const current = placements[photoId];
    placements[photoId] = { ...current, x: current.x + dx, y: current.y + dy };
  }
  return ok({ ...draft, placements });
}

function arrange(
  draft: WorktableDraft,
  photoIds: readonly PhotoId[],
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
  const placements = { ...draft.placements } as Record<PhotoId, WorktablePlacement>;

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

function bringToFront(
  draft: WorktableDraft,
  photoIds: readonly PhotoId[],
): Result<WorktableDraft, WorktableCommandError> {
  const selected = new Set(photoIds);
  const ordered = draft.entryOrder.filter((photoId) => selected.has(photoId));
  const maxZ = maximumZ(draft);
  const alreadyTop = ordered.every((photoId, index) => draft.placements[photoId].z === maxZ - ordered.length + index + 1);
  if (alreadyTop) return ok(draft);
  const placements = { ...draft.placements } as Record<PhotoId, WorktablePlacement>;
  ordered.forEach((photoId, index) => {
    placements[photoId] = { ...placements[photoId], z: maxZ + index + 1 };
  });
  return ok({ ...draft, placements });
}

function remove(
  draft: WorktableDraft,
  photoIds: readonly PhotoId[],
): Result<WorktableDraft, WorktableCommandError> {
  if (!photoIds.length) return ok(draft);
  const removed = new Set(photoIds);
  const placements = { ...draft.placements } as Record<PhotoId, WorktablePlacement>;
  photoIds.forEach((photoId) => delete placements[photoId]);
  return ok({
    ...draft,
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
  photoIds: readonly PhotoId[],
): Result<true, WorktableCommandError> {
  const seen = new Set<PhotoId>();
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

function resizeSequencePile(draft: WorktableDraft, sequenceId: SequenceId, scale: number): Result<WorktableDraft, WorktableCommandError> {
  const pile = draft.pilePlacements[sequenceId];
  if (!pile || !Number.isFinite(scale) || scale <= 0) return err({ kind: "unknown-sequence-pile", sequenceId });
  const nextScale = Math.max(0.5, Math.min(2.5, scale));
  if (Math.abs(nextScale - 1) < 0.001) return ok(draft);
  const width = Math.max(120, pile.width * nextScale), height = Math.max(80, pile.height * nextScale);
  return ok({ ...draft, pilePlacements: { ...draft.pilePlacements, [sequenceId]: { ...pile, width, height, x: pile.x + (pile.width - width) / 2, y: pile.y + (pile.height - height) / 2 } } });
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
  return Math.max(-1, ...Object.values(draft.placements).map((item) => item.z), ...Object.values(draft.pilePlacements).map((item) => item.z));
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
  ) as Record<PhotoId, WorktablePlacement>;
  const pilePlacements = Object.fromEntries(
    Object.entries(draft.pilePlacements).map(([sequenceId, placement]) => [sequenceId, { ...placement }]),
  ) as Record<SequenceId, WorktableSequencePilePlacement>;
  return {
    ...draft,
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
