import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, type ProjectBackupV1 } from "../../src/contracts";

export function backupFixture(): ProjectBackupV1 {
  const items = [{ id: "i1", kind: "photo", photoId: "p1" }, { id: "i2", kind: "photo", photoId: "p2" }, { id: "i3", kind: "blank" }, { id: "i4", kind: "photo", photoId: "p1" }];
  const readingUnits = [{ id: "u1", kind: "spread", leftItemId: "i1", rightItemId: "i2" }, { id: "u2", kind: "blank", itemId: "i3" }, { id: "u3", kind: "single", itemId: "i4" }];
  const segments = [{ id: "segment", name: "Opening", itemIds: ["i1", "i2"] }];
  const createdAt = "2026-09-09T00:00:00.000Z";
  return {
    format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: createdAt, appVersion: "0.1.0",
    project: { schemaVersion: 7, projectId: "project", name: "Street", memo: "Project memo", expectedPhotoCount: 12, sources: [{ id: "source", displayName: "Photos", createdAt }], photoStates: { p1: { decision: "pick", pinned: true } }, coverPhotoId: "p1", sequenceIds: ["sequence"], versionIds: ["v1", "v2"], revision: 4, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt,
      worktableDraft: { projectId: "project", entryOrder: ["p1", "p2"], placements: { p1: { photoId: "p1", filename: "one.jpg", x: 10, y: 20, z: 1, width: 180, height: 120 }, p2: { photoId: "p2", filename: "two.jpg", x: 210, y: 20, z: 2, width: 180, height: 120 } }, groups: [{ id: "group", name: "Pair", photoIds: ["p1", "p2"] }], links: [{ id: "link", name: "Rhythm", photoIds: ["p1", "p2"] }], memos: [{ id: "memo", text: "Opening idea", x: 10, y: 200, width: 200, height: 100, fontSize: 16, photoIds: ["p1"] }], pileOrder: ["sequence"], pilePlacements: { sequence: { sequenceId: "sequence", x: 450, y: 20, width: 211, height: 142, z: 3 } } } },
    sequences: [{ id: "sequence", projectId: "project", name: "Edit", items, readingUnits, segments, currentVersionId: "v2", revision: 3, createdAt, updatedAt: createdAt }],
    versions: ["v1", "v2"].map((id) => ({ id, projectId: "project", sequenceId: "sequence", parentVersionId: id === "v2" ? "v1" : undefined, name: id, items, itemCount: 4, readingUnits, segments, createdAt })),
    layouts: [],
    photoManifest: [{ sourceId: "source", photoId: "p1", relativePath: "one.jpg", width: 1200, height: 800 }, { sourceId: "source", photoId: "p2", relativePath: "two.jpg", width: 1200, height: 800 }],
  } as unknown as ProjectBackupV1;
}

export const backupBytes = (backup: unknown = backupFixture()) => new TextEncoder().encode(JSON.stringify(backup));
