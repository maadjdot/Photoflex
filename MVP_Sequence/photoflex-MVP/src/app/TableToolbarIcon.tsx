import type { ReactNode } from "react";

export type TableToolbarIconName = "memo" | "link" | "frame" | "grid" | "row" | "shuffle" | "align" | "group" | "undo" | "redo" | "hide" | "show";

// The inline icon geometry comes from the final Figma Make toolbar reference.
const icons: Record<TableToolbarIconName, ReactNode> = {
  memo: <><rect height="17" rx="1" width="14" x="5" y="3.5" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" /></>,
  link: <><path d="m9.4 14.6 5.2-5.2" /><path d="m7.2 17.9-1.1 1.2a3.2 3.2 0 0 1-4.5-4.6l3.6-3.6a3.2 3.2 0 0 1 4.5 0M16.8 6.1l1.1-1.2a3.2 3.2 0 0 1 4.5 4.6l-3.6 3.6a3.2 3.2 0 0 1-4.5 0" /></>,
  frame: <><path d="M4 4h16v16H4z" /><path d="M8 8h8v8H8z" /></>,
  grid: <><rect height="6" rx="1" width="6" x="3.5" y="3.5" /><rect height="6" rx="1" width="6" x="14.5" y="3.5" /><rect height="6" rx="1" width="6" x="3.5" y="14.5" /><rect height="6" rx="1" width="6" x="14.5" y="14.5" /></>,
  row: <><rect height="5" rx="1" width="18" x="3" y="4" /><rect height="5" rx="1" width="18" x="3" y="15" /></>,
  shuffle: <><path d="M3 7h3.5c4 0 6 10 10 10H21" /><path d="m18 14 3 3-3 3M3 17h3.5c1.6 0 2.9-1.7 4.1-3.7M14.7 7c.6-.6 1.2-1 1.8-1H21" /><path d="m18 3 3 3-3 3" /></>,
  align: <path d="M12 3v18M4 7h6v4H4zM14 13h6v4h-6z" />,
  group: <><rect height="9" rx="1" width="9" x="5" y="5" /><rect height="9" rx="1" width="9" x="10" y="10" /><path d="M8 2H2v6M16 2h6v6M8 22H2v-6M16 22h6v-6" /></>,
  undo: <path d="M7 8h9M7 8l3-3M7 8l3 3M16 8a6 6 0 1 1-5 9.3" />,
  redo: <path d="M17 8H8M17 8l-3-3M17 8l-3 3M8 8a6 6 0 1 0 5 9.3" />,
  hide: <><path d="M4 4h16v16H4zM9 4v16" /><path d="m16 9-3 3 3 3" /></>,
  show: <><path d="M4 4h16v16H4zM9 4v16" /><path d="m13 9 3 3-3 3" /></>,
};

export function TableToolbarIcon({ name }: { readonly name: TableToolbarIconName }) {
  return <svg className="table-rail-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" aria-hidden="true">{icons[name]}</svg>;
}
