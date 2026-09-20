import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  ok,
  type PhotoId,
  type ProjectId,
  type Result,
  type SequenceId,
  type WorktableCommandError,
  type WorktableDraft,
  type WorktableEditCommand,
  type WorktableEditor,
  type WorktablePlacementSeed,
  type WorktablePoint,
  type WorktableItemId,
} from "../contracts";
import { createEmptyWorktable, createWorktableEditor } from "../modules/worktable";
import { deriveTableActions, type TableActionState } from "./tableActionPolicy";

export interface TableSessionCommit {
  readonly draft: WorktableDraft;
  readonly editSeq: number;
}

export interface TableSessionSelection {
  readonly photoIds?: readonly WorktableItemId[];
  readonly pileIds?: readonly SequenceId[];
}

export interface TableSessionSnapshot {
  readonly draft: WorktableDraft;
  readonly selectedPhotoIds: readonly WorktableItemId[];
  readonly selectedPileIds: readonly SequenceId[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly latestLocalEditSeq: number;
  readonly actions: TableActionState;
}

export type TableSessionCommitHandler = (commit: TableSessionCommit) => void | Promise<void>;

export interface TableSession {
  getSnapshot(): TableSessionSnapshot;
  subscribe(listener: () => void): () => void;
  execute(command: WorktableEditCommand): Result<TableSessionSnapshot, WorktableCommandError>;
  placePhotos(items: readonly WorktablePlacementSeed[], at?: WorktablePoint): Result<TableSessionSnapshot, WorktableCommandError>;
  copySelection(): boolean;
  pasteSelection(): Result<TableSessionSnapshot, WorktableCommandError>;
  prepareStructuralDraft(command: WorktableEditCommand): Result<WorktableDraft, WorktableCommandError>;
  undo(): TableSessionSnapshot;
  redo(): TableSessionSnapshot;
  selectPhoto(photoId: WorktableItemId, toggle: boolean): readonly WorktableItemId[] | undefined;
  selectPile(sequenceId: SequenceId, toggle: boolean): readonly SequenceId[] | undefined;
  selectPhotos(photoIds: readonly WorktableItemId[], additive?: boolean): TableSessionSnapshot;
  selectAllPhotos(): TableSessionSnapshot;
  clearSelection(): TableSessionSnapshot;
  resetCommittedDraft(draft: WorktableDraft, selection?: TableSessionSelection): TableSessionSnapshot;
}

export function createTableSession(
  initialDraft: WorktableDraft,
  onCommit?: TableSessionCommitHandler,
): TableSession & { setCommitHandler(handler?: TableSessionCommitHandler): void } {
  return new TableSessionController(initialDraft, onCommit);
}

class TableSessionController implements TableSession {
  private editor: WorktableEditor;
  private selectedPhotoIds = new Set<WorktableItemId>();
  private selectedPileIds = new Set<SequenceId>();
  private latestLocalEditSeq = 0;
  private clipboard: readonly WorktablePlacementSeed[] = [];
  private pasteCount = 0;
  private snapshotValue: TableSessionSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(initialDraft: WorktableDraft, private onCommit?: TableSessionCommitHandler) {
    this.editor = createWorktableEditor(initialDraft);
    this.snapshotValue = this.buildSnapshot();
  }

  getSnapshot = (): TableSessionSnapshot => this.snapshotValue;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setCommitHandler(handler?: TableSessionCommitHandler): void {
    this.onCommit = handler;
  }

  execute = (command: WorktableEditCommand): Result<TableSessionSnapshot, WorktableCommandError> => {
    const result = this.editor.execute(command);
    if (!result.ok) return result;
    return ok(this.commit(result.value));
  };

  placePhotos = (items: readonly WorktablePlacementSeed[], at?: WorktablePoint): Result<TableSessionSnapshot, WorktableCommandError> => {
    return this.execute({ type: "place", items, at });
  };

  copySelection = (): boolean => {
    const selected = new Set(this.selectedPhotoIds);
    this.clipboard = this.snapshotValue.draft.entryOrder.flatMap((id) => {
      if (!selected.has(id)) return [];
      const placement = this.snapshotValue.draft.placements[id];
      return [{
        photoId: placement.photoId,
        width: placement.width,
        height: placement.height,
        filename: placement.filename,
        x: placement.x,
        y: placement.y,
      }];
    });
    this.pasteCount = 0;
    return this.clipboard.length > 0;
  };

  pasteSelection = (): Result<TableSessionSnapshot, WorktableCommandError> => {
    if (!this.clipboard.length) return ok(this.snapshotValue);
    this.pasteCount += 1;
    const offset = this.pasteCount * 32;
    const ids = this.clipboard.map(() => crypto.randomUUID() as WorktableItemId);
    const result = this.execute({
      type: "place",
      items: this.clipboard.map((item, index) => ({ ...item, id: ids[index], x: item.x! + offset, y: item.y! + offset })),
    });
    if (!result.ok) return result;
    return ok(this.selectPhotos(ids));
  };

  prepareStructuralDraft = (command: WorktableEditCommand): Result<WorktableDraft, WorktableCommandError> => {
    return createWorktableEditor(this.snapshotValue.draft).execute(command);
  };

  undo = (): TableSessionSnapshot => {
    if (!this.editor.canUndo()) return this.snapshotValue;
    return this.commit(this.editor.undo());
  };

  redo = (): TableSessionSnapshot => {
    if (!this.editor.canRedo()) return this.snapshotValue;
    return this.commit(this.editor.redo());
  };

  selectPhoto = (photoId: WorktableItemId, toggle: boolean): readonly WorktableItemId[] | undefined => {
    if (!this.snapshotValue.draft.placements[photoId] || this.snapshotValue.draft.placements[photoId].locked) return undefined;
    this.selectedPileIds.clear();
    if (toggle) {
      if (this.selectedPhotoIds.delete(photoId)) {
        this.publish();
        return undefined;
      }
      this.selectedPhotoIds.add(photoId);
    } else if (!this.selectedPhotoIds.has(photoId)) {
      this.selectedPhotoIds = new Set([photoId]);
    }
    this.publish();
    return this.snapshotValue.selectedPhotoIds;
  };

  selectPile = (sequenceId: SequenceId, toggle: boolean): readonly SequenceId[] | undefined => {
    if (!this.snapshotValue.draft.pilePlacements[sequenceId]) return undefined;
    this.selectedPhotoIds.clear();
    if (toggle) {
      if (this.selectedPileIds.delete(sequenceId)) {
        this.publish();
        return undefined;
      }
      this.selectedPileIds.add(sequenceId);
    } else if (!this.selectedPileIds.has(sequenceId)) {
      this.selectedPileIds = new Set([sequenceId]);
    }
    this.publish();
    return this.snapshotValue.selectedPileIds;
  };

  selectPhotos = (photoIds: readonly WorktableItemId[], additive = false): TableSessionSnapshot => {
    const next = additive ? new Set(this.selectedPhotoIds) : new Set<WorktableItemId>();
    photoIds.forEach((id) => {
      if (this.snapshotValue.draft.placements[id] && !this.snapshotValue.draft.placements[id].locked) next.add(id);
    });
    this.selectedPhotoIds = next;
    this.selectedPileIds.clear();
    return this.publish();
  };

  selectAllPhotos = (): TableSessionSnapshot => {
    this.selectedPhotoIds = new Set(this.snapshotValue.draft.entryOrder.filter((id) => !this.snapshotValue.draft.placements[id].locked));
    this.selectedPileIds.clear();
    return this.publish();
  };

  clearSelection = (): TableSessionSnapshot => {
    if (!this.selectedPhotoIds.size && !this.selectedPileIds.size) return this.snapshotValue;
    this.selectedPhotoIds.clear();
    this.selectedPileIds.clear();
    return this.publish();
  };

  resetCommittedDraft = (draft: WorktableDraft, selection: TableSessionSelection = {}): TableSessionSnapshot => {
    this.editor = createWorktableEditor(draft);
    this.selectedPhotoIds = new Set((selection.photoIds ?? []).filter((id) => Boolean(draft.placements[id]) && !draft.placements[id].locked));
    this.selectedPileIds = new Set((selection.pileIds ?? []).filter((id) => Boolean(draft.pilePlacements[id])));
    return this.publish();
  };

  private commit(draft: WorktableDraft): TableSessionSnapshot {
    this.latestLocalEditSeq += 1;
    this.pruneSelection(draft);
    const snapshot = this.publish();
    void this.onCommit?.({ draft: snapshot.draft, editSeq: this.latestLocalEditSeq });
    return snapshot;
  }

  private pruneSelection(draft: WorktableDraft): void {
    this.selectedPhotoIds = new Set([...this.selectedPhotoIds].filter((id) => Boolean(draft.placements[id])));
    this.selectedPileIds = new Set([...this.selectedPileIds].filter((id) => Boolean(draft.pilePlacements[id])));
  }

  private publish(): TableSessionSnapshot {
    this.snapshotValue = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
    return this.snapshotValue;
  }

  private buildSnapshot(): TableSessionSnapshot {
    const draft = this.editor.snapshot();
    const actions = deriveTableActions(draft, this.selectedPhotoIds, this.selectedPileIds);
    return {
      draft,
      selectedPhotoIds: actions.photoIds,
      selectedPileIds: actions.pileIds,
      canUndo: this.editor.canUndo(),
      canRedo: this.editor.canRedo(),
      latestLocalEditSeq: this.latestLocalEditSeq,
      actions,
    };
  }
}

export function useTableSession(
  projectId: ProjectId,
  onCommit: TableSessionCommitHandler,
): TableSessionSnapshot & Omit<TableSession, "getSnapshot" | "subscribe"> {
  const commitHandlerRef = useRef(onCommit);
  commitHandlerRef.current = onCommit;
  const session = useMemo(
    () => createTableSession(createEmptyWorktable(projectId)),
    [projectId],
  );

  useEffect(() => {
    session.setCommitHandler((commit) => commitHandlerRef.current(commit));
    return () => session.setCommitHandler(undefined);
  }, [session]);

  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return {
    ...snapshot,
    execute: session.execute,
    placePhotos: session.placePhotos,
    copySelection: session.copySelection,
    pasteSelection: session.pasteSelection,
    prepareStructuralDraft: session.prepareStructuralDraft,
    undo: session.undo,
    redo: session.redo,
    selectPhoto: session.selectPhoto,
    selectPile: session.selectPile,
    selectPhotos: session.selectPhotos,
    selectAllPhotos: session.selectAllPhotos,
    clearSelection: session.clearSelection,
    resetCommittedDraft: session.resetCommittedDraft,
  };
}
