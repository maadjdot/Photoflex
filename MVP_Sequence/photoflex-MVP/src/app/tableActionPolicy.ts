import type {
  SequenceId,
  WorktableItemId,
  WorktableDraft,
  WorktableGroup,
  WorktableLink,
} from "../contracts";

export interface TableActionState {
  readonly photoIds: readonly WorktableItemId[];
  /** Selected photos that are allowed to participate in mutations. */
  readonly mutablePhotoIds: readonly WorktableItemId[];
  readonly lockedPhotoIds: readonly WorktableItemId[];
  readonly hasLockedPhoto: boolean;
  readonly pileIds: readonly SequenceId[];
  readonly completeGroup?: WorktableGroup;
  readonly memberGroup?: WorktableGroup;
  readonly memberGroupLocked: boolean;
  readonly selectedGroup?: WorktableGroup;
  readonly selectedGroupLocked: boolean;
  readonly matchingLinks: readonly WorktableLink[];
  readonly selectedLink?: WorktableLink;
  readonly canGroup: boolean;
  readonly canJoinGroup: boolean;
  readonly canCreateLink: boolean;
  readonly canCompare: boolean;
  readonly compareKind?: "photos" | "sequences";
  readonly compareDisabledReason?: string;
  readonly canArrange: boolean;
  readonly canPreview: boolean;
  readonly canBringToFront: boolean;
  readonly canRemove: boolean;
}

export function deriveTableActions(
  draft: WorktableDraft,
  selectedPhotoIds: ReadonlySet<WorktableItemId>,
  selectedPileIds: ReadonlySet<SequenceId>,
): TableActionState {
  const photoIds = draft.entryOrder.filter((id) => selectedPhotoIds.has(id));
  const lockedPhotoIds = photoIds.filter((id) => Boolean(draft.placements[id]?.locked));
  const mutablePhotoIds = photoIds.filter((id) => !draft.placements[id]?.locked);
  const hasLockedPhoto = lockedPhotoIds.length > 0;
  const pileIds = draft.pileOrder.filter((id) => selectedPileIds.has(id));
  const completeGroup = draft.groups.find((group) => (
    group.photoIds.length === mutablePhotoIds.length
    && group.photoIds.every((id) => mutablePhotoIds.includes(id))
  ));
  const memberGroup = mutablePhotoIds.length === 1
    ? draft.groups.find((group) => group.photoIds.includes(mutablePhotoIds[0]))
    : undefined;
  const memberGroupLocked = Boolean(memberGroup?.photoIds.some((id) => draft.placements[id]?.locked));
  const selectedGroup = mutablePhotoIds.length > 0
    ? draft.groups.find((group) => mutablePhotoIds.every((id) => group.photoIds.includes(id)))
    : undefined;
  const selectedGroupLocked = Boolean(selectedGroup?.photoIds.some((id) => draft.placements[id]?.locked));
  const matchingLinks = mutablePhotoIds.length > 0
    ? draft.links.filter((link) => !link.photoIds.some((id) => draft.placements[id]?.locked) && mutablePhotoIds.every((id) => link.photoIds.includes(id)))
    : [];
  const selectedLink = matchingLinks.find((link) => link.photoIds.length === mutablePhotoIds.length)
    ?? (matchingLinks.length === 1 ? matchingLinks[0] : undefined);
  const canComparePhotos = mutablePhotoIds.length === 2 && pileIds.length === 0;
  const canComparePiles = pileIds.length === 2 && photoIds.length === 0;
  const selectedCount = photoIds.length + pileIds.length;

  return {
    photoIds,
    mutablePhotoIds,
    lockedPhotoIds,
    hasLockedPhoto,
    pileIds,
    completeGroup,
    memberGroup,
    memberGroupLocked,
    selectedGroup,
    selectedGroupLocked,
    matchingLinks,
    selectedLink,
    canGroup: mutablePhotoIds.length >= 2 && mutablePhotoIds.every((id) => !draft.groups.some((group) => group.photoIds.includes(id))),
    canJoinGroup: mutablePhotoIds.length === 1 && !memberGroup && draft.groups.length > 0,
    canCreateLink: mutablePhotoIds.length >= 2 && mutablePhotoIds.length <= 6,
    canCompare: canComparePhotos || canComparePiles,
    compareKind: canComparePhotos ? "photos" : canComparePiles ? "sequences" : undefined,
    compareDisabledReason: selectedCount > 0 && !canComparePhotos && !canComparePiles
      ? "Compare requires exactly two photos or two Sequence piles."
      : undefined,
    canArrange: mutablePhotoIds.length >= 2,
    canPreview: mutablePhotoIds.length === 1 && pileIds.length === 0,
    canBringToFront: mutablePhotoIds.length > 0 || pileIds.length > 0,
    canRemove: mutablePhotoIds.length > 0 || pileIds.length > 0,
  };
}
