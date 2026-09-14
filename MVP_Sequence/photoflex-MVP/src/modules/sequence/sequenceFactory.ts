import type {
  PhotoId,
  ProjectId,
  ReadingUnit,
  ReadingUnitId,
  SequenceDocument,
  SequenceId,
  SequenceItem,
  SequenceItemId,
  SequenceRevision,
  SequenceSegment,
  SequenceSegmentId,
  SequenceVersion,
  VersionId,
} from "../../contracts";

export type InitialSequenceContent =
  | { readonly kind: "photos"; readonly photoIds: readonly PhotoId[] }
  | { readonly kind: "sequence"; readonly sequence: SequenceDocument };

export interface InitialSequenceInput {
  readonly projectId: ProjectId;
  readonly name: string;
  readonly content: InitialSequenceContent;
}

export interface InitialSequenceBundle {
  readonly sequence: SequenceDocument;
  readonly initialVersion: SequenceVersion;
}

/** Creates a new Sequence aggregate, including remapped internal references. */
export function createInitialSequenceBundle(input: InitialSequenceInput): InitialSequenceBundle {
  const { items, readingUnits, segments } = input.content.kind === "photos"
    ? contentFromPhotos(input.content.photoIds)
    : contentFromSequence(input.content.sequence);
  const createdAt = new Date().toISOString();
  const sequenceId = newId<SequenceId>("sequence");
  const versionId = newId<VersionId>("version");
  const sequence: SequenceDocument = {
    id: sequenceId,
    projectId: input.projectId,
    name: input.name,
    items,
    segments,
    readingUnits,
    currentVersionId: versionId,
    revision: 0 as SequenceRevision,
    createdAt,
    updatedAt: createdAt,
  };
  return {
    sequence,
    initialVersion: {
      id: versionId,
      projectId: input.projectId,
      sequenceId,
      name: `Initial · ${input.name}`,
      itemCount: items.length,
      items,
      segments,
      readingUnits,
      createdAt,
    },
  };
}

function contentFromPhotos(photoIds: readonly PhotoId[]) {
  const items: readonly SequenceItem[] = photoIds.map((photoId) => ({
    id: newId<SequenceItemId>("item"),
    kind: "photo",
    photoId,
  }));
  const readingUnits: readonly ReadingUnit[] = items.map((item) => ({
    id: newId<ReadingUnitId>("unit"),
    kind: "single",
    itemId: item.id,
  }));
  return { items, readingUnits, segments: [] as readonly SequenceSegment[] };
}

function contentFromSequence(source: SequenceDocument) {
  const itemIds = new Map<SequenceItemId, SequenceItemId>();
  const items: readonly SequenceItem[] = source.items.map((item) => {
    const id = newId<SequenceItemId>("item");
    itemIds.set(item.id, id);
    return item.kind === "photo" ? { id, kind: "photo", photoId: item.photoId } : item.kind === "text" ? { id, kind: "text", text: item.text, fontSize: item.fontSize, ...(item.html ? { html: item.html } : {}) } : { id, kind: "blank" };
  });
  const mappedItemId = (id: SequenceItemId) => {
    const mapped = itemIds.get(id);
    if (!mapped) throw new Error(`Sequence references missing item ${id}`);
    return mapped;
  };
  const readingUnits: readonly ReadingUnit[] = source.readingUnits.map((unit) => unit.kind === "spread"
    ? { id: newId<ReadingUnitId>("unit"), kind: "spread", leftItemId: mappedItemId(unit.leftItemId), rightItemId: mappedItemId(unit.rightItemId) }
    : { id: newId<ReadingUnitId>("unit"), kind: unit.kind, itemId: mappedItemId(unit.itemId) });
  const segments: readonly SequenceSegment[] = source.segments.map((segment) => ({
    id: newId<SequenceSegmentId>("segment"),
    name: segment.name,
    itemIds: segment.itemIds.map(mappedItemId),
  }));
  return { items, readingUnits, segments };
}

function newId<T extends string>(prefix: string): T {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}` as T;
}
