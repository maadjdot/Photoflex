import { err, ok, type ProjectId, type ProjectWorkspace, type Result, type StorageAccessError, type WorkspaceRevision } from "../../contracts";
import type { ResearchError, ResearchExtract, ResearchMaterial, ResearchMaterialSummary, ResearchNote, ResearchNoteSummary, ResearchRecord, ResearchResult, ResearchStore } from "../../contracts/research";
import { imagesIn, makeAnchor, resolveAnchor, textBlocks } from "../../modules/research/content";
import { createWorktableEditor } from "../../modules/worktable/worktableEditor";
import { isWorkspace } from "../projectStoreData";
import { STORE_NAMES } from "./indexedDbSchema";

const { research, projects, cloudSync } = STORE_NAMES;
type Row = ResearchRecord
  | ({ kind: "note-summary" } & ResearchNoteSummary)
  | ({ kind: "material-summary" } & ResearchMaterialSummary)
  | { kind: "note-search"; projectId: ProjectId; id: string; text: string };

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putNoteSummary(store: IDBObjectStore, { projectId, id, title, updatedAt, content }: ResearchNote) {
  const images = imagesIn(content);
  const photoIds = [...new Set(images.flatMap((image) => image.kind === "project" ? [image.id] : []))];
  const first = images[0];
  const cover = first && { id: first.id, kind: first.kind };
  store.put({ kind: "note-summary", projectId, id, title, updatedAt, photoIds, cover, imageCount: images.length } satisfies Row);
}

export function putResearchRecord(store: IDBObjectStore, row: ResearchRecord): void {
  store.put(row);
  if (row.kind === "note") {
    const { projectId, id } = row;
    if (row.deletedAt) {
      store.delete([projectId, "note-summary", id]);
      store.delete([projectId, "note-search", id]);
    } else {
      putNoteSummary(store, row);
      store.put({ kind: "note-search", projectId, id, text: textBlocks(row.content).map((block) => block.text).join("\n").toLocaleLowerCase() } satisfies Row);
    }
  } else if (row.kind === "material") {
    store.put({ kind: "material-summary", projectId: row.projectId, id: row.id, name: row.name } satisfies Row);
  }
}

export function projectResearchRows(transaction: IDBTransaction, projectId: ProjectId): Promise<ResearchRecord[]> {
  return read<Row[]>(transaction.objectStore(research).index("by-project").getAll(projectId))
    .then((rows) => rows.filter((row): row is ResearchRecord => row.kind === "note" || row.kind === "extract" || row.kind === "material"));
}

export function deleteResearchRows(transaction: IDBTransaction, projectId: ProjectId): void {
  const store = transaction.objectStore(research);
  const request = store.index("by-project").openKeyCursor(projectId);
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}

export function replaceResearchRows(transaction: IDBTransaction, projectId: ProjectId, rows: readonly ResearchRecord[]): void {
  const store = transaction.objectStore(research);
  const request = store.index("by-project").openKeyCursor(projectId);
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      store.delete(cursor.primaryKey);
      cursor.continue();
    } else rows.forEach((row) => putResearchRecord(store, row));
  };
}

function getRow<K extends Row["kind"]>(store: IDBObjectStore, projectId: ProjectId, kind: K, id: string): Promise<Extract<Row, { kind: K }> | undefined> {
  return read(store.get([projectId, kind, id]));
}

function listRows<K extends Row["kind"]>(store: IDBObjectStore, projectId: ProjectId, kind: K): Promise<Extract<Row, { kind: K }>[]> {
  return read(store.index("by-kind").getAll([projectId, kind]));
}

function sameVersion(current: ResearchNote | undefined, base: ResearchNote) {
  return current ? !current.deletedAt && current.version === base.version && current.updatedAt === base.updatedAt : base.version === 0;
}

export class IndexedDbResearchStore implements ResearchStore {
  constructor(
    private readonly database: Promise<Result<IDBDatabase, StorageAccessError>>,
    private readonly markCloudChange: (transaction: IDBTransaction, projectId: ProjectId) => void,
  ) {}

  private async access<T>(projectId: ProjectId, write: boolean, action: (store: IDBObjectStore, tx: IDBTransaction, workspace?: ProjectWorkspace) => Promise<Result<T, ResearchError>>): ResearchResult<T> {
    const opened = await this.database;
    if (!opened.ok) return err("unavailable");
    let tx: IDBTransaction | undefined;
    try {
      const transaction = opened.value.transaction(write ? [projects, research, cloudSync] : [projects, research], write ? "readwrite" : "readonly");
      tx = transaction;
      const committed = new Promise<boolean>((resolve) => {
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => resolve(false);
      });
      const projectStore = transaction.objectStore(projects);
      const workspace = write ? await read(projectStore.get(projectId)) : undefined;
      if (write ? !isWorkspace(workspace) || workspace.deletionPendingAt : !await read(projectStore.getKey(projectId))) return err("missing");
      const result = await action(transaction.objectStore(research), transaction, workspace);
      if (write && result.ok) this.markCloudChange(transaction, projectId);
      return await committed ? result : err("unavailable");
    } catch {
      try { tx?.abort(); } catch { /* The transaction has already closed. */ }
      return err("unavailable");
    }
  }

  listNotes: ResearchStore["listNotes"] = (projectId, query) => this.access(projectId, false, async (store) => {
    const term = query?.trim().toLocaleLowerCase();
    const [notes, matches] = await Promise.all([
      listRows(store, projectId, "note-summary"),
      term ? listRows(store, projectId, "note-search") : [],
    ]);
    const bodyIds = new Set(matches.filter(({ text }) => term && text.includes(term)).map(({ id }) => id));
    return ok(notes.filter((note) => !term || bodyIds.has(note.id) || note.title.toLocaleLowerCase().includes(term))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  });

  loadNote: ResearchStore["loadNote"] = (projectId, id) => this.access(projectId, false, async (store) => {
    const note = await getRow(store, projectId, "note", id);
    return note && !note.deletedAt ? ok(note) : err("missing");
  });

  saveNote: ResearchStore["saveNote"] = (note) => this.access(note.projectId, true, async (store) => {
    const current = await getRow(store, note.projectId, "note", note.id);
    if (!sameVersion(current, note)) return err("conflict");
    const saved: ResearchRecord = { ...note, kind: "note", version: note.version + 1, updatedAt: new Date().toISOString() };
    putResearchRecord(store, saved);
    return ok(saved);
  });

  deleteNote: ResearchStore["deleteNote"] = (projectId, id) => this.access(projectId, true, async (store, tx, workspace) => {
    if (!workspace) return err("missing");
    const note = await getRow(store, projectId, "note", id);
    const draft = workspace.worktableDraft;
    const cards = (draft.memos ?? []).filter((memo) => memo.researchNoteId === id);
    const now = new Date().toISOString();
    let next = workspace;
    if (cards.length) {
      const editor = createWorktableEditor(draft);
      for (const card of cards) {
        if (!editor.execute({ type: "remove-memo", memoId: card.id }).ok) return err("invalid-selection");
      }
      next = { ...workspace, worktableDraft: editor.snapshot(), revision: (workspace.revision + 1) as WorkspaceRevision, updatedAt: now };
      tx.objectStore(projects).put(next);
    }
    if (note && !note.deletedAt) putResearchRecord(store, { ...note, deletedAt: now, updatedAt: now, version: note.version + 1 });
    return ok(next);
  });

  placeNote: ResearchStore["placeNote"] = (note, center) => this.access(note.projectId, true, async (store, tx, workspace) => {
    if (!workspace || note.deletedAt) return err("missing");
    const current = await getRow(store, note.projectId, "note", note.id);
    const draft = workspace.worktableDraft;
    const card = draft.memos?.find((memo) => memo.researchNoteId === note.id);
    if (current && !current.deletedAt && card) return ok({ note: current, workspace, cardId: card.id });
    if (!sameVersion(current, note)) return err("conflict");

    const width = 264, height = 224, cardId = `research-note:${note.id}`;
    const placed = createWorktableEditor(draft).execute({ type: "create-memo", memo: {
      id: cardId, researchNoteId: note.id, text: "", x: center.x - width / 2, y: center.y - height / 2,
      width, height, fontSize: 15, photoIds: [],
    } });
    if (!placed.ok) return err("invalid-selection");

    const now = new Date().toISOString();
    const saved: ResearchNote = current ?? { ...note, version: 1, updatedAt: now };
    if (current) putNoteSummary(store, current);
    else putResearchRecord(store, { ...saved, kind: "note" });
    const next: ProjectWorkspace = { ...workspace, worktableDraft: placed.value, revision: (workspace.revision + 1) as WorkspaceRevision, updatedAt: now };
    tx.objectStore(projects).put(next);
    return ok({ note: saved, workspace: next, cardId });
  });

  listMaterials: ResearchStore["listMaterials"] = (projectId) =>
    this.access(projectId, false, async (store) => ok(await listRows(store, projectId, "material-summary")));

  loadMaterial: ResearchStore["loadMaterial"] = (projectId, id) => this.access(projectId, false, async (store) => {
    const material = await getRow(store, projectId, "material", id);
    return material ? ok(material) : err("missing");
  });

  addMaterials: ResearchStore["addMaterials"] = (projectId, materials) => this.access(projectId, true, async (store) => {
    if (materials.some((material) => material.projectId !== projectId)) return err("missing");
    materials.forEach((material) => putResearchRecord(store, { ...material, kind: "material" }));
    return ok(undefined);
  });

  listExtracts: ResearchStore["listExtracts"] = (projectId, noteId) =>
    this.access(projectId, false, async (store) => ok(noteId
      ? await read<ResearchExtract[]>(store.index("by-note").getAll([projectId, noteId]))
      : await listRows(store, projectId, "extract")));

  saveExtract: ResearchStore["saveExtract"] = (note, extract, placement) => this.access(note.projectId, true, async (store, tx, workspace) => {
    const [saved, existing] = await Promise.all([
      getRow(store, note.projectId, "note", note.id),
      getRow(store, note.projectId, "extract", extract.id),
    ]);
    if (!workspace || extract.noteId !== note.id || extract.projectId !== note.projectId || (placement && placement.extractId !== extract.id) || existing?.deletedAt) return err("invalid-selection");
    const draft = workspace.worktableDraft;
    if (existing && (!placement || draft.memos?.some((memo) => memo.id === placement.id && memo.extractId === existing.id))) return ok(undefined);
    if (placement && draft.memos?.some((memo) => memo.id === placement.id)) return err("conflict");
    if (!saved || !sameVersion(saved, note)) return err("conflict");
    const blocks = textBlocks(saved.content);
    const anchor = makeAnchor(blocks, extract.anchor.start, extract.anchor.end);
    if (!anchor || anchor.start.blockId !== anchor.end.blockId || anchor.quote.exact !== extract.snapshot) return err("invalid-selection");
    if (existing && (existing.noteId !== note.id || existing.snapshot !== extract.snapshot)) return err("conflict");
    const placed = placement && createWorktableEditor(draft).execute({ type: "create-memo", memo: { ...placement, text: extract.snapshot } });
    if (placed && !placed.ok) return err("invalid-selection");
    if (!existing) {
      const extracts = await read<ResearchExtract[]>(store.index("by-note").getAll([note.projectId, note.id]));
      const overlaps = extracts.some((prior) => {
        if (prior.noteId !== note.id || prior.deletedAt) return false;
        const match = resolveAnchor(blocks, prior.anchor);
        return match.status === "current" && "anchor" in match && match.anchor.start.blockId === anchor.start.blockId
          && match.anchor.start.offset < anchor.end.offset && anchor.start.offset < match.anchor.end.offset;
      });
      if (overlaps) return err("invalid-selection");
      putResearchRecord(store, { ...extract, kind: "extract", anchor, acceptedVersion: saved.version });
    }
    if (placed?.ok) {
      tx.objectStore(projects).put({ ...workspace, worktableDraft: placed.value,
        revision: (workspace.revision + 1) as WorkspaceRevision, updatedAt: new Date().toISOString() } satisfies ProjectWorkspace);
    }
    return ok(undefined);
  });

  updateExtract: ResearchStore["updateExtract"] = (note, previous, next) => this.access(note.projectId, true, async (store) => {
    const [saved, current] = await Promise.all([
      getRow(store, note.projectId, "note", note.id),
      getRow(store, note.projectId, "extract", previous.id),
    ]);
    if (!saved || !sameVersion(saved, note) || !current || current.noteId !== note.id
      || current.deletedAt || current.snapshot !== previous.snapshot || current.acceptedVersion !== previous.acceptedVersion
      || current.note !== previous.note || current.dismissedVersion !== previous.dismissedVersion) return err("conflict");
    if (next.id !== current.id || next.projectId !== note.projectId || next.noteId !== note.id) return err("invalid-selection");
    if (next.snapshot !== current.snapshot) {
      const anchor = makeAnchor(textBlocks(saved.content), next.anchor.start, next.anchor.end);
      if (!anchor || anchor.quote.exact !== next.snapshot || next.acceptedVersion !== saved.version) return err("invalid-selection");
    }
    putResearchRecord(store, { ...next, kind: "extract" });
    return ok(undefined);
  });
}
