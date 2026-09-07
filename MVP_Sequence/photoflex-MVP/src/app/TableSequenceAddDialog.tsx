import { useState } from "react";
import type { PhotoId, ProjectId, SequenceId, SequenceItemId, SequenceSummary } from "../contracts";
import type { ProjectWriteCoordinator } from "./projectWriteCoordinator";
import { useSequenceSession } from "./sequenceSession";

interface TableSequenceAddDialogProps {
  readonly coordinator: ProjectWriteCoordinator;
  readonly projectId: ProjectId;
  readonly photoIds: readonly PhotoId[];
  readonly summaries: readonly SequenceSummary[];
  readonly initialSequenceId?: SequenceId;
  readonly onClose: () => void;
  readonly onSummariesChange: (summaries: readonly SequenceSummary[]) => void;
  readonly onSequenceChanged: (sequenceId: SequenceId) => void;
  readonly onNotice: (message: string) => void;
}

/** Adds selected Table photos through the active SequenceSession. */
export function TableSequenceAddDialog({ coordinator, projectId, photoIds, summaries, initialSequenceId, onClose, onSummariesChange, onSequenceChanged, onNotice }: TableSequenceAddDialogProps) {
  const [targetId, setTargetId] = useState<SequenceId | undefined>(initialSequenceId ?? summaries[0]?.id);
  const sequenceSession = useSequenceSession(coordinator, projectId, targetId ?? ("missing-sequence" as SequenceId));
  const add = async () => {
    if (!targetId) return;
    const additions = photoIds.map((photoId) => ({ id: newId("item") as SequenceItemId, kind: "photo" as const, photoId }));
    const result = sequenceSession.execute({ type: "add", items: additions });
    if (!result.ok) { onNotice("Photos could not be added to Sequence."); return; }
    await sequenceSession.flush();
    if (coordinator.getSnapshot().writeState === "failed") { onNotice("Sequence save failed. Your edit remains on screen."); return; }
    const latest = await coordinator.listSequences();
    if (latest.ok) onSummariesChange(latest.value);
    onSequenceChanged(targetId);
    onClose();
    onNotice(`Added ${additions.length} photo${additions.length === 1 ? "" : "s"} to ${result.value.name}.`);
  };

  return <section className="sequence-add-dialog" role="dialog" aria-modal="true" aria-label="Add photos to Sequence"><header><strong>Add to Sequence</strong><button onClick={onClose} aria-label="Close">×</button></header><p>{photoIds.length} selected photo{photoIds.length === 1 ? "" : "s"}</p><label><span>DESTINATION SEQUENCE</span><select autoFocus value={targetId ?? ""} disabled={!summaries.length} aria-label="Destination Sequence" onChange={(event) => setTargetId(event.target.value as SequenceId)}><option value="">Select Sequence</option>{summaries.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.itemCount} photos</option>)}</select></label><footer><button onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!targetId || sequenceSession.loading || sequenceSession.saveState === "saving"} onClick={() => void add()}>Add photos</button></footer></section>;
}

function newId(prefix: string) { return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
