import {
  err,
  ok,
  type BackupError,
  type CorruptDataError,
  type CreateProjectError,
  type CreateProjectInput,
  type DeleteError,
  type LoadError,
  type ProjectId,
  type ProjectStore,
  type ProjectSummary,
  type ProjectWorkspace,
  type Result,
  type SaveError,
  type SequenceVersion,
  type StorageAccessError,
  type VersionId,
  type VersionSummary,
  type VersionWriteError,
  type WorkspaceRevision,
} from "../../contracts";
import {
  clone,
  createBackup,
  createWorkspace,
  isWorkspace,
  toProjectSummary,
  toVersionSummary,
  validateVersionForProject,
} from "../projectStoreData";
import { openPhotoFlexDatabase, STORE_NAMES } from "./indexedDbSchema";

interface IndexedDbProjectStoreOptions {
  readonly indexedDB?: IDBFactory;
  readonly databaseName?: string;
  readonly onBlocked?: () => void;
  readonly onVersionChange?: () => void;
}

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const isQuotaError = (error: DOMException | null) => error?.name === "QuotaExceededError";

export class IndexedDbProjectStore implements ProjectStore {
  private constructor(
    private readonly database: Promise<Result<IDBDatabase, StorageAccessError>>,
  ) {}

  static open(options: IndexedDbProjectStoreOptions = {}): IndexedDbProjectStore {
    return new IndexedDbProjectStore(openPhotoFlexDatabase(options));
  }

  async close(): Promise<void> {
    const opened = await this.database;
    if (opened.ok) opened.value.close();
  }

  async listProjects(): Promise<Result<readonly ProjectSummary[], CorruptDataError | StorageAccessError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const transaction = opened.value.transaction(STORE_NAMES.projects, "readonly");
      const records = await requestValue<unknown[]>(
        transaction.objectStore(STORE_NAMES.projects).getAll(),
      );
      const corrupt = records.find((record) => !isWorkspace(record));
      if (corrupt) return err({ kind: "corrupt-data", entityId: "unknown-project" });
      return ok(
        records
          .filter(isWorkspace)
          .map(toProjectSummary)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      );
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async createProject(
    input: CreateProjectInput,
  ): Promise<Result<ProjectWorkspace, CreateProjectError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const workspace = createWorkspace(input);

    return new Promise((resolve) => {
      const transaction = opened.value.transaction(STORE_NAMES.projects, "readwrite");
      const store = transaction.objectStore(STORE_NAMES.projects);
      let result: Result<ProjectWorkspace, CreateProjectError> = ok(workspace);
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        resolve(
          isQuotaError(transaction.error)
            ? err({ kind: "quota-exceeded" })
            : err({ kind: "unavailable", retryable: true }),
        );

      const existing = store.get(input.id);
      existing.onsuccess = () => {
        if (existing.result) {
          result = err({ kind: "project-id-exists", projectId: input.id });
        } else {
          store.add(clone(workspace));
        }
      };
    });
  }

  async loadWorkspace(projectId: ProjectId): Promise<Result<ProjectWorkspace, LoadError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const transaction = opened.value.transaction(STORE_NAMES.projects, "readonly");
      const workspace = await requestValue<ProjectWorkspace | undefined>(
        transaction.objectStore(STORE_NAMES.projects).get(projectId),
      );
      if (!workspace) return err({ kind: "not-found", entity: "project", id: projectId });
      if (!isWorkspace(workspace)) return err({ kind: "corrupt-data", entityId: projectId });
      return ok(clone(workspace));
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async saveWorkspace(
    workspace: ProjectWorkspace,
    expectedRevision: WorkspaceRevision,
  ): Promise<Result<{ readonly revision: WorkspaceRevision }, SaveError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;

    return new Promise((resolve) => {
      const transaction = opened.value.transaction(STORE_NAMES.projects, "readwrite");
      const store = transaction.objectStore(STORE_NAMES.projects);
      let result: Result<{ readonly revision: WorkspaceRevision }, SaveError> = err({
        kind: "unavailable",
        retryable: true,
      });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        resolve(
          isQuotaError(transaction.error)
            ? err({ kind: "quota-exceeded" })
            : err({ kind: "unavailable", retryable: true }),
        );

      const read = store.get(workspace.projectId);
      read.onsuccess = () => {
        const current = read.result as ProjectWorkspace | undefined;
        if (!current) {
          result = err({ kind: "not-found", entity: "project", id: workspace.projectId });
          return;
        }
        if (current.revision !== expectedRevision) {
          result = err({
            kind: "conflict",
            expectedRevision,
            actualRevision: current.revision,
          });
          return;
        }
        const revision = (expectedRevision + 1) as WorkspaceRevision;
        store.put(clone({ ...workspace, revision }));
        result = ok({ revision });
      };
    });
  }

  async createVersion(
    projectId: ProjectId,
    expectedRevision: WorkspaceRevision,
    version: SequenceVersion,
  ): Promise<
    Result<{ readonly summary: VersionSummary; readonly revision: WorkspaceRevision }, VersionWriteError>
  > {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const validation = validateVersionForProject(projectId, version);
    if (!validation.ok) return err(validation.error);

    return new Promise((resolve) => {
      const transaction = opened.value.transaction(
        [STORE_NAMES.projects, STORE_NAMES.versions],
        "readwrite",
      );
      const projects = transaction.objectStore(STORE_NAMES.projects);
      const versions = transaction.objectStore(STORE_NAMES.versions);
      let result: Result<
        { readonly summary: VersionSummary; readonly revision: WorkspaceRevision },
        VersionWriteError
      > = err({ kind: "unavailable", retryable: true });

      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        resolve(
          isQuotaError(transaction.error)
            ? err({ kind: "quota-exceeded" })
            : err({ kind: "unavailable", retryable: true }),
        );

      const projectRequest = projects.get(projectId);
      projectRequest.onsuccess = () => {
        const workspace = projectRequest.result as ProjectWorkspace | undefined;
        if (!workspace) {
          result = err({ kind: "not-found", entity: "project", id: projectId });
          return;
        }
        if (workspace.revision !== expectedRevision) {
          result = err({
            kind: "conflict",
            expectedRevision,
            actualRevision: workspace.revision,
          });
          return;
        }
        const versionRequest = versions.get(version.id);
        versionRequest.onsuccess = () => {
          if (versionRequest.result) {
            result = err({ kind: "version-id-exists", versionId: version.id });
            return;
          }
          const revision = (expectedRevision + 1) as WorkspaceRevision;
          versions.add(clone(version));
          projects.put(
            clone({
              ...workspace,
              versionIds: [...workspace.versionIds, version.id],
              revision,
              updatedAt: version.createdAt,
            }),
          );
          result = ok({ summary: toVersionSummary(version), revision });
        };
      };
    });
  }

  async listVersions(projectId: ProjectId): Promise<Result<readonly VersionSummary[], LoadError>> {
    const workspace = await this.loadWorkspace(projectId);
    if (!workspace.ok) return workspace;
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const transaction = opened.value.transaction(STORE_NAMES.versions, "readonly");
      const versions = await requestValue<SequenceVersion[]>(
        transaction.objectStore(STORE_NAMES.versions).index("by-project-id").getAll(projectId),
      );
      const byId = new Map(versions.map((version) => [version.id, version]));
      const summaries: VersionSummary[] = [];
      for (const versionId of workspace.value.versionIds) {
        const version = byId.get(versionId);
        if (!version) return err({ kind: "corrupt-data", entityId: versionId });
        summaries.push(toVersionSummary(version));
      }
      return ok(summaries);
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async loadVersion(versionId: VersionId): Promise<Result<SequenceVersion, LoadError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    try {
      const transaction = opened.value.transaction(STORE_NAMES.versions, "readonly");
      const version = await requestValue<SequenceVersion | undefined>(
        transaction.objectStore(STORE_NAMES.versions).get(versionId),
      );
      return version
        ? ok(clone(version))
        : err({ kind: "not-found", entity: "version", id: versionId });
    } catch {
      return err({ kind: "unavailable", retryable: true });
    }
  }

  async deleteProject(projectId: ProjectId): Promise<Result<void, DeleteError>> {
    const opened = await this.database;
    if (!opened.ok) return opened;
    const loaded = await this.loadWorkspace(projectId);
    if (!loaded.ok) {
      return err(loaded.error);
    }

    return new Promise((resolve) => {
      const transaction = opened.value.transaction(
        [STORE_NAMES.projects, STORE_NAMES.versions],
        "readwrite",
      );
      transaction.oncomplete = () => resolve(ok(undefined));
      transaction.onabort = () => resolve(err({ kind: "unavailable", retryable: true }));
      transaction.objectStore(STORE_NAMES.projects).delete(projectId);
      const versions = transaction.objectStore(STORE_NAMES.versions);
      for (const versionId of loaded.value.versionIds) versions.delete(versionId);
    });
  }

  async exportBackup(projectId: ProjectId): Promise<Result<Uint8Array, LoadError>> {
    const workspace = await this.loadWorkspace(projectId);
    if (!workspace.ok) return workspace;
    const versions: SequenceVersion[] = [];
    for (const versionId of workspace.value.versionIds) {
      const loaded = await this.loadVersion(versionId);
      if (!loaded.ok) return loaded;
      versions.push(loaded.value);
    }
    return ok(new TextEncoder().encode(JSON.stringify(createBackup(workspace.value, versions))));
  }

  async importBackup(_bytes: Uint8Array): Promise<Result<ProjectId, BackupError>> {
    return err({ kind: "unavailable", retryable: false });
  }
}
