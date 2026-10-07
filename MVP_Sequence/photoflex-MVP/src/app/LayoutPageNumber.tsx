import type { LayoutDocument } from "../contracts";
import { layoutPageNumber } from "../modules/layout/layoutPageNumbers";

export function LayoutPageNumber({ document, pageIndex, left }: {
  readonly document: LayoutDocument; readonly pageIndex: number; readonly left: boolean;
}) {
  const number = layoutPageNumber(document, pageIndex);
  if (document.showPageNumbers === false || number === null) return null;
  return <span className={`layout-paper-number${left ? " is-left" : ""}`}>{String(number).padStart(2, "0")}</span>;
}
