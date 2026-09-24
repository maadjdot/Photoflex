import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LayoutDocument, LayoutEditCommand, LayoutId, LayoutObjectId, LayoutPage, LayoutPageId, ProjectId, SequenceDocument, SequenceId } from "../contracts";
import { applyLayoutCommand } from "../modules/layout/layoutDocument";
import { facingPageIndices } from "../modules/layout/layoutPages";
import { visiblePhotoRange } from "../modules/sequence/horizontalSequenceViewport";
import { MM_TO_PT } from "../modules/page-layout/pageGeometry";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";
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
  const [facing, setFacing] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed">("idle");
  const [historyPosition, setHistoryPosition] = useState(0);
  const history = useRef<LayoutDocument[]>([]);
  const historyIndex = useRef(0);
  const editSequence = useRef(0);
  const [strip, setStrip] = useState({ left: 0, width: 800 });

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
  const commit = (next: LayoutDocument) => {
    history.current = [...history.current.slice(0, historyIndex.current + 1), next];
    historyIndex.current = history.current.length - 1;
    setHistoryPosition(historyIndex.current);
    save(next);
  };
  const command = (edit: LayoutEditCommand) => {
    const current = documentRef.current;
    if (!current) return false;
    const changed = applyLayoutCommand(current, edit);
    if (!changed.ok) return false;
    commit(changed.value);
    return true;
  };
  const travel = (step: number) => {
    const nextIndex = historyIndex.current + step;
    if (nextIndex < 0 || nextIndex >= history.current.length) return;
    historyIndex.current = nextIndex; setHistoryPosition(nextIndex);
    save(history.current[nextIndex]);
    setSelectedIndex((index) => Math.min(index, history.current[nextIndex].pages.length - 1));
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

  const photos = useMemo(() => sequence?.items.filter((item) => item.kind === "photo") ?? [], [sequence]);
  const visible = visiblePhotoRange(strip.left, { count: photos.length, itemWidth: 92, gap: 10, sidePadding: 12, viewportWidth: strip.width });
  const page = document?.pages[selectedIndex];
  const display = document ? facing ? facingPageIndices(document.pages.length, selectedIndex) : [selectedIndex] : [];
  const pageHeight = 450 * zoom;
  const pageWidth = document ? pageHeight * document.pageSpec.widthPt / document.pageSpec.heightPt : 0;
  const back = () => navigate({ name: "sequence", projectId, sequenceId });
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
  return <main className="layout-workspace" aria-label="Layout workspace">
    <header className="layout-workspace-header">
      <button onClick={back}>{zh ? "← Sequence" : "← Sequence"}</button>
      <div><small>LAYOUT</small><strong>{document.name}</strong></div>
      <span className="layout-save-status" role="status">{saveState === "failed" ? (zh ? "保存失败" : "Save failed") : saveState === "saving" || projectWrite.saving ? (zh ? "正在保存…" : "Saving…") : (zh ? "本地已保存" : "Saved locally")}{saveState === "failed" && <button onClick={() => void retry()}>{zh ? "重试" : "Retry"}</button>}</span>
      <CloudSaveStatus dependencies={dependencies} projectId={projectId} />
      <div className="layout-header-actions"><button disabled={historyPosition === 0} onClick={() => travel(-1)}>{zh ? "撤销" : "Undo"}</button><button disabled={historyPosition >= history.current.length - 1} onClick={() => travel(1)}>{zh ? "重做" : "Redo"}</button><button disabled title={zh ? "阅读模式将在 L4 提供" : "Reading mode arrives in L4"}>{zh ? "阅读" : "Read"}</button><button disabled title={zh ? "PDF 导出将在 L5 提供" : "PDF export arrives in L5"}>PDF</button></div>
    </header>
    <div className="layout-workspace-body">
      <aside className="layout-pages-panel" aria-label={zh ? "页面" : "Pages"}>
        <div className="layout-panel-heading"><strong>{zh ? "页面" : "Pages"}</strong><span>{document.pages.length}</span></div>
        <div className="layout-pages-list">{document.pages.map((entry, index) => <button key={entry.id} className={index === selectedIndex ? "is-selected" : ""} onClick={() => setSelectedIndex(index)} aria-current={index === selectedIndex ? "page" : undefined}><span className="layout-page-mini" style={{ aspectRatio: `${document.pageSpec.widthPt} / ${document.pageSpec.heightPt}` }}>{entry.objects.length > 0 && <i />}</span><span>{zh ? `第 ${index + 1} 页` : `Page ${index + 1}`}</span></button>)}</div>
        <div className="layout-page-actions"><button onClick={addPage}>{zh ? "＋ 空白页" : "+ Blank page"}</button><button onClick={duplicatePage}>{zh ? "复制页" : "Duplicate"}</button><button disabled={document.pages.length <= 1} onClick={removePage}>{zh ? "删除页" : "Delete"}</button><button disabled={selectedIndex === 0} onClick={() => movePage(-1)}>{zh ? "前移" : "Move earlier"}</button><button disabled={selectedIndex === document.pages.length - 1} onClick={() => movePage(1)}>{zh ? "后移" : "Move later"}</button></div>
      </aside>
      <section className="layout-center">
        <div className="layout-view-controls"><div role="group" aria-label={zh ? "页面查看方式" : "Page view"}><button aria-pressed={!facing} onClick={() => setFacing(false)}>{zh ? "单页" : "Single"}</button><button aria-pressed={facing} onClick={() => setFacing(true)}>{zh ? "对页" : "Facing pages"}</button></div><div><button onClick={() => setZoom(1)}>{zh ? "适应页面" : "Fit page"}</button><button disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button disabled={zoom >= 1.5} onClick={() => setZoom(Math.min(1.5, zoom + .1))}>＋</button></div></div>
        <div className="layout-stage"><div className="layout-spread" style={{ width: display.length * pageWidth, height: pageHeight }}>{display.map((index, slot) => index === null ? <div className="layout-paper-placeholder" key={`empty-${slot}`} aria-label={zh ? "对页占位" : "Facing page placeholder"} style={{ width: pageWidth, height: pageHeight }} /> : <div key={document.pages[index].id} className={`layout-paper${index === selectedIndex ? " is-current" : ""}`} onClick={() => setSelectedIndex(index)} style={{ width: pageWidth, height: pageHeight }} aria-label={zh ? `第 ${index + 1} 页` : `Page ${index + 1}`}>
          {document.pages[index].objects.map((object) => <div key={object.id} className={`layout-object layout-object-${object.kind}`} style={{ left: `${object.rect.x / document.pageSpec.widthPt * 100}%`, top: `${object.rect.y / document.pageSpec.heightPt * 100}%`, width: `${object.rect.width / document.pageSpec.widthPt * 100}%`, height: `${object.rect.height / document.pageSpec.heightPt * 100}%` }}>{object.kind === "image-frame" ? object.photoId ? <PhotoThumb photoSource={dependencies.photoSource} photoId={object.photoId} alt="" resolution="table" fit={object.crop.mode === "fit" ? "contain" : "cover"} /> : <span>{zh ? "空图像框" : "Empty image frame"}</span> : <span>{object.text}</span>}</div>)}
          <span className="layout-paper-number">{index + 1}</span>
        </div>)}</div></div>
        <div className="layout-photo-tray"><div className="layout-panel-heading"><strong>{zh ? "Sequence 照片" : "Sequence photos"}</strong><span>{photos.length}</span></div><div className="layout-photo-scroll" onScroll={(event) => setStrip({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth || 800 })}><div className="layout-photo-track" style={{ width: Math.max(0, photos.length * 102 + 14) }}>{photos.slice(visible.start, visible.end).map((item, offset) => <div key={item.id} className="layout-photo-item" style={{ left: 12 + (visible.start + offset) * 102 }}><PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt="" /><span>{visible.start + offset + 1}</span></div>)}</div></div></div>
      </section>
      <aside className="layout-properties-panel" aria-label={zh ? "页面属性" : "Page properties"}><div className="layout-panel-heading"><strong>{zh ? "页面设置" : "Page settings"}</strong></div><dl><dt>{zh ? "尺寸" : "Size"}</dt><dd>{(document.pageSpec.widthPt / MM_TO_PT).toFixed(1)} × {(document.pageSpec.heightPt / MM_TO_PT).toFixed(1)} mm</dd><dt>{zh ? "当前页" : "Current page"}</dt><dd>{selectedIndex + 1} / {document.pages.length}</dd><dt>{zh ? "对象" : "Objects"}</dt><dd>{page?.objects.length ?? 0}</dd></dl><p>{zh ? "页面尺寸在创建时确定。" : "Page size was set at creation."}</p></aside>
    </div>
  </main>;
}
