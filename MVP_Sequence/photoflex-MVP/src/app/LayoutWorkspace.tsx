import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LayoutDocument, LayoutEditCommand, LayoutId, LayoutObjectId, LayoutPage, LayoutPageId, ProjectId, SequenceDocument, SequenceId } from "../contracts";
import { applyLayoutCommand } from "../modules/layout/layoutDocument";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";
import { LayoutEditor } from "./LayoutEditor";
import { PhotoThumb } from "./PhotoThumb";
import { CloudSaveStatus } from "./CloudControls";
import type { ProjectWriteCoordinator } from "./projectWriteCoordinator";
import type { AppRoute } from "./router";
import "../styles/layout-workspace.css";

const newPageId = () => crypto.randomUUID() as LayoutPageId;
const copyPage = (page: LayoutPage): LayoutPage => ({ id: newPageId(), objects: page.objects.map((object) => ({ ...object, id: crypto.randomUUID() as LayoutObjectId })) });

export function LayoutWorkspace({ dependencies, persistence, projectId, sequenceId, layoutId, navigate }: {
  dependencies: AppDependencies; persistence: ProjectWriteCoordinator; projectId: ProjectId; sequenceId: SequenceId;
  layoutId: LayoutId; navigate: (route: AppRoute) => void;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const projectWrite = useSyncExternalStore(persistence.subscribe, persistence.getSnapshot, persistence.getSnapshot);
  const [document, setDocument] = useState<LayoutDocument>();
  const documentRef = useRef<LayoutDocument | undefined>(undefined);
  const [sequence, setSequence] = useState<SequenceDocument>();
  const [loadError, setLoadError] = useState<string>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draggedPageId, setDraggedPageId] = useState<LayoutPageId>();
  const [dropPageId, setDropPageId] = useState<LayoutPageId>();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed">("idle");
  const [historyPosition, setHistoryPosition] = useState(0);
  const [reading, setReading] = useState(false);
  const readingOrigin = useRef(0);
  const lastMergeKey = useRef<string | undefined>(undefined);
  const history = useRef<LayoutDocument[]>([]);
  const historyIndex = useRef(0);
  const editSequence = useRef(0);

  useEffect(() => {
    let live = true;
    setDocument(undefined); setSequence(undefined); setLoadError(undefined);
    void Promise.all([persistence.loadLayout(layoutId), persistence.loadSequence(sequenceId)]).then(([loaded, source]) => {
      if (!live) return;
      if (!loaded.ok || !source.ok || loaded.value.id !== layoutId || loaded.value.projectId !== projectId
        || loaded.value.sequenceId !== sequenceId || source.value.projectId !== projectId) {
        setLoadError(zh ? "Layout 或所属 Sequence 不存在，或链接不匹配。" : "Layout or its Sequence was not found, or the link does not match.");
        return;
      }
      documentRef.current = loaded.value;
      history.current = [loaded.value]; historyIndex.current = 0; setHistoryPosition(0);
      setDocument(loaded.value); setSequence(source.value);
    });
    return () => { live = false; };
  }, [layoutId, persistence, projectId, sequenceId, zh]);
  useEffect(() => {
    let live = true;
    const refresh = () => { void persistence.loadSequence(sequenceId).then((result) => {
      if (live && result.ok && result.value.projectId === projectId) setSequence(result.value);
    }); };
    window.addEventListener("focus", refresh);
    return () => { live = false; window.removeEventListener("focus", refresh); };
  }, [persistence, projectId, sequenceId]);

  const save = (next: LayoutDocument) => {
    documentRef.current = next;
    setDocument(next);
    const request = ++editSequence.current;
    setSaveState("saving");
    void persistence.saveLayoutDraft(next).then((result) => {
      if (request !== editSequence.current) return;
      if (!result.ok) { setSaveState("failed"); return; }
      if (documentRef.current === next) {
        documentRef.current = result.value.layout;
        setDocument(result.value.layout);
        history.current[historyIndex.current] = result.value.layout;
      }
      setSaveState("idle");
    });
  };
  const commit = (next: LayoutDocument, mergeKey?: string) => {
    if (mergeKey && lastMergeKey.current === mergeKey && historyIndex.current > 0) {
      history.current[historyIndex.current] = next;
    } else {
      history.current = [...history.current.slice(0, historyIndex.current + 1), next];
      historyIndex.current = history.current.length - 1;
    }
    lastMergeKey.current = mergeKey;
    setHistoryPosition(historyIndex.current);
    save(next);
  };
  const command = (edit: LayoutEditCommand, mergeKey?: string) => {
    const current = documentRef.current;
    if (!current) return false;
    const changed = applyLayoutCommand(current, edit);
    if (!changed.ok) return false;
    commit(changed.value, mergeKey);
    return true;
  };
  const travel = (step: number) => {
    lastMergeKey.current = undefined;
    const nextIndex = historyIndex.current + step;
    if (nextIndex < 0 || nextIndex >= history.current.length) return;
    const selectedPageId = documentRef.current?.pages[selectedIndex]?.id;
    const nextDocument = history.current[nextIndex];
    historyIndex.current = nextIndex; setHistoryPosition(nextIndex);
    save(nextDocument);
    const restoredIndex = nextDocument.pages.findIndex((entry) => entry.id === selectedPageId);
    setSelectedIndex(restoredIndex >= 0 ? restoredIndex : Math.min(selectedIndex, nextDocument.pages.length - 1));
  };
  const retry = async () => {
    setSaveState("saving");
    const ok = await persistence.retryLayout(layoutId);
    if (!ok) { setSaveState("failed"); return; }
    const loaded = await persistence.loadLayout(layoutId);
    if (!loaded.ok) { setSaveState("failed"); return; }
    documentRef.current = loaded.value;
    history.current[historyIndex.current] = loaded.value;
    setDocument(loaded.value); setSaveState("idle");
  };

  const page = document?.pages[selectedIndex];
  const back = () => navigate({ name: "sequence", projectId, sequenceId });
  const startReading = () => { if (window.document.activeElement instanceof HTMLElement) window.document.activeElement.blur(); readingOrigin.current = selectedIndex; setReading(true); };
  const stopReading = () => { setReading(false); setSelectedIndex(readingOrigin.current); };
  const refreshPhotos = async () => {
    const loaded = await persistence.loadSequence(sequenceId);
    if (loaded.ok && loaded.value.projectId === projectId) setSequence(loaded.value);
  };
  if (loadError) return <main className="layout-workspace layout-workspace-error"><p role="alert">{loadError}</p><button onClick={back}>{zh ? "返回 Sequence" : "Back to Sequence"}</button></main>;
  if (!document || !sequence || projectWrite.loading) return <main className="layout-workspace layout-workspace-error"><div className="loading-mark" /><p>{zh ? "正在打开 Layout…" : "Opening Layout…"}</p></main>;

  const addPage = () => {
    const next: LayoutPage = { id: newPageId(), objects: [] };
    if (command({ type: "add-page", page: next, at: selectedIndex + 1 })) setSelectedIndex(selectedIndex + 1);
  };
  const duplicatePage = () => {
    if (page && command({ type: "add-page", page: copyPage(page), at: selectedIndex + 1 })) setSelectedIndex(selectedIndex + 1);
  };
  const removePage = () => {
    if (page && command({ type: "remove-page", pageId: page.id })) setSelectedIndex(Math.min(selectedIndex, document.pages.length - 2));
  };
  const movePage = (step: number) => {
    if (page && command({ type: "move-page", pageId: page.id, to: selectedIndex + step })) setSelectedIndex(selectedIndex + step);
  };
  const dropPage = (targetId: LayoutPageId) => {
    const sourceId = draggedPageId;
    setDraggedPageId(undefined); setDropPageId(undefined);
    if (!sourceId || sourceId === targetId) return;
    const from = document.pages.findIndex((entry) => entry.id === sourceId);
    const to = document.pages.findIndex((entry) => entry.id === targetId);
    if (from < 0 || to < 0) return;
    const selectedPageId = document.pages[selectedIndex].id;
    const reordered = [...document.pages];
    const [moving] = reordered.splice(from, 1);
    reordered.splice(to, 0, moving);
    if (command({ type: "move-page", pageId: sourceId, to })) setSelectedIndex(reordered.findIndex((entry) => entry.id === selectedPageId));
  };
  return <main className={`layout-workspace${reading ? " layout-reading" : ""}`} aria-label="Layout workspace">
    <header className="layout-workspace-header">
      <button onClick={reading ? stopReading : back}>{reading ? (zh ? "← 退出阅读" : "← Exit reading") : "← Sequence"}</button>
      <div><small>LAYOUT</small><strong>{document.name}</strong></div>
      <span className="layout-save-status" role="status">{saveState === "failed" ? (zh ? "保存失败" : "Save failed") : saveState === "saving" || projectWrite.saving ? (zh ? "正在保存…" : "Saving…") : (zh ? "本地已保存" : "Saved locally")}{saveState === "failed" && <button onClick={() => void retry()}>{zh ? "重试" : "Retry"}</button>}</span>
      <CloudSaveStatus dependencies={dependencies} projectId={projectId} />
      {!reading && <div className="layout-header-actions"><button disabled={historyPosition === 0} onClick={() => travel(-1)}>{zh ? "撤销" : "Undo"}</button><button disabled={historyPosition >= history.current.length - 1} onClick={() => travel(1)}>{zh ? "重做" : "Redo"}</button><button onClick={startReading}>{zh ? "阅读" : "Read"}</button><button disabled title={zh ? "PDF 导出将在 L5 提供" : "PDF export arrives in L5"}>PDF</button></div>}
    </header>
    <div className="layout-workspace-body">
      <aside className="layout-pages-panel" aria-label={zh ? "页面" : "Pages"}>
        <div className="layout-panel-heading"><strong>{zh ? "页面" : "Pages"}</strong><span>{document.pages.length}</span></div>
        <div className="layout-pages-list">{document.pages.map((entry, index) => { const firstImage = entry.objects.find((object) => object.kind === "image-frame" && object.photoId); const photoId = firstImage?.kind === "image-frame" ? firstImage.photoId : null; return <button key={entry.id} draggable className={`${index === selectedIndex ? "is-selected" : ""}${dropPageId === entry.id && draggedPageId !== entry.id ? " is-drop-target" : ""}`} onClick={() => setSelectedIndex(index)} aria-current={index === selectedIndex ? "page" : undefined} onDragStart={(event) => { setDraggedPageId(entry.id); event.dataTransfer.setData("application/x-photoflex-layout-page-id", entry.id); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => { if (draggedPageId) { event.preventDefault(); setDropPageId(entry.id); } }} onDragLeave={() => setDropPageId((current) => current === entry.id ? undefined : current)} onDrop={(event) => { event.preventDefault(); dropPage(entry.id); }} onDragEnd={() => { setDraggedPageId(undefined); setDropPageId(undefined); }}><span className="layout-page-mini" style={{ aspectRatio: `${document.pageSpec.widthPt} / ${document.pageSpec.heightPt}` }}>{photoId ? <PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt="" fit="contain" /> : entry.objects.length > 0 && <i />}</span><span>{zh ? `第 ${index + 1} 页` : `Page ${index + 1}`}</span><span className="layout-page-grip" aria-hidden="true">⠿</span></button>; })}</div>
        <div className="layout-page-actions"><button onClick={addPage}>{zh ? "＋ 空白页" : "+ Blank page"}</button><button onClick={duplicatePage}>{zh ? "复制页" : "Duplicate"}</button><button disabled={document.pages.length <= 1} onClick={removePage}>{zh ? "删除页" : "Delete"}</button><button disabled={selectedIndex === 0} onClick={() => movePage(-1)}>{zh ? "前移" : "Move earlier"}</button><button disabled={selectedIndex === document.pages.length - 1} onClick={() => movePage(1)}>{zh ? "后移" : "Move later"}</button></div>
      </aside>
      <LayoutEditor document={document} sequence={sequence} dependencies={dependencies} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex} command={command} onRefreshPhotos={refreshPhotos} reading={reading} />
    </div>
  </main>;
}
