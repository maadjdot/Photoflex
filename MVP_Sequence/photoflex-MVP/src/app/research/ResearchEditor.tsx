import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import type { Transaction } from "@tiptap/pm/state";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProjectWorkspace } from "../../contracts";
import type { ResearchAnchor, ResearchExtract, ResearchImage, ResearchNote } from "../../contracts/research";
import { imagesIn, resolveAnchor, textBlocks } from "../../modules/research/content";
import type { AppDependencies } from "../dependencies";
import { useLocale } from "../locale";
import type { AppRoute } from "../router";
import { ResearchBlocks, ResearchImages, anchorForSelection, extractMarkersKey, rangeForAnchor, sourceHighlightKey } from "./editorExtensions";
import { ResearchDialog, ResearchImagePicker, ResearchImagePreview, imageFileSupported, readResearchImage } from "./ResearchMedia";
import { ResearchMediaContext } from "./ResearchImageView";
import { useResearchDraft, type ResearchSaveGuard } from "./useResearchDraft";
import type { ProjectWriteCoordinator } from "../projectWriteCoordinator";
import { TableToolbarIcon } from "../TableToolbarIcon";

const extensions = [StarterKit.configure({ link: { openOnClick: false } }), ResearchBlocks, ResearchImages];
const scrollPositions = new Map<string, number>();

export function ResearchEditor({ initial, workspace, dependencies, navigate, registerGuard, onSaved, sidebarToggle, extractId, titleChanged, onReload, placeNote }: {
  initial: ResearchNote;
  workspace: ProjectWorkspace;
  dependencies: AppDependencies;
  navigate: (route: AppRoute) => void;
  registerGuard: (guard?: ResearchSaveGuard) => void;
  onSaved: (note: ResearchNote) => void;
  sidebarToggle: React.ReactNode;
  extractId?: string;
  titleChanged: (title: string) => void;
  onReload: () => void;
  placeNote: ProjectWriteCoordinator["placeResearchNote"];
}) {
  const { t, locale } = useLocale();
  const store = dependencies.projectStore.research!;
  const { projectId } = initial;
  const pendingImages = useRef(new Set<Promise<void>>());
  const register = useCallback((guard?: ResearchSaveGuard) => registerGuard(guard && {
    isDirty: () => pendingImages.current.size > 0 || guard.isDirty(),
    flush: async () => {
      while (pendingImages.current.size) await Promise.all(pendingImages.current);
      return guard.flush();
    },
  }), [registerGuard]);
  const draft = useResearchDraft(initial, store, register, onSaved);
  const [title, setTitle] = useState(initial.title);
  const [imageCount, setImageCount] = useState(() => imagesIn(initial.content).length);
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState<ResearchImage>();
  const [extractPanel, setExtractPanel] = useState(false);
  const [extracts, setExtracts] = useState<readonly ResearchExtract[]>([]);
  const [removeExtract, setRemoveExtract] = useState<{ id: string; placements: number }>();
  const [blocks, setBlocks] = useState(() => textBlocks(initial.content));
  const [notice, setNotice] = useState<string>();
  const [sent, setSent] = useState<string>();
  const [working, setWorking] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [link, setLink] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const transfer = useRef<(editor: Editor, files: File[], pos?: number) => void>(() => {});
  const scrollKey = JSON.stringify([projectId, initial.id]);
  const editor = useEditor({
    extensions,
    content: initial.content as JSONContent,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "research-prose", role: "textbox", "aria-multiline": "true", "aria-label": t("research.body") },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
        if (!files.length || !editor) return false;
        transfer.current(editor, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length || !editor) return false;
        transfer.current(editor, files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      draft.readContent.current = () => current.getJSON();
      draft.changed();
    },
  });

  const context = useMemo(() => ({ projectId, source: dependencies.photoSource, sources: workspace.sources, store, preview: setPreview }),
    [projectId, dependencies.photoSource, workspace.sources, store]);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scrollPositions.get(scrollKey) ?? 0;
  }, [scrollKey]);
  useEffect(() => {
    const saved = draft.saved.current;
    setImageCount(imagesIn(saved.content).length);
    setBlocks(textBlocks(saved.content));
  }, [draft.saved, draft.stamp]);

  const importFiles = async (files: File[]) => {
    try {
      const items = await Promise.all(files.filter(imageFileSupported).map((file) => readResearchImage(file, projectId)));
      if (!items.length) return [];
      const result = await store.addMaterials(projectId, items);
      return result.ok ? items.map(({ id, name }) => ({ id, name, projectId })) : [];
    } catch { return []; }
  };
  const insert = (target: Editor, position: number, images: ResearchImage[]) => {
    target.chain().focus().insertContentAt(position, { type: "researchImages", attrs: { images } }).run();
    setImageCount(imagesIn(target.getJSON()).length);
  };
  transfer.current = (target, files, pos) => {
    let position = pos ?? target.state.selection.from;
    const remap = ({ transaction }: { transaction: Transaction }) => { position = transaction.mapping.map(position); };
    target.on("transaction", remap);
    const pending = importFiles(files).then((items) => {
      if (target.isDestroyed) return;
      if (items.length !== files.length) setNotice(t("research.uploadFailed"));
      if (items.length) insert(target, position, items.map(({ id }) => ({ id, kind: "research", caption: "" })));
    }).catch(() => { setNotice(t("research.uploadFailed")); }).finally(() => {
      target.off("transaction", remap);
      pendingImages.current.delete(pending);
    });
    pendingImages.current.add(pending);
  };
  const refreshExtracts = useCallback(async () => {
    const result = await store.listExtracts(projectId, initial.id);
    if (result.ok) setExtracts(result.value.filter((extract) => !extract.deletedAt));
    return result;
  }, [store, projectId, initial.id]);
  useEffect(() => { if (!extractId) void refreshExtracts(); }, [extractId, refreshExtracts]);
  useEffect(() => {
    if (!editor || editor.isDestroyed || draft.isDirty()) return;
    const ranges = extracts.flatMap((extract) => {
      const resolved = resolveAnchor(blocks, extract.anchor);
      const range = "anchor" in resolved && rangeForAnchor(editor.state.doc, resolved.anchor);
      return range ? [range] : [];
    });
    editor.view.dispatch(editor.state.tr.setMeta(extractMarkersKey, ranges));
  }, [editor, blocks, extracts, draft.isDirty]);
  useEffect(() => {
    if (!editor || !extractId) return;
    let active = true;
    let timer: number | undefined;
    void refreshExtracts().then((result) => {
      if (!active || editor.isDestroyed) return;
      const extract = result.ok && result.value.find((item) => item.id === extractId && !item.deletedAt);
      const resolved = extract && resolveAnchor(textBlocks(editor.getJSON()), extract.anchor);
      const range = resolved && "anchor" in resolved && rangeForAnchor(editor.state.doc, resolved.anchor);
      if (range) {
        editor.view.dispatch(editor.state.tr.setMeta(sourceHighlightKey, range));
        requestAnimationFrame(() => {
          if (!editor.isDestroyed) editor.view.dom.querySelector(".research-source-highlight")?.scrollIntoView({ block: "center" });
        });
        timer = window.setTimeout(() => {
          if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(sourceHighlightKey, null));
        }, 3000);
      } else setNotice(t("research.sourceMoved"));
    });
    return () => { active = false; window.clearTimeout(timer); };
  }, [editor, extractId, initial.id, refreshExtracts, t]);

  const run = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try { await action(); }
    catch { setNotice(t("research.operationFailed")); }
    finally { busy.current = false; setWorking(false); }
  };
  const saveExtract = (existing?: ResearchExtract, place = true, selection?: ResearchAnchor) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const anchor: ResearchAnchor | undefined = selection ?? (existing
      ? (() => { const match = resolveAnchor(textBlocks(editor.getJSON()), existing.anchor); return match.status === "current" ? match.anchor : undefined; })()
      : anchorForSelection(editor.state.doc, from, to));
    if (!anchor || anchor.start.blockId !== anchor.end.blockId) { setNotice(t("research.selectPassage")); return; }
    void run(async () => {
      if (!await draft.flush()) return;
      const saved = draft.saved.current;
      const extract: ResearchExtract = { id: existing?.id ?? crypto.randomUUID(), noteId: saved.id, projectId,
        anchor, snapshot: anchor.quote.exact, acceptedVersion: saved.version, note: "" };
      const viewport = workspace.resumeContext?.tableViewport;
      const width = 290, height = 190;
      const zoom = viewport?.zoom || 1;
      const placement = { id: crypto.randomUUID(), extractId: extract.id, text: extract.snapshot, width, height, fontSize: 15, photoIds: [],
        x: (window.innerWidth / 2 - (viewport?.originX ?? 0)) / zoom - width / 2, y: (window.innerHeight / 2 - (viewport?.originY ?? 0)) / zoom - height / 2 };
      const result = await store.saveExtract(saved, extract, place ? placement : undefined);
      if (result.ok) {
        if (place) { setSent(placement.id); setExtractPanel(false); }
        else setNotice(t("research.extractCreated"));
        await refreshExtracts();
        if (!editor.isDestroyed) editor.commands.setTextSelection(to);
      } else setNotice(t(result.error === "invalid-selection" ? "research.invalidPassage" : "research.operationFailed"));
    });
  };
  const updateExtract = (previous: ResearchExtract, update: (note: ResearchNote) => ResearchExtract) => void run(async () => {
    if (!await draft.flush()) return;
    const current = draft.saved.current;
    const result = await store.updateExtract(current, previous, update(current));
    if (result.ok) await refreshExtracts();
    else setNotice(t("research.operationFailed"));
  });
  const showError = draft.status === "conflict" || draft.status === "unavailable" || draft.status === "missing";
  const currentTitle = title.trim() || t("research.untitled");
  const noteCard = workspace.worktableDraft.memos?.find((memo) => memo.researchNoteId === initial.id);
  const noteCardAction = t(noteCard ? "research.viewNoteCard" : "research.placeNoteCard");
  const openNoteCard = () => void run(async () => {
    if (noteCard) { navigate({ name: "table", projectId, focusNoteCardId: noteCard.id }); return; }
    if (!await draft.flush()) return;
    const viewport = workspace.resumeContext?.tableViewport;
    const zoom = viewport?.zoom || 1;
    const result = await placeNote(draft.saved.current, {
      x: (window.innerWidth / 2 - (viewport?.originX ?? 0)) / zoom,
      y: (window.innerHeight / 2 - (viewport?.originY ?? 0)) / zoom,
    });
    if (result.ok) navigate({ name: "table", projectId, focusNoteCardId: result.value.cardId });
    else setNotice(t("research.operationFailed"));
  });

  return <ResearchMediaContext.Provider value={context}>
    <section className="research-editor" aria-label={t("research.editor")}>
      <div className="research-editor-nav">{sidebarToggle}
        <button type="button" onClick={() => navigate({ name: "table", projectId })}>‹ <span>{t("research.backToTable")}</span></button>
        <span className="research-current-title" title={currentTitle}>{currentTitle}</span>
        <button type="button" className="research-insert" onClick={() => setPicker(true)} disabled={!editor}>＋ {t("research.insertImage")}</button>
        <button type="button" aria-label={noteCardAction} title={noteCardAction} disabled={working} onClick={openNoteCard}><TableToolbarIcon name="memo" /></button>
        <button type="button" title={t("research.extracts")} aria-label={t("research.extracts")} onClick={() => void run(async () => {
          if (!await draft.flush()) return;
          const result = await refreshExtracts();
          if (result.ok) setExtractPanel(true);
          else setNotice(t("research.operationFailed"));
        })}>❞</button>
      </div>
      <div className="research-scroll" ref={scroll} onScroll={(event) => scrollPositions.set(scrollKey, event.currentTarget.scrollTop)}>
        <article className="research-document">
          <input className="research-title" autoFocus={!initial.title && !extractId} aria-label={t("research.title")} placeholder={t("research.untitled")}
            value={title} onChange={(event) => { const next = event.target.value; draft.title.current = next; setTitle(next); titleChanged(next); draft.changed(); }}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); editor?.commands.focus("start"); } }} />
          <EditorContent editor={editor} />
          {editor && <BubbleMenu editor={editor} shouldShow={({ state }) => !state.selection.empty && state.selection.$from.parent.isTextblock && !picker && !editingLink}
            className="research-format" options={{ placement: "top", offset: 8 }}>
            <button type="button" aria-label={t("research.bold")} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
            <button type="button" aria-label={t("research.italic")} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
            <button type="button" aria-label={t("research.heading")} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H₂</button>
            <button type="button" aria-label={t("research.list")} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()}>☷</button>
            <button type="button" aria-label={t("research.quote")} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</button>
            <button type="button" aria-label={t("research.link")} onMouseDown={(event) => event.preventDefault()} onClick={() => {
              setLink(editor.getAttributes("link").href ?? ""); setEditingLink(true);
            }}>↗</button>
            <button type="button" disabled={working} aria-label={t("research.createExtract")} onMouseDown={(event) => event.preventDefault()} onClick={() => saveExtract(undefined, false)}>❞</button>
            <button type="button" disabled={working} onMouseDown={(event) => event.preventDefault()} onClick={() => saveExtract()}>{t("research.sendToTable")}</button>
          </BubbleMenu>}
        </article>
      </div>
      {(showError || notice || sent) && <div className="research-feedback" role={showError ? "alert" : "status"}>
        {showError ? t(draft.status === "conflict" ? "research.conflict" : "research.saveFailed") : notice ?? t("research.sent")}
        {showError && <button type="button" onClick={() => void draft.flush()}>{t("common.retry")}</button>}
        {showError && <button type="button" disabled={working} onClick={() => void run(async () => {
          const copy = await draft.copyDraft();
          if (copy.ok) { draft.discard(); onSaved(copy.value); navigate({ name: "research", projectId, noteId: copy.value.id }); }
          else setNotice(t("research.operationFailed"));
        })}>{t("research.keepCopy")}</button>}
        {draft.status === "conflict" && <button type="button" onClick={() => { draft.discard(); onReload(); }}>{t("research.reloadSaved")}</button>}
        {sent && <button type="button" onClick={() => navigate({ name: "table", projectId, focusExtractId: sent })}>{t("research.viewOnTable")}</button>}
        {!showError && <button type="button" aria-label={t("common.close")} onClick={() => { setNotice(undefined); setSent(undefined); }}>×</button>}
      </div>}
      <footer className="research-status">
        <time dateTime={draft.stamp}>{new Date(draft.stamp).toLocaleDateString(locale)}</time>
        <span>{t("research.imageCount", { count: imageCount })}</span>
        <span role="status">{t(showError ? "research.unsaved" : draft.status === "saved" ? "research.saved" : "research.saving")}</span>
      </footer>
    </section>
    {picker && editor && <ResearchImagePicker close={() => setPicker(false)} importFiles={importFiles} insert={(images) => {
      const position = editor.state.selection.from;
      setPicker(false);
      requestAnimationFrame(() => { if (!editor.isDestroyed) insert(editor, position, images); });
    }} />}
    {preview && <ResearchImagePreview image={preview} close={() => setPreview(undefined)} />}
    {editingLink && editor && <ResearchDialog title={t("research.link")} close={() => setEditingLink(false)}>
      <form onSubmit={(event) => {
        event.preventDefault();
        const chain = editor.chain().extendMarkRange("link");
        if (link.trim()) {
          if (!chain.setLink({ href: link.trim() }).run()) return;
        } else chain.unsetLink().run();
        setEditingLink(false);
        requestAnimationFrame(() => editor.commands.focus());
      }}>
        <input type="url" aria-label={t("research.link")} value={link} onChange={(event) => setLink(event.target.value)} />
        <footer><button className="research-primary" type="submit">{t("common.save")}</button></footer>
      </form>
    </ResearchDialog>}
    {extractPanel && <ResearchDialog title={t("research.extracts")} close={() => { setExtractPanel(false); setRemoveExtract(undefined); }}>
      <div className="research-extract-list">
        {!extracts.length && <p>{t("research.noExtracts")}</p>}
        {extracts.map((extract) => {
          const match = resolveAnchor(blocks, extract.anchor);
          const changed = match.status === "changed" && "anchor" in match && extract.dismissedVersion !== draft.saved.current.version;
          return <section key={extract.id}>
            <blockquote>{extract.snapshot}</blockquote>
            <p>{t(changed ? "research.extractChanged" : match.status === "current" ? "research.extractCurrent" : match.status === "changed" ? "research.snapshotKept" : "research.sourceMoved")}</p>
            {changed && <><blockquote>{match.anchor.quote.exact}</blockquote>
              <button type="button" disabled={working} onClick={() => updateExtract(extract, (note) => ({ ...extract, dismissedVersion: note.version }))}>{t("research.keepSnapshot")}</button>
              <button type="button" disabled={working} onClick={() => updateExtract(extract, (note) => ({ ...extract, anchor: match.anchor,
                snapshot: match.anchor.quote.exact, acceptedVersion: note.version, dismissedVersion: undefined }))}>{t("research.acceptSource")}</button>
              <button type="button" disabled={working} onClick={() => saveExtract(undefined, false, match.anchor)}>{t("research.extractFromUpdated")}</button>
            </>}
            {"anchor" in match && <button type="button" onClick={() => { setExtractPanel(false); navigate({ name: "research", projectId, noteId: initial.id, extractId: extract.id }); }}>{t("research.openSource")}</button>}
            {match.status === "current" && <button type="button" disabled={working} onClick={() => saveExtract(extract)}>{t("research.sendToTable")}</button>}
            {!("anchor" in match) && editor && <button type="button" disabled={working} onClick={() => {
              const { from, to } = editor.state.selection;
              const anchor = anchorForSelection(editor.state.doc, from, to);
              if (anchor && anchor.start.blockId === anchor.end.blockId) updateExtract(extract, (note) => ({
                ...extract, anchor, snapshot: anchor.quote.exact, acceptedVersion: note.version, dismissedVersion: undefined,
              }));
              else { setExtractPanel(false); setNotice(t("research.selectPassage")); }
            }}>{t("research.rebindSource")}</button>}
            <ExtractAnnotation initial={extract.note} disabled={working} save={(note) => updateExtract(extract, () => ({ ...extract, note }))} />
            {removeExtract?.id === extract.id ? <div>
              <p>{t("research.deleteExtractPrompt", { count: removeExtract.placements })}</p>
              <button type="button" onClick={() => setRemoveExtract(undefined)}>{t("common.cancel")}</button>
              <button type="button" disabled={working} onClick={() => {
                setRemoveExtract(undefined);
                updateExtract(extract, () => ({ ...extract, deletedAt: new Date().toISOString() }));
              }}>{t("common.delete")}</button>
            </div> : <button type="button" disabled={working} onClick={() => void run(async () => {
              const result = await dependencies.projectStore.loadWorkspace(projectId);
              if (result.ok) setRemoveExtract({ id: extract.id, placements: result.value.worktableDraft.memos?.filter((memo) => memo.extractId === extract.id).length ?? 0 });
              else setNotice(t("research.operationFailed"));
            })}>{t("research.deleteExtract")}</button>}
          </section>;
        })}
      </div>
    </ResearchDialog>}
  </ResearchMediaContext.Provider>;
}

function ExtractAnnotation({ initial, disabled, save }: { initial: string; disabled: boolean; save: (value: string) => void }) {
  const { t } = useLocale();
  const [value, setValue] = useState(initial);
  return <form onSubmit={(event) => { event.preventDefault(); save(value); }}>
    <input aria-label={t("research.extractNote")} placeholder={t("research.extractNote")} value={value} onChange={(event) => setValue(event.target.value)} />
    <button type="submit" disabled={disabled || value === initial}>{t("common.save")}</button>
  </form>;
}
