import {
  err,
  MVP_SEQUENCE_ITEM_LIMIT,
  ok,
  type Result,
  type SequenceCommandError,
  type SequenceDraft,
  type SequenceEditCommand,
  type SequenceEditor,
} from "../../contracts";

export function createSequenceEditor(initial: SequenceDraft): SequenceEditor {
  return new Editor(initial);
}

class Editor implements SequenceEditor {
  private current: SequenceDraft;
  private readonly undoStack: SequenceDraft[] = [];
  private readonly redoStack: SequenceDraft[] = [];

  constructor(initial: SequenceDraft) { this.current = copy(initial); }
  snapshot(): SequenceDraft { return copy(this.current); }
  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  undo(): SequenceDraft {
    const previous = this.undoStack.pop();
    if (!previous) return this.snapshot();
    this.redoStack.push(this.current);
    this.current = previous;
    return this.snapshot();
  }
  redo(): SequenceDraft {
    const next = this.redoStack.pop();
    if (!next) return this.snapshot();
    this.undoStack.push(this.current);
    this.current = next;
    return this.snapshot();
  }
  execute(command: SequenceEditCommand): Result<SequenceDraft, SequenceCommandError> {
    const result = apply(this.current, command);
    if (!result.ok || same(this.current, result.value)) return result.ok ? ok(this.snapshot()) : result;
    this.undoStack.push(this.current);
    this.current = result.value;
    this.redoStack.length = 0;
    return ok(this.snapshot());
  }
}

function apply(draft: SequenceDraft, command: SequenceEditCommand): Result<SequenceDraft, SequenceCommandError> {
  if (command.type === "add") {
    const known = new Set(draft.items.map((item) => item.id));
    for (const item of command.items) {
      if (known.has(item.id)) return err({ kind: "duplicate-item", itemId: item.id });
      known.add(item.id);
    }
    const at = command.at ?? draft.items.length;
    if (!Number.isInteger(at) || at < 0 || at > draft.items.length) return err({ kind: "invalid-target", target: at });
    if (draft.items.length + command.items.length > MVP_SEQUENCE_ITEM_LIMIT) {
      return err({ kind: "sequence-limit-exceeded", limit: MVP_SEQUENCE_ITEM_LIMIT, current: draft.items.length, attempted: command.items.length });
    }
    return ok({ ...draft, items: [...draft.items.slice(0, at), ...command.items, ...draft.items.slice(at)] });
  }
  const selected = new Set(command.itemIds);
  const missing = command.itemIds.find((itemId) => !draft.items.some((item) => item.id === itemId));
  if (missing) return err({ kind: "unknown-item", itemId: missing });
  if (command.type === "remove") return ok({ ...draft, items: draft.items.filter((item) => !selected.has(item.id)) });
  if (!Number.isInteger(command.to) || command.to < 0 || command.to > draft.items.length) return err({ kind: "invalid-target", target: command.to });
  const moving = draft.items.filter((item) => selected.has(item.id));
  const remaining = draft.items.filter((item) => !selected.has(item.id));
  const beforeTarget = draft.items.slice(0, command.to).filter((item) => !selected.has(item.id)).length;
  return ok({ ...draft, items: [...remaining.slice(0, beforeTarget), ...moving, ...remaining.slice(beforeTarget)] });
}

function copy(draft: SequenceDraft): SequenceDraft { return { ...draft, items: draft.items.map((item) => ({ ...item })) }; }
function same(left: SequenceDraft, right: SequenceDraft): boolean { return JSON.stringify(left) === JSON.stringify(right); }
