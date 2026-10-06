import type { LayoutDocument, LayoutEditCommand, LayoutPage } from "../contracts";
import { frameInnerEdge } from "../modules/worktable/frameAppearance";
import { FrameAppearanceNumberField, PhotoInnerEdgeControls } from "./FrameAppearanceControls";

export function LayoutPhotoAppearanceControls({ document, page, command, zh }: {
  readonly document: LayoutDocument;
  readonly page: LayoutPage;
  readonly command: (edit: LayoutEditCommand) => boolean;
  readonly zh: boolean;
}) {
  const innerEdge = frameInnerEdge(page);
  const photoElevationPt = page.photoElevationPt ?? 0;
  const update = (changes: Partial<Pick<LayoutPage, "innerEdge" | "photoElevationPt">>, allPages = false) => command({
    type: "set-photo-appearance", pageIds: allPages ? document.pages.map((entry) => entry.id) : [page.id],
    innerEdge, photoElevationPt, ...changes,
  });
  return <>
    <PhotoInnerEdgeControls edge={innerEdge} onChange={(edge) => update({ innerEdge: edge })} />
    <section className="table-frame-section"><h3>{zh ? "照片浮起" : "PHOTO ELEVATION"}</h3>
      <FrameAppearanceNumberField label={zh ? "照片浮起高度" : "Photo elevation"} value={photoElevationPt} max={20} onCommit={(value) => update({ photoElevationPt: value })} />
      <button type="button" className="layout-paper-apply-all" onClick={() => update({}, true)}>{zh ? "照片效果应用到全部页面" : "Apply photo effects to all pages"}</button>
    </section>
  </>;
}
