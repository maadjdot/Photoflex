import type { WorktableDraft, WorktableItemId, WorktablePlacement, WorktablePoint } from "../../contracts";

export type AlignmentAxis = "x" | "y";

export interface AlignmentLineGuide {
  readonly kind: "alignment";
  readonly axis: AlignmentAxis;
  readonly value: number;
  readonly from: number;
  readonly to: number;
}

export interface EqualSpacingGuide {
  readonly kind: "spacing";
  readonly axis: AlignmentAxis;
  readonly first: number;
  readonly middleStart: number;
  readonly middleEnd: number;
  readonly last: number;
  readonly cross: number;
  readonly distance: number;
}

export type AlignmentGuide = AlignmentLineGuide | EqualSpacingGuide;

export interface AlignmentPreview {
  readonly delta: WorktablePoint;
  readonly guides: readonly AlignmentGuide[];
}

export interface AlignmentPreviewInput {
  readonly draft: WorktableDraft;
  readonly movingIds: readonly WorktableItemId[];
  readonly delta: WorktablePoint;
  readonly zoom: number;
  readonly referenceIds?: readonly WorktableItemId[];
}

const SNAP_DISTANCE_PX = 8;
const MIN_ROW_OVERLAP = 0.35;

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

interface Candidate {
  readonly distance: number;
  readonly value: number;
  readonly guide: AlignmentLineGuide;
}

interface SpacingCandidate {
  readonly distance: number;
  readonly value: number;
  readonly guide: EqualSpacingGuide;
}

export function calculateAlignmentPreview({ draft, movingIds, delta, zoom, referenceIds }: AlignmentPreviewInput): AlignmentPreview {
  const movingPlacements = movingIds
    .map((id) => draft.placements[id])
    .filter((placement): placement is WorktablePlacement => Boolean(placement));
  if (!movingPlacements.length) return { delta, guides: [] };

  const movingBounds = translateBounds(boundsFor(movingPlacements), delta);
  const movingSet = new Set(movingIds);
  const allowedReferences = referenceIds ? new Set(referenceIds) : undefined;
  const references = draft.entryOrder
    .filter((id) => !movingSet.has(id) && (allowedReferences?.has(id) ?? true))
    .map((id) => ({ id, placement: draft.placements[id] }))
    .filter((item): item is { readonly id: WorktableItemId; readonly placement: WorktablePlacement } => Boolean(item.placement));
  if (!references.length) return { delta, guides: [] };

  const snapDistance = SNAP_DISTANCE_PX / Math.max(0.1, zoom);
  const xAlignment = nearestAlignmentCandidate(movingBounds, references, "x", snapDistance);
  const yAlignment = nearestAlignmentCandidate(movingBounds, references, "y", snapDistance);
  let nextDelta = { ...delta };
  const guides: AlignmentGuide[] = [];
  if (xAlignment) {
    nextDelta.x += xAlignment.value;
    guides.push(xAlignment.guide);
  }
  if (yAlignment) {
    nextDelta.y += yAlignment.value;
    guides.push(yAlignment.guide);
  }

  const snappedBounds = translateBounds(boundsFor(movingPlacements), nextDelta);
  if (!xAlignment) {
    const spacing = nearestSpacingCandidate(snappedBounds, references, "x", snapDistance);
    if (spacing) {
      nextDelta.x += spacing.value;
      guides.push(spacing.guide);
    }
  }
  if (!yAlignment) {
    const spacing = nearestSpacingCandidate(snappedBounds, references, "y", snapDistance);
    if (spacing) {
      nextDelta.y += spacing.value;
      guides.push(spacing.guide);
    }
  }

  return {
    delta: nextDelta,
    guides: guides.map((guide) => translateGuide(guide, { x: nextDelta.x - delta.x, y: nextDelta.y - delta.y })),
  };
}

function nearestAlignmentCandidate(
  moving: Bounds,
  references: readonly { readonly id: WorktableItemId; readonly placement: WorktablePlacement }[],
  axis: AlignmentAxis,
  maxDistance: number,
): Candidate | undefined {
  const candidates: Candidate[] = [];
  references.forEach(({ placement }) => {
    const reference = boundsFor([placement]);
    if (axis === "x") {
      candidates.push(
        alignmentCandidate(reference.left - moving.left, reference.left, moving, reference, axis),
        alignmentCandidate(reference.centerX - moving.centerX, reference.centerX, moving, reference, axis),
        alignmentCandidate(reference.right - moving.right, reference.right, moving, reference, axis),
      );
    } else {
      candidates.push(
        alignmentCandidate(reference.top - moving.top, reference.top, moving, reference, axis),
        alignmentCandidate(reference.centerY - moving.centerY, reference.centerY, moving, reference, axis),
        alignmentCandidate(reference.bottom - moving.bottom, reference.bottom, moving, reference, axis),
      );
    }
  });
  return candidates
    .filter((candidate) => Math.abs(candidate.distance) <= maxDistance)
    .sort((left, right) => Math.abs(left.distance) - Math.abs(right.distance) || left.value - right.value)[0];
}

function alignmentCandidate(
  distance: number,
  value: number,
  moving: Bounds,
  reference: Bounds,
  axis: AlignmentAxis,
): Candidate {
  return {
    distance,
    value: distance,
    guide: axis === "x"
      ? { kind: "alignment", axis, value, from: Math.min(moving.top, reference.top), to: Math.max(moving.bottom, reference.bottom) }
      : { kind: "alignment", axis, value, from: Math.min(moving.left, reference.left), to: Math.max(moving.right, reference.right) },
  };
}

function nearestSpacingCandidate(
  moving: Bounds,
  references: readonly { readonly id: WorktableItemId; readonly placement: WorktablePlacement }[],
  axis: AlignmentAxis,
  maxDistance: number,
): SpacingCandidate | undefined {
  const pairs: Array<[Bounds, Bounds]> = [];
  for (let leftIndex = 0; leftIndex < references.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < references.length; rightIndex += 1) {
      const left = boundsFor([references[leftIndex].placement]);
      const right = boundsFor([references[rightIndex].placement]);
      const first = axis === "x" ? (left.left <= right.left ? left : right) : (left.top <= right.top ? left : right);
      const second = first === left ? right : left;
      if (axis === "x" ? !sameRow(left, right) : !sameColumn(left, right)) continue;
      if ((axis === "x" && second.left <= first.right) || (axis === "y" && second.top <= first.bottom)) continue;
      pairs.push([first, second]);
    }
  }

  const candidates: SpacingCandidate[] = [];
  pairs.forEach(([first, second]) => {
    if (axis === "x") {
      const available = second.left - first.right;
      if (available < moving.width) return;
      const distance = (available - moving.width) / 2;
      const targetLeft = first.right + distance;
      const delta = targetLeft - moving.left;
      candidates.push({
        distance: delta,
        value: delta,
        guide: { kind: "spacing", axis, first: first.right, middleStart: targetLeft, middleEnd: targetLeft + moving.width, last: second.left, cross: (moving.centerY + first.centerY + second.centerY) / 3, distance },
      });
    } else {
      const available = second.top - first.bottom;
      if (available < moving.height) return;
      const distance = (available - moving.height) / 2;
      const targetTop = first.bottom + distance;
      const delta = targetTop - moving.top;
      candidates.push({
        distance: delta,
        value: delta,
        guide: { kind: "spacing", axis, first: first.bottom, middleStart: targetTop, middleEnd: targetTop + moving.height, last: second.top, cross: (moving.centerX + first.centerX + second.centerX) / 3, distance },
      });
    }
  });
  return candidates
    .filter((candidate) => Math.abs(candidate.distance) <= maxDistance)
    .sort((left, right) => Math.abs(left.distance) - Math.abs(right.distance) || left.value - right.value)[0];
}

function sameRow(left: Bounds, right: Bounds): boolean {
  return overlapRatio(left.top, left.bottom, right.top, right.bottom, Math.min(left.height, right.height)) >= MIN_ROW_OVERLAP;
}

function sameColumn(left: Bounds, right: Bounds): boolean {
  return overlapRatio(left.left, left.right, right.left, right.right, Math.min(left.width, right.width)) >= MIN_ROW_OVERLAP;
}

function overlapRatio(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number, denominator: number): number {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart)) / denominator;
}

function boundsFor(placements: readonly WorktablePlacement[]): Bounds {
  const left = Math.min(...placements.map((item) => item.x));
  const top = Math.min(...placements.map((item) => item.y));
  const right = Math.max(...placements.map((item) => item.x + item.width));
  const bottom = Math.max(...placements.map((item) => item.y + item.height));
  return { left, top, right, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function translateBounds(bounds: Bounds, delta: WorktablePoint): Bounds {
  return { ...bounds, left: bounds.left + delta.x, right: bounds.right + delta.x, top: bounds.top + delta.y, bottom: bounds.bottom + delta.y, centerX: bounds.centerX + delta.x, centerY: bounds.centerY + delta.y };
}

function translateGuide(guide: AlignmentGuide, delta: WorktablePoint): AlignmentGuide {
  if (guide.kind === "alignment") {
    return guide.axis === "x"
      ? { ...guide, from: guide.from + delta.y, to: guide.to + delta.y }
      : { ...guide, from: guide.from + delta.x, to: guide.to + delta.x };
  }
  return guide.axis === "x"
    ? { ...guide, cross: guide.cross + delta.y }
    : { ...guide, cross: guide.cross + delta.x };
}
