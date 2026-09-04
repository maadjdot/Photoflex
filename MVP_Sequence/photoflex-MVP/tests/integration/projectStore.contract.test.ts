import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectStore, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, SequenceRevision, SequenceVersion, VersionId } from "../../src/contracts";
import { createEmptyWorktable } from "../../src/modules/worktable";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";
import {
  createMemoryProjectDatabase,
  MemoryProjectStore,
} from "../../src/platform/memory/MemoryProjectStore";
import { PROJECT_ID, PROJECT_INPUT, VERSION } from "../helpers/fixtures";

interface StorePair {
  readonly first: ProjectStore;
  readonly second: ProjectStore;
  dispose(): Promise<void>;
}

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

const implementations: ReadonlyArray<{
  readonly name: string;
  create(): StorePair;
}> = [
  {
    name: "MemoryProjectStore",
    create: () => {
      const database = createMemoryProjectDatabase();
      return {
        first: new MemoryProjectStore(database),
        second: new MemoryProjectStore(database),
        async dispose() {},
      };
    },
  },
  {
    name: "IndexedDbProjectStore",
    create: () => {
      const databaseName = `photoflex-contract-${crypto.randomUUID()}`;
      const first = IndexedDbProjectStore.open({ databaseName });
      const second = IndexedDbProjectStore.open({ databaseName });
      return {
        first,
        second,
        async dispose() {
          await first.close();
          await second.close();
          await deleteDatabase(databaseName);
        },
      };
    },
  },
];

for (const implementation of implementations) {
  describe(implementation.name, () => {
    let stores: StorePair;

    beforeEach(() => {
      stores = implementation.create();
    });

    afterEach(async () => {
      await stores.dispose();
    });

    it("创建并读取 revision 为 0 的空项目", async () => {
      const created = await stores.first.createProject(PROJECT_INPUT);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value.revision).toBe(0);
      expect(created.value.sequenceIds).toEqual([]);

      const loaded = await stores.first.loadWorkspace(PROJECT_ID);
      expect(loaded).toEqual(created);
    });

    it("用 CAS 拒绝另一个实例的过期写入", async () => {
      await stores.first.createProject(PROJECT_INPUT);
      const firstRead = await stores.first.loadWorkspace(PROJECT_ID);
      const secondRead = await stores.second.loadWorkspace(PROJECT_ID);
      if (!firstRead.ok || !secondRead.ok) throw new Error("测试项目未创建");

      const firstSave = await stores.first.saveWorkspace(
        { ...firstRead.value, name: "第一个写入" },
        firstRead.value.revision,
      );
      expect(firstSave).toEqual({ ok: true, value: { revision: 1 } });

      const staleSave = await stores.second.saveWorkspace(
        { ...secondRead.value, name: "过期写入" },
        secondRead.value.revision,
      );
      expect(staleSave).toEqual({
        ok: false,
        error: { kind: "conflict", expectedRevision: 0, actualRevision: 1 },
      });

      const latest = await stores.first.loadWorkspace(PROJECT_ID);
      expect(latest.ok && latest.value.name).toBe("第一个写入");
    });

    it("通过独立 Interface 保存 Worktable 文档", async () => {
      const created = await stores.first.createProject(PROJECT_INPUT);
      if (!created.ok) throw new Error("测试项目未创建");
      const draft = { ...created.value.worktableDraft, groups: [] };
      const saved = await stores.first.saveWorktable(PROJECT_ID, draft, created.value.revision);
      expect(saved).toEqual({ ok: true, value: { revision: 1 } });
      const loaded = await stores.first.loadWorkspace(PROJECT_ID);
      expect(loaded.ok && loaded.value.worktableDraft).toEqual(draft);
    });

    it("原子创建版本并推进工作区 revision", async () => {
      const project = await stores.first.createProject(PROJECT_INPUT);
      if (!project.ok) throw new Error("测试项目未创建");
      const created = await stores.first.createVersion(
        PROJECT_ID,
        project.value.revision,
        VERSION,
      );
      expect(created.ok && created.value.revision).toBe(1);

      const workspace = await stores.first.loadWorkspace(PROJECT_ID);
      const versions = await stores.first.listVersions(PROJECT_ID);
      expect(workspace.ok && workspace.value.versionIds).toEqual([VERSION.id]);
      expect(versions.ok && versions.value.map(({ id }) => id)).toEqual([VERSION.id]);
    });

    it("原子创建 Sequence、Initial Version 与 Table membership", async () => {
      const project = await stores.first.createProject(PROJECT_INPUT);
      if (!project.ok) throw new Error("测试项目未创建");
      const now = "2026-09-01T08:00:00.000Z";
      const sequenceId = "sequence-1" as SequenceId;
      const versionId = "version-initial" as VersionId;
      const itemId = "item-1" as SequenceItemId;
      const unitId = "unit-1" as ReadingUnitId;
      const sequence: SequenceDocument = { id: sequenceId, projectId: PROJECT_ID, name: "Edit", items: [{ id: itemId, kind: "photo", photoId: "photo-1" as never }], segments: [], readingUnits: [{ id: unitId, kind: "single", itemId }], currentVersionId: versionId, revision: 0 as SequenceRevision, createdAt: now, updatedAt: now };
      const version: SequenceVersion = { id: versionId, projectId: PROJECT_ID, sequenceId, name: "Initial · Edit", itemCount: 1, items: sequence.items, segments: [], readingUnits: sequence.readingUnits, createdAt: now };
      const table = createEmptyWorktable(PROJECT_ID);
      const created = await stores.first.createSequence(PROJECT_ID, project.value.revision, sequence, version, table);
      expect(created.ok).toBe(true);
      const workspace = await stores.first.loadWorkspace(PROJECT_ID);
      expect(workspace.ok && workspace.value.sequenceIds).toEqual([sequenceId]);
      expect(workspace.ok && workspace.value.versionIds).toEqual([versionId]);
      expect((await stores.first.loadVersion(versionId)).ok).toBe(true);
    });
  });
}
