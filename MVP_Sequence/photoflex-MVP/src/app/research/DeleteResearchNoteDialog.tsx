import { useState } from "react";
import { useLocale } from "../locale";
import { ResearchDialog } from "./ResearchMedia";

export function DeleteResearchNoteDialog({ title, onClose, onDelete }: {
  title: string;
  onClose: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      if (await onDelete()) onClose();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return <ResearchDialog title={t("research.deleteNote")} close={() => { if (!busy) onClose(); }}>
    <p>{t("research.deletePrompt", { title: title.trim() || t("research.untitled") })}</p>
    {failed && <p role="alert">{t("research.operationFailed")}</p>}
    <footer>
      <button type="button" autoFocus disabled={busy} onClick={onClose}>{t("common.cancel")}</button>
      <button type="button" className="button-danger" disabled={busy} onClick={() => void confirm()}>{t("research.deleteNote")}</button>
    </footer>
  </ResearchDialog>;
}
