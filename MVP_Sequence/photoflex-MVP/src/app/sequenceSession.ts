import { useEffect, useMemo, useSyncExternalStore } from "react";
import { err, ok, type ProjectId, type Result, type SequenceCommandError, type SequenceDocument, type SequenceEditCommand, type SequenceEditor, type SequenceId } from "../contracts";
import { createSequenceEditor } from "../modules/sequence";
import type { SequenceWritePort } from "./projectWriteCoordinator";

export type SequenceSessionNotReadyError = { readonly kind: "sequence-not-ready" };
export type SequenceSessionCommandError = SequenceCommandError | SequenceSessionNotReadyError;
export type SequenceSessionSaveError = { readonly kind: "sequence-save-failed" };

export interface SequenceSessionSnapshot {
  readonly loading: boolean;
  readonly sequence?: SequenceDocument;
  readonly editor?: SequenceEditor;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly saveState: "idle" | "saving" | "failed";
  readonly error?: string;
}

export interface SequenceSessionController {
  readonly projectId: ProjectId;
  readonly sequenceId: SequenceId;
  getSnapshot(): SequenceSessionSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  execute(command: SequenceEditCommand): Result<SequenceDocument, SequenceSessionCommandError>;
  undo(): boolean;
  redo(): boolean;
  replaceDraft(draft: ReturnType<SequenceEditor["snapshot"]>, notice?: string): void;
  flush(): ReturnType<SequenceWritePort["flushSequence"]>;
  retry(): Promise<void>;
  dispose(): void;
}

export class SequenceSessionControllerImpl implements SequenceSessionController {
  readonly projectId: ProjectId;
  readonly sequenceId: SequenceId;
  private readonly persistence: SequenceWritePort;
  private readonly listeners = new Set<() => void>();
  private snapshot: SequenceSessionSnapshot = { loading: true, canUndo: false, canRedo: false, saveState: "idle" };
  private editor?: SequenceEditor;
  private active = true;
  private generation = 0;
  private editSeq = 0;
  private failedDraft?: SequenceDocument;

  constructor(persistence: SequenceWritePort, projectId: ProjectId, sequenceId: SequenceId) {
    this.persistence = persistence;
    this.projectId = projectId;
    this.sequenceId = sequenceId;
    this.load = this.load.bind(this);
    this.execute = this.execute.bind(this);
    this.undo = this.undo.bind(this);
    this.redo = this.redo.bind(this);
    this.replaceDraft = this.replaceDraft.bind(this);
    this.flush = this.flush.bind(this);
    this.retry = this.retry.bind(this);
    this.dispose = this.dispose.bind(this);
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async load() {
    const generation = ++this.generation;
    this.active = true;
    this.setSnapshot({ loading: true, sequence: undefined, editor: undefined, canUndo: false, canRedo: false, saveState: "idle", error: undefined });
    const result = await this.persistence.loadSequence(this.sequenceId);
    if (!this.active || generation !== this.generation) return;
    if (!result.ok) {
      this.setSnapshot({ ...this.snapshot, loading: false, error: "Sequence could not be loaded." });
      return;
    }
    this.editor = this.createEditor(result.value);
    this.failedDraft = undefined;
    this.setSnapshot(this.snapshotFor(result.value, "idle"));
  }

  execute(command: SequenceEditCommand): Result<SequenceDocument, SequenceSessionCommandError> {
    if (!this.editor || !this.snapshot.sequence) return err({ kind: "sequence-not-ready" });
    const result = this.editor.execute(command);
    if (!result.ok) return result;
    const next = { ...this.snapshot.sequence, items: result.value.items, segments: result.value.segments, readingUnits: result.value.readingUnits };
    this.commitLocal(next);
    return ok(next);
  }

  undo() {
    if (!this.editor?.canUndo() || !this.snapshot.sequence) return false;
    this.commitLocal({ ...this.snapshot.sequence, ...this.editorDraft(this.editor.undo()) });
    return true;
  }

  redo() {
    if (!this.editor?.canRedo() || !this.snapshot.sequence) return false;
    this.commitLocal({ ...this.snapshot.sequence, ...this.editorDraft(this.editor.redo()) });
    return true;
  }

  replaceDraft(draft: ReturnType<SequenceEditor["snapshot"]>, notice?: string) {
    if (!this.snapshot.sequence || draft.projectId !== this.projectId) return;
    this.editor = createSequenceEditor(draft);
    const next = { ...this.snapshot.sequence, items: draft.items, segments: draft.segments, readingUnits: draft.readingUnits };
    this.setSnapshot({ ...this.snapshotFor(next, "idle"), error: notice });
  }

  async flush() {
    const result = await this.persistence.flushSequence(this.sequenceId);
    return this.snapshot.saveState === "failed" && result.ok ? err({ kind: "writes-paused" as const }) : result;
  }

  async retry() {
    const failed = this.failedDraft;
    if (!failed || !this.active) return;
    this.setSnapshot({ ...this.snapshot, saveState: "saving", error: undefined });
    const requestSeq = this.editSeq;
    const retried = await this.persistence.retrySequence(this.sequenceId);
    if (!this.active || requestSeq !== this.editSeq) return;
    const result = retried
      ? await this.persistence.loadSequence(this.sequenceId)
      : await this.persistence.saveSequenceDraft(failed).then((saved) => saved.ok ? ok(saved.value.sequence) : saved);
    if (!this.active || requestSeq !== this.editSeq) return;
    if (!result.ok) {
      this.setSnapshot({ ...this.snapshot, saveState: "failed", error: "Draft save failed. Your current edit remains on screen." });
      return;
    }
    this.failedDraft = undefined;
    this.setSnapshot({ ...this.snapshot, sequence: result.value, saveState: "idle", error: undefined });
  }

  dispose() {
    this.active = false;
    this.generation += 1;
    this.listeners.clear();
  }

  private commitLocal(sequence: SequenceDocument) {
    this.editSeq += 1;
    const requestSeq = this.editSeq;
    this.setSnapshot({ ...this.snapshotFor(sequence, "saving"), error: undefined });
    void this.persistence.saveSequenceDraft(sequence).then((result) => {
      if (!this.active || requestSeq !== this.editSeq) return;
      if (!result.ok) {
        this.failedDraft = sequence;
        this.setSnapshot({ ...this.snapshot, saveState: "failed", error: "Draft save failed. Your current edit remains on screen." });
        return;
      }
      this.failedDraft = undefined;
      this.setSnapshot({ ...this.snapshot, sequence: result.value.sequence, saveState: "idle", error: undefined });
    });
  }

  private createEditor(sequence: SequenceDocument) {
    return createSequenceEditor(toDraft(sequence));
  }

  private snapshotFor(sequence: SequenceDocument, saveState: SequenceSessionSnapshot["saveState"]): SequenceSessionSnapshot {
    return { loading: false, sequence, editor: this.editor, canUndo: Boolean(this.editor?.canUndo()), canRedo: Boolean(this.editor?.canRedo()), saveState };
  }

  private setSnapshot(next: SequenceSessionSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private editorDraft(draft: ReturnType<SequenceEditor["snapshot"]>) {
    return { items: draft.items, segments: draft.segments, readingUnits: draft.readingUnits };
  }
}

export function useSequenceSession(persistence: SequenceWritePort, projectId: ProjectId, sequenceId: SequenceId) {
  const session = useMemo(() => new SequenceSessionControllerImpl(persistence, projectId, sequenceId), [persistence, projectId, sequenceId]);
  const snapshot = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );
  useEffect(() => {
    void session.load();
    return () => session.dispose();
  }, [session]);
  return {
    ...snapshot,
    session,
    execute: session.execute,
    undo: session.undo,
    redo: session.redo,
    replaceDraft: session.replaceDraft,
    flush: session.flush,
    retry: session.retry,
  };
}

function toDraft(sequence: SequenceDocument) {
  return { projectId: sequence.projectId, baseVersionId: sequence.currentVersionId, items: sequence.items, segments: sequence.segments, readingUnits: sequence.readingUnits };
}
