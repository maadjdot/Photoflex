import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from "react";

interface TableWorkspaceProps {
  readonly children: ReactNode;
  readonly sidebar: ReactNode;
  readonly sidebarMode?: "compact" | "expanded" | "closed";
  readonly storageKey?: string;
}

/** Stable Table layout seam: the page supplies content, this module owns the workspace columns. */
export function TableWorkspace({ children, sidebar, sidebarMode = "compact", storageKey = "photoflex:table-sidebar" }: TableWorkspaceProps) {
  const [width, setWidth] = useState(() => readWidth(storageKey, sidebarMode));
  const dragRef = useRef(false);
  const limits = sidebarMode === "expanded" ? { min: 560, max: 880 } : { min: 320, max: 420 };

  useEffect(() => {
    setWidth(readWidth(storageKey, sidebarMode));
  }, [sidebarMode, storageKey]);
  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey, String(width)); } catch { /* UI state is disposable. */ }
  }, [storageKey, width]);

  const resizeFromClientX = (clientX: number) => {
    const next = Math.max(limits.min, Math.min(limits.max, window.innerWidth - clientX));
    setWidth(next);
  };
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (sidebarMode === "closed") return;
    event.preventDefault();
    dragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current) resizeFromClientX(event.clientX);
  };
  const stopResize = () => { dragRef.current = false; };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 32 : 16;
    if (event.key === "ArrowLeft") { event.preventDefault(); setWidth((value) => Math.min(limits.max, value + step)); }
    if (event.key === "ArrowRight") { event.preventDefault(); setWidth((value) => Math.max(limits.min, value - step)); }
    if (event.key === "Home") { event.preventDefault(); setWidth(limits.min); }
    if (event.key === "End") { event.preventDefault(); setWidth(limits.max); }
  };
  const style = { "--table-sidebar-width": `${width}px` } as CSSProperties;
  return <div className={`table-workspace-body is-sidebar-${sidebarMode}`} style={style}><div className="table-workspace-main">{children}</div><button type="button" className="table-sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize Photo Sources" aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={width} tabIndex={sidebarMode === "closed" ? -1 : 0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopResize} onPointerCancel={stopResize} onKeyDown={onKeyDown}><span aria-hidden="true">⋮</span></button>{sidebar}</div>;
}

function readWidth(storageKey: string, mode: TableWorkspaceProps["sidebarMode"]): number {
  const min = mode === "expanded" ? 560 : 320;
  const max = mode === "expanded" ? 880 : 420;
  const fallback = mode === "expanded" ? 640 : 368;
  try {
    const stored = Number(window.sessionStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? Math.max(min, Math.min(max, stored)) : fallback;
  } catch { return fallback; }
}
