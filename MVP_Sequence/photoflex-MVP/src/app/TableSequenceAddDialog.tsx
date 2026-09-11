import { useRef, useState } from "react";
import type { PhotoId, ProjectId, SequenceId, SequenceItemId, SequenceSummary } from "../contracts";
import { useDialogKeyboard } from "./AppPrimitives";
import type { AppDependencies } from "./dependencies";
import type { SequenceWritePort } from "./projectWriteCoordinator";
import { useSequenceSession } from "./sequenceSession";
import { useLocale } from "./locale";

interface TableSequenceAddDialogProps {
  readonly persistence: SequenceWritePort;
  readonly listSequences: () => ReturnType<AppDependencies["projectStore"]["listSequences"]>;
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
export function TableSequenceAddDialog({ persistence, listSequences, projectId, photoIds, summaries, initialSequenceId, onClose, onSummariesChange, onSequenceChanged, onNotice }: TableSequenceAddDialogProps) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLElement>(null);
  useDialogKeyboard(dialogRef, onClose);
  const [targetId, setTargetId] = useState<SequenceId | undefined>(initialSequenceId ?? summaries[0]?.id);
  const sequenceSession = useSequenceSession(persistence, projectId, targetId ?? ("missing-sequence" as SequenceId));
  const add = async () => {
    if (!targetId) return;
    const additions = photoIds.map((photoId) => ({ id: newId("item") as SequenceItemId, kind: "photo" as const, photoId }));
    const result = sequenceSession.execute({ type: "add", items: additions });
    if (!result.ok) { onNotice(t("sequence.addFailed")); return; }
    const flushed = await sequenceSession.flush();
    if (!flushed.ok) { onNotice(t("sequence.saveFailed")); return; }
    const latest = await listSequences();
    if (latest.ok) onSummariesChange(latest.value);
    onSequenceChanged(targetId);
    onClose();
    onNotice(t("sequence.addedPhotos", { count: additions.length, name: result.value.name }));
  };

  return <section ref={dialogRef} className="sequence-add-dialog" role="dialog" aria-modal="true" aria-label={t("table.addToSequence")}><header><strong>{t("table.addToSequence")}</strong><button onClick={onClose} aria-label={t("common.close")}>×</button></header><p>{t("common.selectedPhotos", { count: photoIds.length })}</p><label><span>{t("table.destinationSequence")}</span><select autoFocus value={targetId ?? ""} disabled={!summaries.length} aria-label={t("table.destinationSequence")} onChange={(event) => setTargetId(event.target.value as SequenceId)}><option value="">{t("table.selectSequence")}</option>{summaries.map((item) => <option key={item.id} value={item.id}>{item.name} · {t("common.photoCount", { count: item.itemCount })}</option>)}</select></label><footer><button onClick={onClose}>{t("common.cancel")}</button><button className="button button-primary" disabled={!targetId || sequenceSession.loading || sequenceSession.saveState === "saving"} onClick={() => void add()}>{t("table.addPhotos")}</button></footer></section>;
}

function newId(prefix: string) { return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
