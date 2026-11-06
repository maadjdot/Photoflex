import { createContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PhotoId, PhotoSource, ProjectId, SourceRecord } from "../../contracts";
import type { ResearchExtract, ResearchNoteSummary, ResearchStore } from "../../contracts/research";
import type { AppRoute } from "../router";
import { useLocale } from "../locale";
import { ResearchMediaContext } from "./ResearchImageView";
import { DeleteResearchNoteDialog } from "./DeleteResearchNoteDialog";
import type { ResearchSaveGuard } from "./useResearchDraft";
import "../../styles/research.css";

export const TableResearchContext = createContext<{
  extracts: ReadonlyMap<string, ResearchExtract>;
  notes: ReadonlyMap<string, ResearchNoteSummary>;
  loaded: boolean;
  noteSaved: (note: Pick<ResearchNoteSummary, "id" | "projectId" | "title" | "updatedAt">) => void;
  registerNoteGuard: (id: string, guard?: ResearchSaveGuard) => void;
  requestDelete: (id: string) => void;
  openNote: (id: string) => void;
  openSource: (extract: ResearchExtract) => void;
} | undefined>(undefined);

export function TableResearch({ projectId, store, noteCount, hasExtracts, source, sources, navigate, registerGuard, onDeleteNote, children }: {
  projectId: ProjectId;
  store?: ResearchStore;
  noteCount: number;
  hasExtracts: boolean;
  source: PhotoSource;
  sources: readonly SourceRecord[];
  navigate: (route: AppRoute) => void;
  registerGuard: (guard?: ResearchSaveGuard) => void;
  onDeleteNote: (id: string) => Promise<boolean>;
  children: ReactNode;
}) {
  const [data, setData] = useState<{ projectId: ProjectId; extracts: ReadonlyMap<string, ResearchExtract>; notes: ReadonlyMap<string, ResearchNoteSummary> }>();
  const [deleteId, setDeleteId] = useState<string>();
  const guards = useRef(new Map<string, ResearchSaveGuard>());
  const registerNoteGuard = useCallback((id: string, guard?: ResearchSaveGuard) => {
    if (guard) guards.current.set(id, guard);
    else guards.current.delete(id);
  }, []);
  useLayoutEffect(() => {
    if (!store) return;
    registerGuard({
      isDirty: () => [...guards.current.values()].some((guard) => guard.isDirty()),
      flush: async () => (await Promise.all([...guards.current.values()].map((guard) => guard.flush()))).every(Boolean),
    });
    return () => registerGuard(undefined);
  }, [registerGuard, store]);
  useEffect(() => {
    if (!store || (!noteCount && !hasExtracts)) return;
    let active = true;
    void Promise.all([hasExtracts ? store.listExtracts(projectId) : undefined, store.listNotes(projectId)]).then(([extracts, notes]) => {
      if (active && notes.ok) setData({ projectId, extracts: new Map(extracts?.ok ? extracts.value.map((row) => [row.id, row]) : []),
        notes: new Map(notes.value.map((row) => [row.id, row])) });
    });
    return () => { active = false; };
  }, [noteCount, hasExtracts, projectId, store]);
  const media = useMemo(() => store && { projectId, store, source, sources }, [projectId, store, source, sources]);
  const current = data?.projectId === projectId ? data : undefined;
  const cards = <TableResearchContext.Provider value={media ? {
    extracts: current?.extracts ?? new Map(), notes: current?.notes ?? new Map(), loaded: Boolean(current),
    registerNoteGuard, requestDelete: setDeleteId,
    noteSaved: (note) => setData((previous) => previous?.projectId === projectId ? {
      ...previous, notes: new Map(previous.notes).set(note.id, { ...previous.notes.get(note.id), ...note }),
    } : previous),
    openNote: (noteId) => navigate({ name: "research", projectId, noteId }),
    openSource: (extract) => navigate({ name: "research", projectId, noteId: extract.noteId, extractId: extract.id }),
  } : undefined}>
    {children}
    {deleteId && <DeleteResearchNoteDialog title={current?.notes.get(deleteId)?.title ?? ""} onClose={() => setDeleteId(undefined)} onDelete={async () => {
      const guard = guards.current.get(deleteId);
      return (!guard?.isDirty() || await guard.flush()) && await onDeleteNote(deleteId);
    }} />}
  </TableResearchContext.Provider>;
  return media ? <ResearchMediaContext.Provider value={media}>{cards}</ResearchMediaContext.Provider> : cards;
}

export function PhotoResearchNotes({ projectId, photoId, store, navigate }: {
  projectId: ProjectId; photoId: PhotoId; store: ResearchStore; navigate: (route: AppRoute) => void;
}) {
  const { t } = useLocale();
  const [notes, setNotes] = useState<readonly ResearchNoteSummary[]>([]);
  useEffect(() => {
    let active = true;
    void store.listNotes(projectId).then((result) => {
      if (active && result.ok) setNotes(result.value.filter((note) => note.photoIds?.includes(photoId)));
    });
    return () => { active = false; };
  }, [store, projectId, photoId]);
  if (!notes.length) return null;
  return <aside className="table-related-notes" aria-label={t("research.relatedNotes")}>
    <strong>{t("research.relatedNotes")}</strong>
    {notes.map((note) => <button type="button" key={note.id} onClick={() => navigate({ name: "research", projectId, noteId: note.id })}>
      {note.title.trim() || t("research.untitled")}
    </button>)}
  </aside>;
}
