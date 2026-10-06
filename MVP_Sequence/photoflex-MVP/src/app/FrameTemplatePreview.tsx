import type { FrameTemplateId } from "../contracts";
import { frameFamily, framePageSize, frameTemplateRects, frameTemplateSource } from "../modules/worktable/frameLayout";

/** Miniature uses the same photo geometry as the editable page. */
export function FrameTemplatePreview({ id }: { readonly id: FrameTemplateId }) {
  const size = framePageSize(id);
  const family = frameFamily(id).id;
  return <span className={`table-frame-template-preview preview-${family} preview-${id}`} aria-hidden="true" style={{ aspectRatio: `${size.widthPt} / ${size.heightPt}` }}>
    {frameTemplateRects(size.widthPt, size.heightPt, frameTemplateSource(id)).map((rect, i) => <i key={i} style={{ left: `${rect.x / size.widthPt * 100}%`, top: `${rect.y / size.heightPt * 100}%`, width: `${rect.width / size.widthPt * 100}%`, height: `${rect.height / size.heightPt * 100}%` }} />)}
  </span>;
}
