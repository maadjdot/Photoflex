import type {
  PhotoId,
  SequenceDocument,
  SequenceStructureDiff,
  SequenceSummary,
} from "../../contracts";
import { isPhotoSequenceItem } from "../../contracts";

export const PILE_PREVIEW_LIMIT = 6;

export function toSequenceSummary(sequence: SequenceDocument): SequenceSummary {
  const photos = sequence.items.filter(isPhotoSequenceItem);
  return {
    id: sequence.id,
    projectId: sequence.projectId,
    name: sequence.name,
    itemCount: sequence.items.length,
    photoCount: photos.length,
    previewPhotoIds: photos.slice(0, PILE_PREVIEW_LIMIT).map((item) => item.photoId),
    updatedAt: sequence.updatedAt,
  };
}

export function compareSequences(left: SequenceDocument, right: SequenceDocument): SequenceStructureDiff {
  const leftItems = left.items.filter(isPhotoSequenceItem);
  const rightItems = right.items.filter(isPhotoSequenceItem);
  const leftPositions = new Map<PhotoId, number>();
  const rightPositions = new Map<PhotoId, number>();
  leftItems.forEach((item, index) => { if (!leftPositions.has(item.photoId)) leftPositions.set(item.photoId, index); });
  rightItems.forEach((item, index) => { if (!rightPositions.has(item.photoId)) rightPositions.set(item.photoId, index); });
  return {
    leftSequenceId: left.id,
    rightSequenceId: right.id,
    leftOnly: leftItems.map((item) => item.photoId).filter((photoId) => !rightPositions.has(photoId)),
    rightOnly: rightItems.map((item) => item.photoId).filter((photoId) => !leftPositions.has(photoId)),
    shared: leftItems.flatMap((item, leftIndex) => {
      const rightIndex = rightPositions.get(item.photoId);
      return rightIndex === undefined ? [] : [{ photoId: item.photoId, leftIndex, rightIndex, moved: leftIndex !== rightIndex }];
    }),
  };
}
