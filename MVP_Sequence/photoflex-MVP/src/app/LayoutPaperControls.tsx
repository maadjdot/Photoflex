import { useEffect, useRef, useState } from "react";
import type { LayoutDocument, LayoutEditCommand, LayoutPage, LayoutPaper } from "../contracts";
import { LAYOUT_PAPER_COLORS, LAYOUT_PAPER_MATERIALS, resolveLayoutPaper } from "../modules/layout/layoutPaper";
import { LayoutPaperBackdrop } from "./LayoutPaperBackdrop";

export function LayoutPaperControls({ document, page, command, zh }: {
  readonly document: LayoutDocument;
  readonly page: LayoutPage;
  readonly command: (edit: LayoutEditCommand) => boolean;
  readonly zh: boolean;
}) {
  const paper = resolveLayoutPaper(page);
  const [openMenu, setOpenMenu] = useState<"color" | "material" | null>(null);
  const controlsRef = useRef<HTMLElement>(null);
  const label = (english: string, chinese: string) => zh ? chinese : english;
  const selectedColor = LAYOUT_PAPER_COLORS.find((entry) => entry.color === paper.color.toUpperCase()) ?? LAYOUT_PAPER_COLORS[0];
  const selectedMaterial = LAYOUT_PAPER_MATERIALS.find((entry) => entry.id === paper.material) ?? LAYOUT_PAPER_MATERIALS[0];
  const setPaper = (next: LayoutPaper, allPages = false) => command({ type: "set-paper",
    pageIds: allPages ? document.pages.map((entry) => entry.id) : [page.id], paper: next });
  const choosePaper = (next: LayoutPaper) => {
    if (setPaper(next)) setOpenMenu(null);
  };
  useEffect(() => {
    if (!openMenu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    window.document.addEventListener("pointerdown", closeOutside);
    window.document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.removeEventListener("pointerdown", closeOutside);
      window.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);
  return <section ref={controlsRef} className="table-frame-section layout-paper-section"><h3>{label("PAPER", "纸张")}</h3>
    <div className="layout-paper-field">
      <span className="layout-paper-field-label">{label("Color", "颜色")}</span>
      <button type="button" className="layout-paper-dropdown-trigger" aria-label={label("Paper color", "纸张颜色")} aria-haspopup="listbox" aria-expanded={openMenu === "color"} aria-controls="layout-paper-color-menu" onClick={() => setOpenMenu((current) => current === "color" ? null : "color")}>
        <span className="layout-paper-color-swatch" style={{ backgroundColor: selectedColor.color }} />
        <span>{zh ? selectedColor.nameZh : selectedColor.name}</span><span className="layout-paper-dropdown-caret" aria-hidden="true">⌄</span>
      </button>
      {openMenu === "color" && <div id="layout-paper-color-menu" className="layout-paper-dropdown-menu" role="listbox" aria-label={label("Paper colors", "纸张颜色选项")}>
        {LAYOUT_PAPER_COLORS.map((entry) => <button key={entry.color} type="button" role="option" aria-selected={paper.color.toUpperCase() === entry.color} aria-label={zh ? entry.nameZh : entry.name} className="layout-paper-dropdown-option" title={`${zh ? entry.nameZh : entry.name} · ${entry.color}`} onClick={() => choosePaper({ ...paper, color: entry.color })}>
          <span className="layout-paper-color-swatch" style={{ backgroundColor: entry.color }} /><span>{zh ? entry.nameZh : entry.name}</span><span className="layout-paper-color-code">{entry.color}</span>
        </button>)}
      </div>}
    </div>
    <div className="layout-paper-field">
      <span className="layout-paper-field-label">{label("Material", "材质")}</span>
      <button type="button" className="layout-paper-dropdown-trigger" aria-label={label("Paper material", "纸张材质")} aria-haspopup="listbox" aria-expanded={openMenu === "material"} aria-controls="layout-paper-material-menu" onClick={() => setOpenMenu((current) => current === "material" ? null : "material")}>
        <span className="layout-paper-material-sample"><LayoutPaperBackdrop paper={{ color: paper.color, material: selectedMaterial.id }} /></span>
        <span>{zh ? selectedMaterial.nameZh : selectedMaterial.name}</span><span className="layout-paper-dropdown-caret" aria-hidden="true">⌄</span>
      </button>
      {openMenu === "material" && <div id="layout-paper-material-menu" className="layout-paper-dropdown-menu" role="listbox" aria-label={label("Paper materials", "纸张材质选项")}>
        {LAYOUT_PAPER_MATERIALS.map((entry) => <button key={entry.id} type="button" role="option" aria-selected={paper.material === entry.id} aria-label={zh ? entry.nameZh : entry.name} className="layout-paper-dropdown-option" onClick={() => choosePaper({ ...paper, material: entry.id })}>
          <span className="layout-paper-material-sample"><LayoutPaperBackdrop paper={{ color: paper.color, material: entry.id }} /></span><span>{zh ? entry.nameZh : entry.name}</span>
        </button>)}
      </div>}
    </div>
    <button type="button" className="layout-paper-apply-all" disabled={document.pages.every((entry) => { const current = resolveLayoutPaper(entry); return current.color.toUpperCase() === paper.color.toUpperCase() && current.material === paper.material; })} onClick={() => setPaper(paper, true)}>{label("Apply to all pages", "应用到全部页面")}</button>
  </section>;
}
