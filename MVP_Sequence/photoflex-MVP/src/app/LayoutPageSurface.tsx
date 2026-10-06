import { useMemo, type CSSProperties } from "react";
import type { DerivedPreviewMaxEdge, LayoutDocument, LayoutObject, LayoutPage, LayoutRect, PhotoId, PhotoSource } from "../contracts";
import { isDarkLayoutPaper, resolveLayoutPaper } from "../modules/layout/layoutPaper";
import { layoutReaderPageObjects } from "../modules/layout/layoutReader";
import { LayoutImageFrameView } from "./LayoutImageFrameView";
import { LayoutPaperBackdrop } from "./LayoutPaperBackdrop";
import { LayoutTextView } from "./LayoutTextView";

export function layoutObjectStyle(rect: LayoutRect, pageSpec: LayoutDocument["pageSpec"]): CSSProperties {
  return { left: `${rect.x / pageSpec.widthPt * 100}%`, top: `${rect.y / pageSpec.heightPt * 100}%`,
    width: `${rect.width / pageSpec.widthPt * 100}%`, height: `${rect.height / pageSpec.heightPt * 100}%` };
}

export function LayoutObjectVisual({ object, photoSource, sourceRevision, scale, previewEdge = 768, eager = false, onMetadata, onMissing, page }: {
  readonly object: LayoutObject;
  readonly photoSource: PhotoSource;
  readonly sourceRevision: number;
  readonly scale: number;
  readonly page?: LayoutPage;
  readonly previewEdge?: DerivedPreviewMaxEdge;
  readonly eager?: boolean;
  readonly onMetadata: (photoId: PhotoId, size: { width: number; height: number }) => void;
  readonly onMissing: (photoId: PhotoId) => void;
}) {
  return object.kind === "image-frame"
    ? <LayoutImageFrameView frame={object} page={page} scale={scale} photoSource={photoSource} sourceRevision={sourceRevision} previewEdge={previewEdge} eager={eager} onMetadata={onMetadata} onMissing={onMissing} />
    : <LayoutTextView box={object} scale={scale} />;
}

export function LayoutPageSurface({ document, pageIndex, slot, pageWidth, pageHeight, photoSource, previewEdge, sourceRevision = 0, eager = false, onMetadata, onMissing }: {
  readonly document: LayoutDocument;
  readonly pageIndex: number;
  readonly slot: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly photoSource: PhotoSource;
  readonly previewEdge: DerivedPreviewMaxEdge;
  readonly sourceRevision?: number;
  readonly eager?: boolean;
  readonly onMetadata: (photoId: PhotoId, size: { width: number; height: number }) => void;
  readonly onMissing: (photoId: PhotoId) => void;
}) {
  const page = document.pages[pageIndex];
  const objects = useMemo(() => layoutReaderPageObjects(document, pageIndex), [document, pageIndex]);
  return <article className={`layout-paper layout-reader-paper${isDarkLayoutPaper(resolveLayoutPaper(page)) ? " is-dark-paper" : ""}`} style={{ width: pageWidth, height: pageHeight }} aria-label={`Page ${pageIndex + 1}`}>
    <LayoutPaperBackdrop page={page} />
    {objects.map((object) => <div key={object.id} className={`layout-object layout-object-${object.kind}`} style={layoutObjectStyle(object.rect, document.pageSpec)}>
      <LayoutObjectVisual object={object} page={page} photoSource={photoSource} sourceRevision={sourceRevision} scale={pageHeight / document.pageSpec.heightPt} previewEdge={previewEdge} eager={eager} onMetadata={onMetadata} onMissing={onMissing} />
    </div>)}
    <span className={`layout-paper-number${slot === 0 ? " is-left" : ""}`}>{String(pageIndex + 1).padStart(2, "0")}</span>
  </article>;
}
