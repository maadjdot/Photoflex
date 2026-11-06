import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ResearchError, ResearchNode, ResearchNote, ResearchStore } from "../../contracts/research";

export interface ResearchSaveGuard {
  isDirty(): boolean;
  flush(): Promise<boolean>;
}

export function useResearchDraft(
  initial: ResearchNote,
  store: ResearchStore,
  register: (guard?: ResearchSaveGuard) => void,
  onSaved: (note: ResearchNote) => void,
) {
  const saved = useRef(initial);
  const title = useRef(initial.title);
  const readContent = useRef<() => ResearchNode>(() => initial.content);
  const edit = useRef(0);
  const committed = useRef(0);
  const inFlight = useRef<Promise<boolean> | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<"saved" | "pending" | "saving" | ResearchError>("saved");
  const [stamp, setStamp] = useState(initial.updatedAt);
  const notify = useRef(onSaved);
  notify.current = onSaved;

  const isDirty = useCallback(() => committed.current !== edit.current, []);
  const flush = useCallback((): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    if (!isDirty()) return Promise.resolve(true);
    const save = async () => {
      setStatus("saving");
      while (isDirty()) {
        const generation = edit.current;
        const result = await store.saveNote({ ...saved.current, title: title.current, content: readContent.current() });
        if (!result.ok) { setStatus(result.error); return false; }
        saved.current = result.value;
        committed.current = generation;
        setStamp(result.value.updatedAt);
        notify.current(result.value);
      }
      setStatus("saved");
      return true;
    };
    inFlight.current = save().catch(() => { setStatus("unavailable"); return false; }).finally(() => { inFlight.current = undefined; });
    return inFlight.current;
  }, [store, isDirty]);

  const changed = useCallback(() => {
    edit.current += 1;
    setStatus((current) => current === "saved" ? "pending" : current);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 600);
  }, [flush]);

  useLayoutEffect(() => {
    register({ isDirty, flush });
    return () => register(undefined);
  }, [register, isDirty, flush]);
  useEffect(() => {
    const saveWhenHidden = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [flush]);

  const copyDraft = async () => {
    const now = new Date().toISOString();
    return store.saveNote({ ...saved.current, id: crypto.randomUUID(), title: title.current,
      content: readContent.current(), createdAt: now, updatedAt: now, version: 0 });
  };

  return { saved, title, readContent, status, stamp, changed, isDirty, flush, copyDraft, discard: () => {
    window.clearTimeout(timer.current);
    committed.current = edit.current;
    setStatus("saved");
  } };
}
