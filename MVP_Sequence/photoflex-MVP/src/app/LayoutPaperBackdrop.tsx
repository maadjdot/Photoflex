import type { LayoutPage, LayoutPaper } from "../contracts";
import { layoutPaperStyle, resolveLayoutPaper } from "../modules/layout/layoutPaper";
import "../styles/paper.css";

export function LayoutPaperBackdrop({ page, paper, className = "" }: {
  readonly page?: Pick<LayoutPage, "paper">;
  readonly paper?: LayoutPaper;
  readonly className?: string;
}) {
  const resolved = paper ?? resolveLayoutPaper(page ?? {});
  return <span className={`layout-paper-backdrop${className ? ` ${className}` : ""}`} style={layoutPaperStyle(resolved)} aria-hidden="true" />;
}
