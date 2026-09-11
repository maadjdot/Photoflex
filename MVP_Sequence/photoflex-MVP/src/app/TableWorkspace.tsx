import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useLocale } from "./locale";

interface TableWorkspaceProps {
  readonly children: ReactNode;
  readonly sidebar: ReactNode;
  readonly sidebarMode?: "compact" | "expanded" | "closed";
  readonly storageKey?: string;
}

/** Stable Table layout seam: the page supplies content, this module owns the workspace columns. */
export function TableWorkspace({ children, sidebar, sidebarMode = "compact", storageKey = "photoflex:table-sidebar" }: TableWorkspaceProps) {
  const { t } = useLocale();
  const [width, setWidth] = useState(() => readWidth(storageKey, sidebarMode));
  const dragRef = useRef<{ clientX: number; width: number } | undefined>(undefined);
  const limits = sidebarMode === "expanded" ? { min: 560, max: 880 } : { min: 280, max: 420 };

  useEffect(() => {
    setWidth(readWidth(storageKey, sidebarMode));
  }, [sidebarMode, storageKey]);
  useEffect(() => {
    if (sidebarMode === "closed") return;
    try { window.sessionStorage.setItem(widthStorageKey(storageKey, sidebarMode), String(width)); } catch { /* UI state is disposable. */ }
  }, [sidebarMode, storageKey, width]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (sidebarMode === "closed") return;
    event.preventDefault();
    dragRef.current = { clientX: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setWidth(Math.max(limits.min, Math.min(limits.max, drag.width + drag.clientX - event.clientX)));
  };
  const stopResize = () => { dragRef.current = undefined; };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 32 : 16;
    if (event.key === "ArrowLeft") { event.preventDefault(); setWidth((value) => Math.min(limits.max, value + step)); }
    if (event.key === "ArrowRight") { event.preventDefault(); setWidth((value) => Math.max(limits.min, value - step)); }
    if (event.key === "Home") { event.preventDefault(); setWidth(limits.min); }
    if (event.key === "End") { event.preventDefault(); setWidth(limits.max); }
  };
  const style = { "--table-sidebar-width": `${width}px` } as CSSProperties;
  return <div className={`table-workspace-body is-sidebar-${sidebarMode}`} style={style}><div className="table-workspace-main">{children}</div><button type="button" className="table-sidebar-resizer" role="separator" aria-orientation="vertical" aria-label={t("common.resizePhotoSources")} aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={width} tabIndex={sidebarMode === "closed" ? -1 : 0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopResize} onPointerCancel={stopResize} onKeyDown={onKeyDown}><span aria-hidden="true">⋮</span></button>{sidebar}</div>;
}

function readWidth(storageKey: string, mode: TableWorkspaceProps["sidebarMode"]): number {
  const openMode = mode === "expanded" ? "expanded" : "compact";
  const min = openMode === "expanded" ? 560 : 280;
  const max = openMode === "expanded" ? 880 : 420;
  const fallback = openMode === "expanded" ? 560 : 280;
  try {
    const stored = Number(window.sessionStorage.getItem(widthStorageKey(storageKey, openMode)) ?? window.sessionStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? Math.max(min, Math.min(max, stored)) : fallback;
  } catch { return fallback; }
}

function widthStorageKey(storageKey: string, mode: "compact" | "expanded"): string {
  return `${storageKey}:${mode}`;
}
