import { Extension, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useContext, useEffect, useState } from "react";
import type { ResearchNote } from "../../contracts/research";
import { useLocale } from "../locale";
import { ResearchBlocks, ResearchImageBlock } from "./editorExtensions";
import { ResearchMediaContext } from "./ResearchImageView";
import { TableResearchContext } from "./TableResearch";
import { useResearchDraft, type ResearchSaveGuard } from "./useResearchDraft";

const formattingShortcuts = new Set(["blockquote", "bold", "bulletList", "code", "codeBlock", "heading", "italic", "orderedList", "strike", "underline"]);
const textStarterKit = StarterKit.extend({
  addExtensions() {
    return this.parent?.().map((extension) => formattingShortcuts.has(extension.name)
      ? extension.extend({ addKeyboardShortcuts: () => ({}) }) : extension) ?? [];
  },
}).configure({ link: { openOnClick: false, autolink: false, linkOnPaste: false } });

function imageBlocks(doc: ProseMirrorNode) {
  const blocks: { node: ProseMirrorNode; position: number }[] = [];
  doc.descendants((node, position) => { if (node.type.name === ResearchImageBlock.name) blocks.push({ node, position }); });
  return blocks;
}

const protectImages = Extension.create({
  addProseMirrorPlugins: () => [new Plugin({
    appendTransaction(transactions, previous, next) {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      const images = imageBlocks(previous.doc);
      if (!images.length) return null;
      const remaining = imageBlocks(next.doc);
      const missing = images.filter(({ node }) => {
        const index = remaining.findIndex((candidate) => node.eq(candidate.node));
        if (index === -1) return true;
        remaining.splice(index, 1);
        return false;
      });
      if (!missing.length) return null;

      // Replacing a text selection can span hidden image blocks. Keep those attachments in the note.
      const mapping = new Mapping();
      transactions.forEach((transaction) => mapping.appendMapping(transaction.mapping));
      const restore = next.tr;
      for (const { node, position } of missing) {
        const at = restore.mapping.map(mapping.map(position));
        restore.replaceRangeWith(at, at, node);
      }
      return restore;
    },
  })],
});

const extensions = [textStarterKit, ResearchBlocks, ResearchImageBlock, protectImages];

export default function TableNoteEditor({ id, autoFocus, disabled }: { id: string; autoFocus: boolean; disabled: boolean }) {
  const { t } = useLocale();
  const { projectId, store } = useContext(ResearchMediaContext)!;
  const [initial, setInitial] = useState<ResearchNote>();
  const [loadError, setLoadError] = useState<"missing" | "unavailable">();
  const [reload, setReload] = useState(0);
  const reloadNote = () => { setInitial(undefined); setLoadError(undefined); setReload((value) => value + 1); };
  useEffect(() => {
    let active = true;
    void store.loadNote(projectId, id).then((result) => {
      if (!active) return;
      if (result.ok) setInitial(result.value);
      else setLoadError(result.error === "missing" ? "missing" : "unavailable");
    });
    return () => { active = false; };
  }, [id, projectId, reload, store]);
  if (!initial) return <p className="table-note-status">{t(loadError === "missing" ? "research.noteMissing" : loadError ? "research.loadFailed" : "common.loading")}
    {loadError === "unavailable" && <button type="button" onClick={reloadNote}>{t("common.retry")}</button>}</p>;
  return <NoteFields initial={initial} autoFocus={autoFocus && !reload} disabled={disabled} onReload={reloadNote} />;
}

function NoteFields({ initial, autoFocus, disabled, onReload }: { initial: ResearchNote; autoFocus: boolean; disabled: boolean; onReload: () => void }) {
  const { t } = useLocale();
  const { store } = useContext(ResearchMediaContext)!;
  const { registerNoteGuard, noteSaved } = useContext(TableResearchContext)!;
  const register = useCallback((guard?: ResearchSaveGuard) => registerNoteGuard(initial.id, guard), [initial.id, registerNoteGuard]);
  const draft = useResearchDraft(initial, store, register, ({ id, projectId, title, updatedAt }) => noteSaved({ id, projectId, title, updatedAt }));
  const [title, setTitle] = useState(initial.title);
  const editor = useEditor({
    extensions,
    content: initial.content as JSONContent,
    editable: !disabled,
    enableInputRules: false,
    enablePasteRules: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "table-note-text", role: "textbox", "aria-multiline": "true", "aria-label": t("research.body"), "data-placeholder": t("research.bodyPlaceholder") },
      handleDOMEvents: {
        paste: (view, event) => {
          event.preventDefault();
          const text = event.clipboardData?.getData("text/plain");
          if (text) view.pasteText(text);
          return true;
        },
        drop: (_view, event) => { event.preventDefault(); event.stopPropagation(); return true; },
      },
    },
    onUpdate: ({ editor: current }) => {
      const content = current.getJSON();
      draft.readContent.current = () => content;
      draft.changed();
    },
  });
  useEffect(() => { editor?.setEditable(!disabled, false); }, [disabled, editor]);
  const needsReload = draft.status === "conflict" || draft.status === "missing";

  return <div className="table-research-card-body" onKeyDown={(event) => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) event.currentTarget.closest<HTMLElement>("article")?.focus();
  }}>
    <input className="table-note-title" autoFocus={autoFocus && !disabled} disabled={disabled} value={title} aria-label={t("research.title")}
      placeholder={t("research.untitled")} onChange={(event) => {
        const value = event.target.value;
        setTitle(value);
        draft.title.current = value;
        noteSaved({ id: initial.id, projectId: initial.projectId, updatedAt: draft.saved.current.updatedAt, title: value });
        draft.changed();
      }} />
    <EditorContent className="table-note-editor" editor={editor} />
    {(needsReload || draft.status === "unavailable") && <div className="table-note-status" role="alert">{t("research.saveFailed")} {needsReload
      ? <button type="button" onClick={() => { draft.discard(); onReload(); }}>{t("research.reloadSaved")}</button>
      : <button type="button" onClick={() => void draft.flush()}>{t("common.retry")}</button>}</div>}
  </div>;
}
