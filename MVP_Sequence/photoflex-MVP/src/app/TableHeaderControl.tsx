import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function TableHeaderControl({ children, targetId = "table-header-controls" }: { readonly children: ReactNode; readonly targetId?: string }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setTarget(document.getElementById(targetId)); }, [targetId]);
  return target ? createPortal(children, target) : <>{children}</>;
}
