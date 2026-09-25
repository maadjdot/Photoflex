import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { LayoutDocument, LayoutEditCommand, LayoutId, LayoutObjectId, LayoutPage, LayoutPageId, ProjectId, SequenceDocument, SequenceId } from "../contracts";
import { applyLayoutCommand } from "../modules/layout/layoutDocument";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";
import { LayoutEditor } from "./LayoutEditor";
import { PhotoThumb } from "./PhotoThumb";
import { CloudSaveStatus } from "./CloudControls";
import { exportLayoutPdf, preflightLayoutPdf, type LayoutPdfPreflight, type LayoutPdfQuality } from "../platform/browser/exportLayoutPdf";
import type { ProjectWriteCoordinator } from "./projectWriteCoordinator";
import type { AppRoute } from "./router";
import "../styles/layout-workspace.css";
import "../styles/layout-visual.css";

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
  const [panelWidths, setPanelWidths] = useState({ pages: 176, properties: 208 });
  const readingOrigin = useRef(0);
  const lastMergeKey = useRef<string | undefined>(undefined);
  const history = useRef<LayoutDocument[]>([]);
  const historyIndex = useRef(0);
  const editSequence = useRef(0);
  const prepareExport = useRef<(() => void) | undefined>(undefined);
  const exportController = useRef<AbortController | undefined>(undefined);
  const exportSnapshot = useRef<LayoutDocument | undefined>(undefined);
  const exportQuality = useRef<LayoutPdfQuality>("medium");
  const exportButton = useRef<HTMLButtonElement>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [quality, setQuality] = useState<LayoutPdfQuality>("medium");
  const [exportState, setExportState] = useState<"idle" | "checking" | "ready" | "exporting" | "failed">("idle");
  const [exportCheck, setExportCheck] = useState<LayoutPdfPreflight>();
  const [exportProgress, setExportProgress] = useState({ completed: 0, total: 0 });
  const [exportError, setExportError] = useState<string>();

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
  const cancelExport = () => { exportController.current?.abort(); exportController.current = undefined; exportSnapshot.current = undefined; setExportState("idle"); };
  const performExport = async (snapshot: LayoutDocument, controller: AbortController, selectedQuality: LayoutPdfQuality) => {
    try {
      setExportState("exporting");
      await exportLayoutPdf(snapshot, dependencies.photoSource, controller.signal, setExportProgress, selectedQuality);
      if (!controller.signal.aborted) setExportState("idle");
    } catch (error) {
      if (!controller.signal.aborted) { setExportError(error instanceof Error ? error.message : String(error)); setExportState("failed"); }
    } finally { if (exportController.current === controller) { exportController.current = undefined; exportSnapshot.current = undefined; } }
  };
  const startExport = async (selectedQuality: LayoutPdfQuality) => {
    if (exportState === "checking" || exportState === "exporting") return;
    setQualityOpen(false);
    prepareExport.current?.();
    const snapshot = structuredClone(documentRef.current);
    if (!snapshot) return;
    exportController.current?.abort();
    exportQuality.current = selectedQuality;
    exportSnapshot.current = snapshot;
    const controller = new AbortController();
    exportController.current = controller;
    setExportError(undefined); setExportCheck(undefined); setExportProgress({ completed: 0, total: snapshot.pages.length }); setExportState("checking");
    try {
      const check = await preflightLayoutPdf(snapshot, dependencies.photoSource, controller.signal);
      if (controller.signal.aborted) return;
      setExportCheck(check);
      if (check.blocking.length || check.warnings.length) { setExportState("ready"); return; }
      await performExport(snapshot, controller, selectedQuality);
    } catch (error) {
      if (!controller.signal.aborted) { setExportError(error instanceof Error ? error.message : String(error)); setExportState("failed"); }
    } finally { if (exportController.current === controller && !exportSnapshot.current) exportController.current = undefined; }
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
  const removePage = (targetId = page?.id) => {
    if (!targetId || document.pages.length <= 1) return;
    const selectedId = page?.id;
    if (command({ type: "remove-page", pageId: targetId })) {
      const remaining = document.pages.filter((entry) => entry.id !== targetId);
      const previousSelection = remaining.findIndex((entry) => entry.id === selectedId);
      setSelectedIndex(previousSelection >= 0 ? previousSelection : Math.min(selectedIndex, remaining.length - 1));
    }
  };
  const resizePanel = (side: "pages" | "properties", clientX: number, element: HTMLElement) => {
    const bounds = element.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    const clampWidth = (value: number, other: number) => Math.max(120, Math.min(400, bounds.width - other - 320, value));
    setPanelWidths((current) => side === "pages"
      ? { ...current, pages: clampWidth(clientX - bounds.left, current.properties) }
      : { ...current, properties: clampWidth(bounds.right - clientX, current.pages) });
  };
  const panelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
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
      <div className="layout-brand"><strong>Photoflex</strong><span className="layout-breadcrumb-divider">/</span><button title={document.name} onClick={reading ? stopReading : back}>{reading ? (zh ? "← 退出阅读" : "← Exit reading") : document.name}</button></div>
      {!reading && <nav className="layout-module-navigation" aria-label={zh ? "工作区" : "Workspace"}><button onClick={() => navigate({ name: "table", projectId })}>Table</button><button aria-label="← Sequence" onClick={back}>Sequence</button><button aria-current="page">Layout</button></nav>}
      <span className="layout-save-status" role="status">{saveState === "failed" ? (zh ? "保存失败" : "Save failed") : saveState === "saving" || projectWrite.saving ? (zh ? "正在保存…" : "Saving…") : (zh ? "本地已保存" : "Saved locally")}{saveState === "failed" && <button onClick={() => void retry()}>{zh ? "重试" : "Retry"}</button>}</span>
      <CloudSaveStatus dependencies={dependencies} projectId={projectId} />
      {!reading && <div className="layout-header-actions"><button onClick={startReading}>{zh ? "阅读" : "Read"}</button><button ref={exportButton} className="layout-export-button" disabled={exportState === "checking" || exportState === "exporting"} onClick={() => setQualityOpen(true)}>{zh ? "导出 PDF" : "Export PDF"}</button></div>}
    </header>
    {exportState !== "idle" && <div className="layout-export-status" role="status">
      <span>{exportState === "checking" ? (zh ? "正在检查照片…" : "Checking photos…")
        : exportState === "exporting" ? (zh ? `正在导出 ${exportProgress.completed}/${exportProgress.total} 页…` : `Exporting ${exportProgress.completed}/${exportProgress.total} pages…`)
          : exportState === "failed" ? (zh ? `导出失败：${exportError}` : `Export failed: ${exportError}`)
            : exportCheck?.blocking.length ? (zh ? "请处理以下图像框后重试" : "Resolve these image frames and retry")
              : (zh ? "以下照片分辨率偏低，仍可继续导出" : "These photos have low resolution; you can continue exporting")}</span>
      {exportCheck && [...exportCheck.blocking, ...exportCheck.warnings].map((issue) => <span key={`${issue.page}-${issue.objectId}`}>
        {zh ? `第 ${issue.page} 页 · ${issue.objectId.slice(0, 8)}：${issue.kind === "empty" ? "空图像框" : issue.kind === "missing" ? "照片不可用" : "分辨率偏低"}`
          : `Page ${issue.page} · ${issue.objectId.slice(0, 8)}: ${issue.kind === "empty" ? "empty frame" : issue.kind === "missing" ? "photo unavailable" : "low resolution"}`}
      </span>)}
      {saveState === "failed" && <span>{zh ? "正在导出当前内存草稿；保存仍需重试。" : "Exporting the current draft; saving still needs a retry."}</span>}
      {(exportState === "checking" || exportState === "exporting") && <button onClick={cancelExport}>{zh ? "取消" : "Cancel"}</button>}
      {exportState === "ready" && !exportCheck?.blocking.length && <button onClick={() => { const snapshot = exportSnapshot.current; const controller = exportController.current; if (snapshot && controller) void performExport(snapshot, controller, exportQuality.current); }}>{zh ? "继续导出" : "Continue export"}</button>}
      {(exportState === "ready" || exportState === "failed") && <button onClick={() => { cancelExport(); setExportCheck(undefined); }}>{zh ? "关闭" : "Dismiss"}</button>}
    </div>}
    {qualityOpen && <div className="layout-export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setQualityOpen(false); exportButton.current?.focus(); } }}>
      <section className="layout-export-dialog" role="dialog" aria-modal="true" aria-label={zh ? "PDF 导出质量" : "PDF export quality"} onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); setQualityOpen(false); exportButton.current?.focus(); }
      }}>
        <header><div><small>PDF EXPORT</small><h2>{zh ? "选择导出质量" : "Choose export quality"}</h2><p>{zh ? "照片会按所选质量写入 PDF；文字保持清晰、可选取。" : "Photo quality changes file size. Text stays sharp and selectable."}</p></div><button type="button" aria-label={zh ? "关闭" : "Close"} onClick={() => { setQualityOpen(false); exportButton.current?.focus(); }}>×</button></header>
        <form onSubmit={(event) => { event.preventDefault(); void startExport(quality); }}>
          <fieldset><legend>{zh ? "照片质量" : "Photo quality"}</legend>
            {(["low", "medium", "high", "original"] as const).map((option) => {
              const labels = { low: zh ? "低" : "Low", medium: zh ? "中" : "Medium", high: zh ? "高" : "High", original: zh ? "原图" : "Original" };
              const descriptions = { low: zh ? "150 dpi · 屏幕分享，文件较小" : "150 dpi · smaller files for screens", medium: zh ? "220 dpi · 日常分享与审阅" : "220 dpi · everyday sharing and review", high: zh ? "300 dpi · 优先保留打印细节" : "300 dpi · more detail for print", original: zh ? "嵌入原始 JPEG · 文件可能较大" : "Embed source JPEGs · files may be large" };
              return <label key={option} className={`layout-export-choice${quality === option ? " is-selected" : ""}`}><input type="radio" name="layout-export-quality" value={option} checked={quality === option} onChange={() => setQuality(option)} autoFocus={option === quality} /><span><strong>{labels[option]}</strong><small>{descriptions[option]}</small></span></label>;
            })}
          </fieldset>
          <footer><button type="button" onClick={() => { setQualityOpen(false); exportButton.current?.focus(); }}>{zh ? "取消" : "Cancel"}</button><button type="submit" className="is-primary">{zh ? "导出 PDF" : "Export PDF"}</button></footer>
        </form>
      </section>
    </div>}
    <div className="layout-workspace-body" style={{ "--layout-pages-width": `${panelWidths.pages}px`, "--layout-properties-width": `${panelWidths.properties}px` } as CSSProperties}>
      <aside className="layout-pages-panel" aria-label={zh ? "页面" : "Pages"}>
        <div className="layout-panel-heading"><strong>{zh ? "页面" : "Pages"}</strong><span>{document.pages.length}</span></div>
        <div className="layout-pages-list">{document.pages.map((entry, index) => { const firstImage = entry.objects.find((object) => object.kind === "image-frame" && object.photoId); const photoId = firstImage?.kind === "image-frame" ? firstImage.photoId : null; return <button key={entry.id} draggable className={`${index === selectedIndex ? "is-selected" : ""}${dropPageId === entry.id && draggedPageId !== entry.id ? " is-drop-target" : ""}`} onClick={() => setSelectedIndex(index)} onKeyDown={(event) => { if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); removePage(entry.id); } }} aria-current={index === selectedIndex ? "page" : undefined} onDragStart={(event) => { setDraggedPageId(entry.id); event.dataTransfer.setData("application/x-photoflex-layout-page-id", entry.id); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => { if (draggedPageId) { event.preventDefault(); setDropPageId(entry.id); } }} onDragLeave={() => setDropPageId((current) => current === entry.id ? undefined : current)} onDrop={(event) => { event.preventDefault(); dropPage(entry.id); }} onDragEnd={() => { setDraggedPageId(undefined); setDropPageId(undefined); }}><span className="layout-page-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="layout-page-mini" style={{ aspectRatio: `${document.pageSpec.widthPt} / ${document.pageSpec.heightPt}` }}>{photoId ? <PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt="" fit="contain" /> : entry.objects.length > 0 && <i />}</span><span className="layout-page-caption"><span>{zh ? `第 ${index + 1} 页` : `Page ${index + 1}`}</span><small>{index === selectedIndex ? (zh ? "当前页面" : "Current page") : (zh ? `${entry.objects.length} 个对象` : `${entry.objects.length} objects`)}</small></span><span className="layout-page-grip" aria-hidden="true">⠿</span></button>; })}</div>
        <div className="layout-page-actions"><button onClick={addPage}>{zh ? "＋ 空白页" : "+ Blank page"}</button><button onClick={duplicatePage}>{zh ? "复制页" : "Duplicate"}</button><button disabled={document.pages.length <= 1} onClick={() => removePage()}>{zh ? "删除页" : "Delete"}</button></div>
      </aside>
      <LayoutEditor document={document} sequence={sequence} dependencies={dependencies} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex} command={command} onRefreshPhotos={refreshPhotos} reading={reading} canUndo={historyPosition > 0} canRedo={historyPosition < history.current.length - 1} onUndo={() => travel(-1)} onRedo={() => travel(1)} prepareExport={prepareExport} />
      {!reading && (["pages", "properties"] as const).map((side) => <div key={side} className={`layout-panel-resizer is-${side}`} role="separator" aria-label={side === "pages" ? (zh ? "调整页面栏宽度" : "Resize Pages panel") : (zh ? "调整属性栏宽度" : "Resize Properties panel")} aria-orientation="vertical" aria-valuemin={120} aria-valuemax={400} aria-valuenow={panelWidths[side]} tabIndex={0} onPointerDown={panelPointerDown} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizePanel(side, event.clientX, event.currentTarget); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const delta = event.key === "ArrowRight" ? 16 : -16; const bounds = event.currentTarget.getBoundingClientRect(); resizePanel(side, bounds.left + delta, event.currentTarget); } }} />)}
    </div>
  </main>;
}
