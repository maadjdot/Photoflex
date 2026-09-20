import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale } from "./locale";

const MIN_ZOOM = .25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;

function clampZoom(value: number) {
  return Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)) * 1_000_000) / 1_000_000;
}

interface PreviewView {
  readonly zoom: number;
  readonly rotation: number;
  readonly panX: number;
  readonly panY: number;
}

export function usePhotoPreviewInteraction() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ readonly pointerId: number; readonly x: number; readonly y: number } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<PreviewView>({ zoom: 1, rotation: 0, panX: 0, panY: 0 });

  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setView((current) => {
      const zoom = clampZoom(current.zoom * factor);
      if (zoom <= 1) return { ...current, zoom, panX: 0, panY: 0 };
      const bounds = viewportRef.current?.getBoundingClientRect();
      const anchorX = bounds && clientX !== undefined ? clientX - bounds.left - bounds.width / 2 : 0;
      const anchorY = bounds && clientY !== undefined ? clientY - bounds.top - bounds.height / 2 : 0;
      const ratio = zoom / current.zoom;
      return {
        ...current,
        zoom,
        panX: anchorX - (anchorX - current.panX) * ratio,
        panY: anchorY - (anchorY - current.panY) * ratio,
      };
    });
  }, []);

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);
  const resetZoom = useCallback(() => setView((current) => ({ ...current, zoom: 1, panX: 0, panY: 0 })), []);
  const resetView = useCallback(() => setView({ zoom: 1, rotation: 0, panX: 0, panY: 0 }), []);
  const rotateLeft = useCallback(() => setView((current) => ({ ...current, rotation: current.rotation - 90, panX: 0, panY: 0 })), []);
  const rotateRight = useCallback(() => setView((current) => ({ ...current, rotation: current.rotation + 90, panX: 0, panY: 0 })), []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      zoomBy(Math.exp(-event.deltaY * .0015), event.clientX, event.clientY);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomIn(); }
      if (event.key === "-") { event.preventDefault(); zoomOut(); }
      if (event.key === "0") { event.preventDefault(); resetView(); }
      if (event.key === " ") { event.preventDefault(); resetZoom(); }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        event.shiftKey ? rotateLeft() : rotateRight();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetView, resetZoom, rotateLeft, rotateRight, zoomIn, zoomOut]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.classList.contains("is-pannable") || event.button > 0) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY };
    setView((current) => ({ ...current, panX: current.panX + deltaX, panY: current.panY + deltaY }));
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = undefined;
    setDragging(false);
  }, []);

  const normalizedRotation = ((view.rotation % 360) + 360) % 360;
  return {
    viewportRef,
    zoom: view.zoom,
    rotation: view.rotation,
    normalizedRotation,
    sideways: normalizedRotation === 90 || normalizedRotation === 270,
    dragging,
    pannable: view.zoom > 1,
    imageTransform: `translate(-50%, -50%) translate3d(${view.panX}px, ${view.panY}px, 0) rotate(${view.rotation}deg) scale(${view.zoom})`,
    zoomIn,
    zoomOut,
    resetZoom,
    rotateLeft,
    rotateRight,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}

type PhotoPreviewInteraction = ReturnType<typeof usePhotoPreviewInteraction>;

export function PhotoPreviewControls({ interaction }: { readonly interaction: PhotoPreviewInteraction }) {
  const { t } = useLocale();
  return <div className="photo-preview-controls" role="toolbar" aria-label={t("sequence.previewControls")} onPointerDown={(event) => event.stopPropagation()}>
    <button type="button" onClick={interaction.rotateLeft} aria-label={t("sequence.rotateLeft")}>↶</button>
    <button type="button" onClick={interaction.rotateRight} aria-label={t("sequence.rotateRight")}>↷</button>
    <span aria-hidden="true" />
    <button type="button" onClick={interaction.zoomOut} disabled={interaction.zoom <= MIN_ZOOM} aria-label={t("table.zoomOut")}>−</button>
    <button type="button" className="photo-preview-zoom" onClick={interaction.resetZoom} aria-label={t("sequence.resetZoom")}>{Math.round(interaction.zoom * 100)}%</button>
    <button type="button" onClick={interaction.zoomIn} disabled={interaction.zoom >= MAX_ZOOM} aria-label={t("table.zoomIn")}>+</button>
  </div>;
}
