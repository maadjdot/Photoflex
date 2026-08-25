export interface SequenceSnapshot {
  readonly order: readonly string[];
  readonly revision: number;
}

export interface SequenceMove {
  id: string;
  from: number;
  to: number;
}

export interface SequenceEngine {
  snapshot(): SequenceSnapshot;
  move(ids: readonly string[], targetIndex: number): SequenceSnapshot;
  undo(): SequenceSnapshot;
  diff(snapshot: SequenceSnapshot): SequenceMove[];
}

function immutableSnapshot(order: readonly string[], revision: number): SequenceSnapshot {
  return Object.freeze({ order: Object.freeze([...order]), revision });
}

export function createSequenceEngine(initialOrder: readonly string[]): SequenceEngine {
  if (new Set(initialOrder).size !== initialOrder.length) {
    throw new Error("Sequence IDs must be unique");
  }

  let current = [...initialOrder];
  let revision = 0;
  const history: string[][] = [];

  return {
    snapshot: () => immutableSnapshot(current, revision),

    move(ids, targetIndex) {
      const selected = new Set(ids);
      const moving = current.filter((id) => selected.has(id));
      if (moving.length !== selected.size) {
        throw new Error("Cannot move an ID that is not in the sequence");
      }
      const remaining = current.filter((id) => !selected.has(id));
      const insertion = Math.max(0, Math.min(Math.trunc(targetIndex), remaining.length));
      const next = [...remaining.slice(0, insertion), ...moving, ...remaining.slice(insertion)];
      if (next.every((id, index) => id === current[index])) return immutableSnapshot(current, revision);

      history.push(current);
      current = next;
      revision += 1;
      return immutableSnapshot(current, revision);
    },

    undo() {
      const previous = history.pop();
      if (!previous) return immutableSnapshot(current, revision);
      current = previous;
      revision += 1;
      return immutableSnapshot(current, revision);
    },

    diff(snapshot) {
      const oldIndexes = new Map(snapshot.order.map((id, index) => [id, index]));
      return current.flatMap((id, to) => {
        const from = oldIndexes.get(id);
        return from === undefined || from === to ? [] : [{ id, from, to }];
      });
    }
  };
}
