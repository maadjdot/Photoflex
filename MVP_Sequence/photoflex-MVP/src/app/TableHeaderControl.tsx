import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function TableHeaderControl({ children }: { readonly children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setTarget(document.getElementById("table-header-controls")); }, []);
  return target ? createPortal(children, target) : <>{children}</>;
}
