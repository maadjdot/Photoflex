import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { LayoutDocument, PhotoId, PhotoSource } from "../contracts";
import { createLayoutReaderState, layoutReaderFitPage, layoutReaderPageLabel, layoutReaderPreviewEdge, layoutReaderReducer, layoutReaderSpreadIndex, layoutReaderSpreads, layoutReaderVisiblePages, resolveLayoutReaderMode, type LayoutReaderMode } from "../modules/layout/layoutReader";
import { useDialogKeyboard } from "./AppPrimitives";
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, dispatch] = useReducer(layoutReaderReducer, undefined, () => createLayoutReaderState(initialPage, layout.pages.length));
  const [viewport, setViewport] = useState(() => ({ width: globalThis.innerWidth || 1280, height: globalThis.innerHeight || 800 }));
  const [chromeVisible, setChromeVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [panning, setPanning] = useState(false);
  const chromeTimer = useRef<number | undefined>(undefined);
  const pointers = useRef(new Map<number, PointerPosition>());
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; zoom: number; pointerType: string; pan: boolean } | undefined>(undefined);
  const pinch = useRef<{ distance: number; zoom: number } | undefined>(undefined);
  useDialogKeyboard(rootRef, onClose);

  const resolvedMode = resolveLayoutReaderMode(state.mode, viewport);
  const spreads = useMemo(() => layoutReaderSpreads(layout.pages.length, resolvedMode), [layout.pages.length, resolvedMode]);
  const spreadIndex = layoutReaderSpreadIndex(spreads, state.currentPage);
  const spread = spreads[spreadIndex];
  const visiblePages = layoutReaderVisiblePages(spread);
  const fit = layoutReaderFitPage(viewport, layout.pageSpec, spread?.slots.length ?? 1);
  const pageWidth = fit.width * state.zoom, pageHeight = fit.height * state.zoom;
  const previewEdge = layoutReaderPreviewEdge(fit, state.zoom, globalThis.devicePixelRatio || 1);
  const canPrevious = spreadIndex > 0, canNext = spreadIndex < spreads.length - 1;
  const label = layoutReaderPageLabel(spread, layout.pages.length);

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
    dispatch({ type: "navigate", direction, pageCount: layout.pages.length, resolvedMode });
    revealChrome();
  }, [layout.pages.length, resolvedMode, revealChrome]);

  const setZoom = useCallback((zoom: number) => {
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
  }, []);

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
      else if (event.key === "Home") { event.preventDefault(); dispatch({ type: "go-to-page", page: 0, pageCount: layout.pages.length }); }
      else if (event.key === "End") { event.preventDefault(); dispatch({ type: "go-to-page", page: layout.pages.length - 1, pageCount: layout.pages.length }); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); setZoom(state.zoom + .25); }
      else if (event.key === "-") { event.preventDefault(); setZoom(state.zoom - .25); }
      else if (event.key === "0") { event.preventDefault(); dispatch({ type: "reset-fit" }); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layout.pages.length, navigate, setZoom, state.zoom]);

  useEffect(() => {
    let active = true;
    const neighborPages = [spreads[spreadIndex - 1], spreads[spreadIndex + 1]].flatMap(layoutReaderVisiblePages);
    const photoIds = [...new Set(neighborPages.flatMap((pageIndex) => layout.pages[pageIndex]?.objects.flatMap((object) => object.kind === "image-frame" && object.photoId ? [object.photoId] : []) ?? []))];
    const warm = async () => {
      let cursor = 0;
      const worker = async () => {
        while (active && cursor < photoIds.length) {
          const photoId = photoIds[cursor++];
          const result = await photoSource.derivedPreview(photoId, previewEdge);
          if (result.ok) result.value.release();
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, photoIds.length) }, worker));
    };
    void warm();
    return () => { active = false; };
  }, [layout.pages, photoSource, previewEdge, spreadIndex, spreads]);

  const noteMetadata = useCallback((_photoId: PhotoId, _size: { width: number; height: number }) => {}, []);
  const noteMissing = useCallback((_photoId: PhotoId) => {}, []);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, input, .layout-reader-chrome")) return;
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), zoom: state.zoom };
      drag.current = undefined; setPanning(true); return;
    }
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, zoom: state.zoom, pointerType: event.pointerType, pan: state.zoom > 1 || event.button === 1 };
    if (state.zoom > 1 || event.button === 1) setPanning(true);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [first, second] = [...pointers.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      dispatch({ type: "set-zoom", zoom: pinch.current.zoom * distance / Math.max(1, pinch.current.distance) });
      return;
    }
    const start = drag.current, stage = stageRef.current;
    if (!start || !stage || start.pointerId !== event.pointerId || !start.pan) return;
    stage.scrollLeft = start.left - (event.clientX - start.x);
    stage.scrollTop = start.top - (event.clientY - start.y);
  };
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const wasPinching = !!pinch.current;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size < 2) pinch.current = undefined;
    if (!pointers.current.size) { drag.current = undefined; setPanning(false); }
    if (!wasPinching && start?.pointerId === event.pointerId && start.pointerType !== "mouse" && start.zoom <= 1) {
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.25) navigate(dx < 0 ? 1 : -1);
    }
  };

  const setMode = (mode: LayoutReaderMode) => dispatch({ type: "set-mode", mode });
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen?.();
  };
  const leafSlot = resolvedMode === "single" ? 0 : state.direction < 0 ? 1 : 0;

  return <section ref={rootRef} className={`layout-reader${chromeVisible ? " is-chrome-visible" : ""}${panning ? " is-panning" : ""}`} role="dialog" aria-modal="true" aria-label={zh ? `阅读 ${layout.name}` : `Read ${layout.name}`} onPointerMove={revealChrome} onFocusCapture={revealChrome}>
    <header className="layout-reader-header layout-reader-chrome">
      <button ref={closeRef} className="layout-reader-exit" onClick={onClose}>{zh ? "← 退出阅读" : "← Exit reading"}</button>
      <strong title={layout.name}>{layout.name}</strong>
      <div className="layout-reader-header-actions">
        <div role="group" aria-label={zh ? "页面查看方式" : "Page view"}>{(["auto", "single", "facing"] as const).map((mode) => <button key={mode} aria-pressed={state.mode === mode} onClick={() => setMode(mode)}>{mode === "auto" ? (zh ? "自动" : "Auto") : mode === "single" ? (zh ? "单页" : "Single") : (zh ? "对页" : "Facing")}</button>)}</div>
        <button onClick={() => void toggleFullscreen()}>{fullscreen ? (zh ? "退出全屏" : "Exit fullscreen") : (zh ? "全屏" : "Fullscreen")}</button>
      </div>
    </header>
    <div ref={stageRef} className="layout-reader-stage" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onDragStart={(event) => event.preventDefault()} onDoubleClick={() => setZoom(state.zoom === 1 ? 2 : 1)} onWheel={(event: ReactWheelEvent) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom(state.zoom * Math.exp(-event.deltaY * .002)); } }}>
      <div key={`${resolvedMode}-${spreadIndex}-${state.turnKey}`} className={`layout-reader-spread${spread?.slots.length === 2 && spread.slots.every((page) => page !== null) ? " is-facing" : ""}${state.direction > 0 ? " is-turn-forward" : state.direction < 0 ? " is-turn-back" : ""}`} style={{ width: pageWidth * (spread?.slots.length ?? 1) + fit.gap, height: pageHeight, gap: fit.gap }}>
        {spread?.slots.map((pageIndex, slot) => <div key={pageIndex === null ? `empty-${slot}` : layout.pages[pageIndex].id} className={`layout-reader-page-shell${state.direction && slot === leafSlot && pageIndex !== null ? " is-turn-leaf" : ""}`} style={{ width: pageWidth, height: pageHeight }}>
          {pageIndex === null ? <div className="layout-paper-placeholder layout-reader-placeholder" aria-hidden="true" style={{ width: pageWidth, height: pageHeight }} />
            : <LayoutPageSurface document={layout} pageIndex={pageIndex} slot={slot} pageWidth={pageWidth} pageHeight={pageHeight} photoSource={photoSource} previewEdge={previewEdge} eager={visiblePages.includes(pageIndex)} onMetadata={noteMetadata} onMissing={noteMissing} />}
        </div>)}
      </div>
    </div>
    <button className="layout-reader-edge is-previous" aria-label={zh ? "上一页" : "Previous"} disabled={!canPrevious} onClick={() => navigate(-1)}>‹</button>
    <button className="layout-reader-edge is-next" aria-label={zh ? "下一页" : "Next"} disabled={!canNext} onClick={() => navigate(1)}>›</button>
    <footer className="layout-reader-footer layout-reader-chrome">
      <div className="layout-reader-zoom" role="group" aria-label={zh ? "阅读缩放" : "Read zoom"}><button disabled={state.zoom <= .5} onClick={() => setZoom(state.zoom - .25)}>−</button><button className="layout-reader-fit" onClick={() => dispatch({ type: "reset-fit" })}>{Math.round(state.zoom * 100)}%</button><button disabled={state.zoom >= 3} onClick={() => setZoom(state.zoom + .25)}>＋</button></div>
      <div className="layout-reader-progress"><input type="range" min="1" max={layout.pages.length} value={state.currentPage + 1} aria-label={zh ? "跳到页面" : "Go to page"} onChange={(event) => dispatch({ type: "go-to-page", page: Number(event.target.value) - 1, pageCount: layout.pages.length })} /><output aria-live="polite">{label}</output></div>
      <div className="layout-reader-navigation"><button disabled={!canPrevious} onClick={() => navigate(-1)}>{zh ? "上一页" : "Previous"}</button><button disabled={!canNext} onClick={() => navigate(1)}>{zh ? "下一页" : "Next"}</button></div>
    </footer>
  </section>;
}
