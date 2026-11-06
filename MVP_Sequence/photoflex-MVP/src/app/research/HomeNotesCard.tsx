import { useEffect, useState } from "react";
import type { ProjectId } from "../../contracts";
import type { ResearchNoteSummary, ResearchStore } from "../../contracts/research";
import { createResearchNote } from "../../modules/research/notes";
import { useLocale } from "../locale";
import type { AppRoute } from "../router";
import "../../styles/home-notes.css";

export function HomeNotesCard({ projectId, store, navigate }: { projectId: ProjectId; store: ResearchStore; navigate: (route: AppRoute) => void }) {
  const { t } = useLocale();
  const [notes, setNotes] = useState<readonly ResearchNoteSummary[]>();
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    void store.listNotes(projectId).then((result) => {
      if (!active) return;
      if (result.ok) { setNotes(result.value); setError(undefined); }
      else setError("research.loadFailed");
    });
    return () => { active = false; };
  }, [projectId, store, reload]);
  const open = (noteId?: string) => navigate({ name: "research", projectId, noteId });
  const create = async () => {
    setCreating(true);
    try {
      const result = await createResearchNote(store, projectId);
      if (result.ok) open(result.value.id);
      else setError("research.createFailed");
    } finally { setCreating(false); }
  };
  return <section className="home-notes-card" aria-label={t("research.notes")}>
    <header><h2>{t("research.notes")} {notes && <small>{notes.length}</small>}</h2>
      <button type="button" disabled={creating} onClick={() => void create()}>＋ {t("research.newNote")}</button>
    </header>
    {error && <p role="alert">{t(error)} <button type="button" onClick={() => setReload((value) => value + 1)}>{t("common.retry")}</button></p>}
    {notes ? notes.length ? <ul>{notes.slice(0, 2).map((note) => <li key={note.id}><button type="button" onClick={() => open(note.id)}>{note.title.trim() || t("research.untitled")}</button></li>)}</ul>
      : <p>{t("research.noNotes")}</p> : !error && <p>{t("common.loading")}</p>}
    <button type="button" className="home-notes-all" onClick={() => open()}>{t("research.viewAll")} ›</button>
  </section>;
}
