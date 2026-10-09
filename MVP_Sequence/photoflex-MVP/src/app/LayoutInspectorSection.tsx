import { useState, type ReactNode } from "react";

export function LayoutInspectorSection({ title, suffix, children, className = "", defaultOpen = true }: {
  title: string; suffix?: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <details className={`table-frame-section layout-inspector-section ${className}`} open={open}
    onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><h3>{title}</h3>{suffix && <span>{suffix}</span>}</summary>
    <div className="layout-inspector-section-body">{children}</div>
  </details>;
}
