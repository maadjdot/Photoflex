import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { LayoutDocument, PhotoId, PhotoSource } from "../contracts";
import { createLayoutReaderState, layoutReaderFitPage, layoutReaderPreviewEdge, layoutReaderReducer, layoutReaderSpreadIndex, layoutReaderSpreads, layoutReaderVisiblePages, resolveLayoutReaderMode, type LayoutReaderMode } from "../modules/layout/layoutReader";
import { layoutPageLabel, layoutPageProgressLabel } from "../modules/layout/layoutPageNumbers";
import { beginPageCurlGoTo, beginPageCurlTurn, cancelPageCurlTurn, commitPageCurlTurn, createPageCurlNavigationState, type PageCurlDirection, type PageCurlNavigationState } from "../modules/layout/pageCurl";
import { useDialogKeyboard } from "./AppPrimitives";
import { LayoutPageCurl, type LayoutPageCurlHandle } from "./LayoutPageCurl";
import { LayoutPageSurface } from "./LayoutPageSurface";
import { useLocale } from "./locale";
import "../styles/layout-reader.css";

type PointerPosition = { x: number; y: number };

export function LayoutReader({ document: layout, initialPage, photoSource, onClose }: {
  readonly document: LayoutDocument;
  readonly initialPage: number;
  readonly photoSource: PhotoSource;
  readonly onClose: () => void;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const curlRef = useRef<LayoutPageCurlHandle>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, dispatch] = useReducer(layoutReaderReducer, undefined, () => createLayoutReaderState(initialPage, layout.pages.length));
  const [curlNavigation, setCurlNavigation] = useState<PageCurlNavigationState>(() => createPageCurlNavigationState(initialPage, layout.pages.length));
  const curlNavigationRef = useRef(curlNavigation);
  const [viewport, setViewport] = useState(() => ({ width: globalThis.innerWidth || 1280, height: globalThis.innerHeight || 800 }));
  const [chromeVisible, setChromeVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [panning, setPanning] = useState(false);
  const chromeTimer = useRef<number | undefined>(undefined);
  const resolvedModeRef = useRef<ReturnType<typeof resolveLayoutReaderMode> | undefined>(undefined);
  const pointers = useRef(new Map<number, PointerPosition>());
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; zoom: number; pointerType: string; pan: boolean } | undefined>(undefined);
  const pinch = useRef<{ distance: number; zoom: number } | undefined>(undefined);
  useDialogKeyboard(rootRef, onClose);

  const resolvedMode = resolveLayoutReaderMode(state.mode, viewport);
  const backCover = layout.pages.at(-1)?.kind === "back-cover";
  const spreads = useMemo(() => layoutReaderSpreads(layout.pages.length, resolvedMode, backCover), [layout.pages.length, resolvedMode, backCover]);
  const spreadIndex = layoutReaderSpreadIndex(spreads, state.currentPage);
  const spread = spreads[spreadIndex];
  const visiblePages = useMemo(() => layoutReaderVisiblePages(spread), [spread]);
  const fit = layoutReaderFitPage(viewport, layout.pageSpec, spread?.slots.length ?? 1);
  const pageWidth = fit.width * state.zoom, pageHeight = fit.height * state.zoom;
  const previewEdge = layoutReaderPreviewEdge(fit, state.zoom, globalThis.devicePixelRatio || 1);
  const canPrevious = spreadIndex > 0, canNext = spreadIndex < spreads.length - 1;
  const label = layoutPageProgressLabel(layout, visiblePages, zh);

  const updateCurlNavigation = useCallback((next: PageCurlNavigationState) => {
    curlNavigationRef.current = next;
    setCurlNavigation(next);
  }, []);

  const cancelCurlNavigation = useCallback(() => {
    const next = cancelPageCurlTurn(curlNavigationRef.current);
    if (next !== curlNavigationRef.current) updateCurlNavigation(next);
  }, [updateCurlNavigation]);

  useEffect(() => {
    if (resolvedModeRef.current !== undefined && resolvedModeRef.current !== resolvedMode) {
      updateCurlNavigation(createPageCurlNavigationState(state.currentPage, layout.pages.length));
    }
    resolvedModeRef.current = resolvedMode;
  }, [layout.pages.length, resolvedMode, state.currentPage, updateCurlNavigation]);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    if (chromeTimer.current !== undefined) window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => {
      if (!rootRef.current?.querySelector(".layout-reader-chrome:focus-within")) setChromeVisible(false);
    }, 2600);
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    revealChrome();
    const measure = () => {
      const bounds = rootRef.current?.getBoundingClientRect();
      setViewport({ width: bounds?.width || globalThis.innerWidth || 1280, height: bounds?.height || globalThis.innerHeight || 800 });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" || !rootRef.current ? undefined : new ResizeObserver(measure);
    if (rootRef.current) observer?.observe(rootRef.current);
    window.addEventListener("resize", measure);
    const fullscreenChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", fullscreenChange);
    return () => {
      observer?.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("fullscreenchange", fullscreenChange);
      if (chromeTimer.current !== undefined) window.clearTimeout(chromeTimer.current);
    };
  }, [revealChrome]);

  const navigate = useCallback((direction: -1 | 1) => {
    const next = beginPageCurlTurn(curlNavigationRef.current, direction, layout.pages.length, resolvedMode, backCover);
    if (next !== curlNavigationRef.current) {
      updateCurlNavigation(next);
      if (!curlRef.current?.turn(direction)) cancelCurlNavigation();
    }
    revealChrome();
  }, [cancelCurlNavigation, layout.pages.length, resolvedMode, revealChrome, updateCurlNavigation, backCover]);

  const goToPage = useCallback((page: number, animated = false) => {
    const next = beginPageCurlGoTo(curlNavigationRef.current, page, layout.pages.length, resolvedMode, backCover);
    if (next === curlNavigationRef.current || next.status !== "turning") return;
    updateCurlNavigation(next);
    if (!curlRef.current?.goTo(next.targetPage, animated)) cancelCurlNavigation();
    revealChrome();
  }, [cancelCurlNavigation, layout.pages.length, resolvedMode, revealChrome, updateCurlNavigation, backCover]);

  const commitPage = useCallback((page: number) => {
    const next = commitPageCurlTurn(curlNavigationRef.current, page, layout.pages.length);
    updateCurlNavigation(next);
    dispatch({ type: "go-to-page", page: next.committedPage, pageCount: layout.pages.length });
  }, [layout.pages.length, updateCurlNavigation]);

  const noteTurnIntent = useCallback((direction: PageCurlDirection) => {
    const next = beginPageCurlTurn(curlNavigationRef.current, direction, layout.pages.length, resolvedMode, backCover);
    if (next !== curlNavigationRef.current) updateCurlNavigation(next);
  }, [layout.pages.length, resolvedMode, updateCurlNavigation, backCover]);

  const setZoom = useCallback((zoom: number) => {
    curlRef.current?.cancel();
    cancelCurlNavigation();
    const stage = stageRef.current;
    const fractionX = stage && stage.scrollWidth ? (stage.scrollLeft + stage.clientWidth / 2) / stage.scrollWidth : .5;
    const fractionY = stage && stage.scrollHeight ? (stage.scrollTop + stage.clientHeight / 2) / stage.scrollHeight : .5;
    dispatch({ type: "set-zoom", zoom });
    requestAnimationFrame(() => {
      const next = stageRef.current;
      if (!next) return;
      next.scrollLeft = Math.max(0, fractionX * next.scrollWidth - next.clientWidth / 2);
      next.scrollTop = Math.max(0, fractionY * next.scrollHeight - next.clientHeight / 2);
    });
  }, [cancelCurlNavigation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, select, textarea")
      ) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); navigate(-1); }
      else if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") { event.preventDefault(); navigate(1); }
      else if (event.key === "Home") { event.preventDefault(); goToPage(0); }
      else if (event.key === "End") { event.preventDefault(); goToPage(layout.pages.length - 1); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); setZoom(state.zoom + .25); }
      else if (event.key === "-") { event.preventDefault(); setZoom(state.zoom - .25); }
      else if (event.key === "0") { event.preventDefault(); setZoom(1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToPage, layout.pages.length, navigate, setZoom, state.zoom]);

  const noteMetadata = useCallback((_photoId: PhotoId, _size: { width: number; height: number }) => {}, []);
  const noteMissing = useCallback((_photoId: PhotoId) => {}, []);
  // Keep page identity stable while turn progress updates the reader chrome.
  const readerPages = useMemo(() => layout.pages.map((page, pageIndex) =>
    <LayoutPageSurface key={page.id} document={layout} pageIndex={pageIndex} slot={resolvedMode === "single" ? 0 : pageIndex === 0 || pageIndex % 2 === 0 ? 1 : 0} pageWidth={pageWidth} pageHeight={pageHeight} photoSource={photoSource} previewEdge={previewEdge} eager={visiblePages.some((visible) => Math.abs(visible - pageIndex) <= 2)} onMetadata={noteMetadata} onMissing={noteMissing} />),
  [layout, resolvedMode, pageWidth, pageHeight, photoSource, previewEdge, visiblePages, noteMetadata, noteMissing]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, input, .layout-reader-chrome")) return;
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    const stage = stageRef.current;
    if (!stage) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      event.preventDefault(); event.stopPropagation();
      curlRef.current?.cancel(); cancelCurlNavigation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const [first, second] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), zoom: state.zoom };
      drag.current = undefined; setPanning(true); return;
    }
    const pan = state.zoom > 1 || event.button === 1;
    if (!pan) { drag.current = undefined; return; }
    event.preventDefault(); event.stopPropagation();
    curlRef.current?.cancel(); cancelCurlNavigation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, zoom: state.zoom, pointerType: event.pointerType, pan };
    setPanning(true);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [first, second] = [...pointers.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      event.preventDefault();
      dispatch({ type: "set-zoom", zoom: pinch.current.zoom * distance / Math.max(1, pinch.current.distance) });
      return;
    }
    const start = drag.current, stage = stageRef.current;
    if (!start || !stage || start.pointerId !== event.pointerId || !start.pan) return;
    stage.scrollLeft = start.left - (event.clientX - start.x);
    stage.scrollTop = start.top - (event.clientY - start.y);
  };
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size < 2) pinch.current = undefined;
    if (!pointers.current.size) { drag.current = undefined; setPanning(false); }
  };

  const setMode = (mode: LayoutReaderMode) => {
    curlRef.current?.cancel();
    updateCurlNavigation(createPageCurlNavigationState(state.currentPage, layout.pages.length));
    dispatch({ type: "set-mode", mode });
  };
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen?.();
  };
  return <section ref={rootRef} className={`layout-reader${chromeVisible ? " is-chrome-visible" : ""}${panning ? " is-panning" : ""}${state.zoom > 1 ? " is-zoomed" : ""}${curlNavigation.status === "turning" ? " is-turning" : ""}`} role="dialog" aria-modal="true" aria-label={zh ? `阅读 ${layout.name}` : `Read ${layout.name}`} onPointerMove={revealChrome} onFocusCapture={revealChrome}>
    <header className="layout-reader-header layout-reader-chrome">
      <button ref={closeRef} className="layout-reader-exit" onClick={onClose}>{zh ? "← 退出阅读" : "← Exit reading"}</button>
      <strong title={layout.name}>{layout.name}</strong>
      <div className="layout-reader-header-actions">
        <div role="group" aria-label={zh ? "页面查看方式" : "Page view"}>{(["auto", "single", "facing"] as const).map((mode) => <button key={mode} aria-pressed={state.mode === mode} onClick={() => setMode(mode)}>{mode === "auto" ? (zh ? "自动" : "Auto") : mode === "single" ? (zh ? "单页" : "Single") : (zh ? "对页" : "Facing")}</button>)}</div>
        <button onClick={() => void toggleFullscreen()}>{fullscreen ? (zh ? "退出全屏" : "Exit fullscreen") : (zh ? "全屏" : "Fullscreen")}</button>
      </div>
    </header>
    <div ref={stageRef} className="layout-reader-stage" onPointerDownCapture={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onDragStart={(event) => event.preventDefault()} onDoubleClick={() => setZoom(state.zoom === 1 ? 2 : 1)} onWheel={(event: ReactWheelEvent) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom(state.zoom * Math.exp(-event.deltaY * .002)); } }}>
      <LayoutPageCurl key={resolvedMode} ref={curlRef} pageWidth={pageWidth} pageHeight={pageHeight} currentPage={state.currentPage} mode={resolvedMode} backCover={backCover} ariaLabel={zh ? `${layout.name} 翻页阅读` : `${layout.name} page curl reader`} pageBackground="#f4f1e9" onPageChange={commitPage} onTurnIntent={noteTurnIntent} onTurnSettled={cancelCurlNavigation}>
        {readerPages}
      </LayoutPageCurl>
    </div>
    <button className="layout-reader-edge is-previous" aria-label={zh ? "上一页" : "Previous"} disabled={!canPrevious || curlNavigation.status === "turning"} onClick={() => navigate(-1)}>‹</button>
    <button className="layout-reader-edge is-next" aria-label={zh ? "下一页" : "Next"} disabled={!canNext || curlNavigation.status === "turning"} onClick={() => navigate(1)}>›</button>
    <footer className="layout-reader-footer layout-reader-chrome">
      <div className="layout-reader-zoom" role="group" aria-label={zh ? "阅读缩放" : "Read zoom"}><button disabled={state.zoom <= .5} onClick={() => setZoom(state.zoom - .25)}>−</button><button className="layout-reader-fit" onClick={() => setZoom(1)}>{Math.round(state.zoom * 100)}%</button><button disabled={state.zoom >= 3} onClick={() => setZoom(state.zoom + .25)}>＋</button></div>
      <div className="layout-reader-progress"><input type="range" min="1" max={layout.pages.length} value={state.currentPage + 1} aria-valuetext={layoutPageLabel(layout, state.currentPage, zh)} aria-label={zh ? "跳到页面" : "Go to page"} onChange={(event) => goToPage(Number(event.target.value) - 1)} /><output aria-live="polite">{label}</output></div>
      <div className="layout-reader-navigation"><button disabled={!canPrevious || curlNavigation.status === "turning"} onClick={() => navigate(-1)}>{zh ? "上一页" : "Previous"}</button><button disabled={!canNext || curlNavigation.status === "turning"} onClick={() => navigate(1)}>{zh ? "下一页" : "Next"}</button></div>
    </footer>
  </section>;
}
