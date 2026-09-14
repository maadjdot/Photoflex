import type {
  SequenceId,
  WorktableItemId,
  WorktableDraft,
  WorktableGroup,
  WorktableLink,
} from "../contracts";

export interface TableActionState {
  readonly photoIds: readonly WorktableItemId[];
  readonly pileIds: readonly SequenceId[];
  readonly completeGroup?: WorktableGroup;
  readonly memberGroup?: WorktableGroup;
  readonly selectedGroup?: WorktableGroup;
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
  const pileIds = draft.pileOrder.filter((id) => selectedPileIds.has(id));
  const completeGroup = draft.groups.find((group) => (
    group.photoIds.length === photoIds.length
    && group.photoIds.every((id) => selectedPhotoIds.has(id))
  ));
  const memberGroup = photoIds.length === 1
    ? draft.groups.find((group) => group.photoIds.includes(photoIds[0]))
    : undefined;
  const selectedGroup = photoIds.length > 0
    ? draft.groups.find((group) => photoIds.every((id) => group.photoIds.includes(id)))
    : undefined;
  const matchingLinks = photoIds.length > 0
    ? draft.links.filter((link) => photoIds.every((id) => link.photoIds.includes(id)))
    : [];
  const selectedLink = matchingLinks.find((link) => link.photoIds.length === photoIds.length)
    ?? (matchingLinks.length === 1 ? matchingLinks[0] : undefined);
  const canComparePhotos = photoIds.length === 2 && pileIds.length === 0;
  const canComparePiles = pileIds.length === 2 && photoIds.length === 0;
  const selectedCount = photoIds.length + pileIds.length;

  return {
    photoIds,
    pileIds,
    completeGroup,
    memberGroup,
    selectedGroup,
    matchingLinks,
    selectedLink,
    canGroup: photoIds.length >= 2 && photoIds.every((id) => !draft.groups.some((group) => group.photoIds.includes(id))),
    canJoinGroup: photoIds.length === 1 && !memberGroup && draft.groups.length > 0,
    canCreateLink: photoIds.length >= 2 && photoIds.length <= 6,
    canCompare: canComparePhotos || canComparePiles,
    compareKind: canComparePhotos ? "photos" : canComparePiles ? "sequences" : undefined,
    compareDisabledReason: selectedCount > 0 && !canComparePhotos && !canComparePiles
      ? "Compare requires exactly two photos or two Sequence piles."
      : undefined,
    canArrange: photoIds.length >= 2,
    canPreview: photoIds.length === 1 && pileIds.length === 0,
    canBringToFront: selectedCount > 0,
    canRemove: selectedCount > 0,
  };
}
