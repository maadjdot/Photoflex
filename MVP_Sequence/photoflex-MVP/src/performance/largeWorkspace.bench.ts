import { afterAll, bench, describe } from "vitest";
import type {
  PhotoId,
  ProjectId,
  ReadingUnit,
  ReadingUnitId,
  SequenceItem,
  SequenceItemId,
  SequenceDocument,
  SequenceId,
  SequenceRevision,
  SequenceVersion,
  VersionId,
  WorkspaceRevision,
  WorktableDraft,
} from "../contracts";
import { createSequenceLookup } from "../modules/sequence";
import { visibleWorktablePhotoIds } from "../modules/worktable";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";

const tableDraft = createTableDraft(10_000);
const sequence = createSequenceData(500);
const sequenceLookup = createSequenceLookup(sequence);
let storageBaselineBytes = 0;

describe("large workspace baseline", () => {
  bench("scan 10,000 Table placements for an 1,440×900 viewport", () => {
    visibleWorktablePhotoIds(tableDraft, { originX: -2_000, originY: -1_200, zoom: 0.75 }, { width: 1_440, height: 900 });
  });

  bench("build all lookup indexes for a 500-item Sequence", () => {
    createSequenceLookup(sequence);
  });

  bench("resolve every item in a 500-item Sequence through indexes", () => {
    for (const item of sequence.items) {
      sequenceLookup.itemIndexById.get(item.id);
      sequenceLookup.segmentByItemId.get(item.id);
      sequenceLookup.unitByItemId.get(item.id);
    }
  });

  bench("save and export 200 full versions × 500 Sequence items", async () => {
    storageBaselineBytes = await createVersionStorageBaseline();
  }, { iterations: 1, time: 0, warmupIterations: 0, warmupTime: 0 });
});

afterAll(() => {
  console.info(`200 × 500 backup size: ${storageBaselineBytes} bytes`);
});

function createTableDraft(count: number): WorktableDraft {
  const entryOrder: PhotoId[] = [];
  const placements: Record<string, WorktableDraft["placements"][PhotoId]> = {};
  for (let index = 0; index < count; index += 1) {
    const photoId = `benchmark-photo-${index}` as PhotoId;
    entryOrder.push(photoId);
    placements[photoId] = {
      photoId,
      x: (index % 100) * 240,
      y: Math.floor(index / 100) * 190,
      width: 200,
      height: 150,
      z: index,
      filename: `${index}.jpg`,
    };
  }
  return {
    projectId: "benchmark-project" as ProjectId,
    entryOrder,
    placements: placements as WorktableDraft["placements"],
    pileOrder: [],
    pilePlacements: {},
    links: [],
    groups: [],
  };
}

function createSequenceData(count: number): { items: readonly SequenceItem[]; segments: readonly []; readingUnits: readonly ReadingUnit[] } {
  const items: SequenceItem[] = [];
  const readingUnits: ReadingUnit[] = [];
  for (let index = 0; index < count; index += 1) {
    const itemId = `benchmark-item-${index}` as SequenceItemId;
    items.push({ id: itemId, kind: "photo", photoId: `benchmark-photo-${index}` as PhotoId });
    readingUnits.push({ id: `benchmark-unit-${index}` as ReadingUnitId, kind: "single", itemId });
  }
  return { items, segments: [], readingUnits };
}

async function createVersionStorageBaseline(): Promise<number> {
  const store = new MemoryProjectStore();
  const projectId = "storage-benchmark-project" as ProjectId;
  const sequenceId = "storage-benchmark-sequence" as SequenceId;
  const createdAt = "2026-09-08T00:00:00.000Z";
  const project = await store.createProject({ id: projectId, name: "Storage benchmark", createdAt });
  if (!project.ok) throw new Error("storage benchmark project creation failed");
  let workspaceRevision = project.value.revision;
  let sequenceRevision = 0 as SequenceRevision;
  const initialVersionId = "storage-version-0" as VersionId;
  let document: SequenceDocument = {
    id: sequenceId,
    projectId,
    name: "Storage benchmark",
    ...sequence,
    currentVersionId: initialVersionId,
    revision: sequenceRevision,
    createdAt,
    updatedAt: createdAt,
  };
  const initialVersion: SequenceVersion = {
    id: initialVersionId,
    projectId,
    sequenceId,
    name: "Version 0",
    itemCount: sequence.items.length,
    ...sequence,
    createdAt,
  };
  const createdSequence = await store.createSequence(projectId, workspaceRevision, document, initialVersion, project.value.worktableDraft);
  if (!createdSequence.ok) throw new Error("storage benchmark Sequence creation failed");
  workspaceRevision = createdSequence.value.revision;

  for (let index = 1; index < 200; index += 1) {
    const versionId = `storage-version-${index}` as VersionId;
    const updatedAt = new Date(Date.parse(createdAt) + index * 1_000).toISOString();
    const version: SequenceVersion = {
      id: versionId,
      projectId,
      sequenceId,
      name: `Version ${index}`,
      itemCount: sequence.items.length,
      ...sequence,
      createdAt: updatedAt,
    };
    const saved = await store.saveSequenceVersion({
      mode: "save-as",
      projectId,
      sequence: { ...document, currentVersionId: versionId, revision: sequenceRevision, updatedAt },
      version,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSequenceRevision: sequenceRevision,
    });
    if (!saved.ok) throw new Error(`storage benchmark version ${index} failed`);
    workspaceRevision = saved.value.workspaceRevision as WorkspaceRevision;
    sequenceRevision = saved.value.sequenceRevision;
    document = { ...document, currentVersionId: versionId, revision: sequenceRevision, updatedAt };
  }

  const backup = await store.exportBackup(projectId);
  if (!backup.ok) throw new Error("storage benchmark backup failed");
  return backup.value.byteLength;
}
