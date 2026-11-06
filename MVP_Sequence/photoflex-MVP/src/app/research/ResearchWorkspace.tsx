import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectId } from "../../contracts";
import type { ResearchNote, ResearchNoteSummary } from "../../contracts/research";
import { createResearchNote } from "../../modules/research/notes";
import type { AppDependencies } from "../dependencies";
import { useLocale } from "../locale";
import type { AppRoute } from "../router";
import { useProjectWorkspaceSession } from "../useProjectWorkspace";
import { ResearchEditor } from "./ResearchEditor";
import { DeleteResearchNoteDialog } from "./DeleteResearchNoteDialog";
import type { ResearchSaveGuard } from "./useResearchDraft";

const lastNotes = new Map<ProjectId, string>();
const mobile = () => window.matchMedia("(max-width: 760px)").matches;

export default function ResearchWorkspace({ dependencies, route, navigate, registerGuard }: {
  dependencies: AppDependencies;
  route: Extract<AppRoute, { name: "research" }>;
  navigate: (route: AppRoute) => void;
  registerGuard: (guard?: ResearchSaveGuard) => void;
}) {
  const { t } = useLocale();
  const { projectId, noteId, extractId } = route;
  const { workspace, loading, error: workspaceError, coordinator } = useProjectWorkspaceSession(dependencies, projectId);
  const store = dependencies.projectStore.research;
  const [sidebar, setSidebar] = useState(() => !mobile() || !noteId);
  const [folder, setFolder] = useState(true);
  const [notes, setNotes] = useState<readonly ResearchNoteSummary[]>();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ query: string; notes: readonly ResearchNoteSummary[] }>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<{ id: string; note?: ResearchNote; missing?: boolean }>();
  const [liveTitle, setLiveTitle] = useState<{ id: string; title: string }>();
  const [revision, setRevision] = useState(0);
  const [reloadNote, setReloadNote] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string }>();
  const ready = Boolean(workspace);
  const guard = useRef<ResearchSaveGuard | undefined>(undefined);
  const register = useCallback((next?: ResearchSaveGuard) => { guard.current = next; registerGuard(next); }, [registerGuard]);
  const term = query.trim();
  const activeId = noteId ?? notes?.find((note) => note.id === lastNotes.get(projectId))?.id ?? notes?.[0]?.id;

  useEffect(() => {
    if (!ready || !store) return;
    let current = true;
    void store.listNotes(projectId).then((result) => {
      if (!current) return;
      if (result.ok) { setNotes(result.value); setError(undefined); }
      else setError(t("research.loadFailed"));
    });
    return () => { current = false; };
  }, [ready, projectId, store, revision, t]);

  useEffect(() => {
    if (!ready || !store || !term) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void store.listNotes(projectId, term).then((result) => {
        if (current && result.ok) setMatches({ query: term, notes: result.value });
        else if (current) setError(t("research.loadFailed"));
      });
    }, 160);
    return () => { current = false; window.clearTimeout(timer); };
  }, [projectId, ready, revision, store, t, term]);

  useEffect(() => {
    if (!ready || !store || !activeId) return;
    let current = true;
    void store.loadNote(projectId, activeId).then((result) => {
      if (!current) return;
      if (result.ok) {
        lastNotes.set(projectId, activeId);
        setSelected({ id: activeId, note: result.value });
      } else setSelected({ id: activeId, missing: result.error === "missing" });
    });
    return () => { current = false; };
  }, [activeId, ready, reloadNote, projectId, store]);

  const open = (id: string) => {
    if (mobile()) setSidebar(false);
    if (id === activeId && !extractId) return;
    navigate({ name: "research", projectId, noteId: id });
  };
  const create = async () => {
    if (!store || creating) return;
    setCreating(true);
    try {
      if (guard.current?.isDirty() && !await guard.current.flush()) return;
      const result = await createResearchNote(store, projectId);
      if (!result.ok) { setError(t("research.createFailed")); return; }
      setFolder(true);
      setQuery("");
      navigate({ name: "research", projectId, noteId: result.value.id });
      if (mobile()) setSidebar(false);
      setRevision((value) => value + 1);
    } finally { setCreating(false); }
  };
  const onSaved = (note: ResearchNote) => {
    setNotes((current) => [
      { id: note.id, projectId: note.projectId, title: note.title, updatedAt: note.updatedAt },
      ...(current ?? []).filter(({ id }) => id !== note.id),
    ]);
    if (term) setRevision((value) => value + 1);
  };
  const remove = async (id: string) => {
    if (id === activeId && guard.current?.isDirty() && !await guard.current.flush()) return false;
    const result = await coordinator.deleteResearchNote(id);
    if (!result.ok) return false;
    setNotes((current) => current?.filter((note) => note.id !== id));
    setMatches((current) => current && { ...current, notes: current.notes.filter((note) => note.id !== id) });
    setRevision((value) => value + 1);
    if (id === activeId) {
      lastNotes.delete(projectId);
      setSelected(undefined);
      setLiveTitle(undefined);
      navigate({ name: "research", projectId });
    }
    return true;
  };
  const toggle = <button type="button" aria-expanded={sidebar} aria-label={t("research.toggleSidebar")} title={t("research.toggleSidebar")} onClick={() => setSidebar(!sidebar)}>◫</button>;
  const list = term ? (matches?.query === term ? matches.notes : undefined) : notes;
  const note = selected?.id === activeId ? selected?.note : undefined;

  return <main className="research-workspace">
    {sidebar && <>
      <button type="button" tabIndex={-1} aria-hidden="true" className="research-sidebar-scrim" onClick={() => setSidebar(false)} />
      <aside className="research-sidebar" aria-label={t("research.notes")}>
        <header><h2>{t("research.notes")}</h2>
          <button type="button" className="research-new" onClick={() => void create()} disabled={creating || !ready || !store} aria-label={t("research.newNote")} title={t("research.newNote")}>＋</button>
          <button type="button" className="research-sidebar-close" onClick={() => setSidebar(false)} aria-label={t("common.close")}>×</button>
        </header>
        <input type="search" aria-label={t("research.searchNotes")} placeholder={t("research.searchNotes")} value={query}
          onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim()) setFolder(true); }} />
        <button type="button" className="research-project-folder" aria-expanded={folder} onClick={() => setFolder(!folder)}>
          <span aria-hidden="true">{folder ? "⌄" : "›"}</span><span title={workspace?.name}>{workspace?.name ?? t("nav.project")}</span><small>{notes?.length ?? ""}</small>
        </button>
        {folder && <nav aria-label={t("research.notes")} className="research-notes-list">
          {list?.map((item) => {
            const label = (liveTitle?.id === item.id ? liveTitle.title : item.title).trim() || t("research.untitled");
            return <div className="research-note-row" key={item.id}>
              <button type="button" className="research-note-open" aria-current={item.id === activeId ? "page" : undefined} title={label} onClick={() => open(item.id)}>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2h5l3 3v9H4zM9 2v4h3" stroke="currentColor" strokeLinejoin="round" /></svg><span>{label}</span>
              </button>
              <button type="button" className="research-note-delete" aria-label={t("research.deleteNamedNote", { title: label })} title={t("research.deleteNote")}
                onClick={() => setDeleteTarget({ id: item.id, title: label })}>×</button>
            </div>;
          })}
          {list?.length === 0 && <p>{t(term ? "research.noMatches" : "research.noNotes")}</p>}
        </nav>}
        {error && <div className="research-sidebar-error" role="alert">{error} <button onClick={() => setRevision((value) => value + 1)}>{t("common.retry")}</button></div>}
      </aside>
    </>}
    {note && workspace ? <ResearchEditor key={`${note.id}:${reloadNote}`} initial={note} workspace={workspace} dependencies={dependencies} navigate={navigate}
      placeNote={(current, center) => coordinator.placeResearchNote(current, center)}
      registerGuard={register} sidebarToggle={toggle} extractId={extractId} onSaved={onSaved} onReload={() => {
        setLiveTitle(undefined); setSelected(undefined); setReloadNote((value) => value + 1); setRevision((value) => value + 1);
      }} titleChanged={(title) => setLiveTitle({ id: note.id, title })} /> :
      <section className="research-editor">
        <div className="research-editor-nav">{toggle}<button type="button" onClick={() => navigate({ name: "table", projectId })}>‹ {t("research.backToTable")}</button></div>
        <div className="research-empty">
          <p>{workspaceError || (!store ? t("research.loadFailed") : loading || (activeId && selected?.id !== activeId) ? t("common.loading")
            : activeId ? t(selected?.missing ? "research.noteMissing" : "research.loadFailed") : error ?? t("research.noNotes"))}</p>
          {ready && store && !activeId && <button type="button" className="research-primary" onClick={() => void create()} disabled={creating}>{t("research.newNote")}</button>}
          {selected?.missing && <button type="button" onClick={() => navigate({ name: "research", projectId })}>{t("research.viewAll")}</button>}
          {activeId && selected?.id === activeId && !selected.missing && <button type="button" onClick={() => setReloadNote((value) => value + 1)}>{t("common.retry")}</button>}
        </div>
      </section>}
    {deleteTarget && <DeleteResearchNoteDialog title={deleteTarget.title} onClose={() => setDeleteTarget(undefined)} onDelete={() => remove(deleteTarget.id)} />}
  </main>;
}
