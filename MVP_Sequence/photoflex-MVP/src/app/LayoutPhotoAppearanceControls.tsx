import type { LayoutDocument, LayoutEditCommand, LayoutPage } from "../contracts";
import { frameInnerEdge } from "../modules/worktable/frameAppearance";
import { PhotoInnerEdgeControls } from "./FrameAppearanceControls";
import { MM_TO_PT } from "../modules/page-layout/pageGeometry";
import { LayoutInspectorSlider } from "./LayoutInspectorSlider";

export function LayoutPhotoAppearanceControls({ document, page, command, zh, part }: {
  readonly document: LayoutDocument;
  readonly page: LayoutPage;
  readonly command: (edit: LayoutEditCommand) => boolean;
  readonly zh: boolean;
  readonly part?: "elevation" | "edges";
}) {
  const innerEdge = frameInnerEdge(page);
  const photoElevationPt = page.photoElevationPt ?? 0;
  const update = (changes: Partial<Pick<LayoutPage, "innerEdge" | "photoElevationPt">>, allPages = false) => command({
    type: "set-photo-appearance", pageIds: allPages ? document.pages.map((entry) => entry.id) : [page.id],
    innerEdge, photoElevationPt, ...changes,
  });
  return <>
    {part !== "edges" && <LayoutInspectorSlider label={zh ? "照片浮起" : "Photo elevation"} value={photoElevationPt / MM_TO_PT} max={20} unit="mm"
      inputLabel={zh ? "照片浮起高度 mm" : "Photo elevation mm"} ends={zh ? ["平面", "浮起"] : ["Flat", "Raised"]}
      onChange={(value) => update({ photoElevationPt: value * MM_TO_PT })} />}
    {part !== "elevation" && <div className="layout-photo-effects">
      <PhotoInnerEdgeControls frameToolbar edge={innerEdge} onChange={(edge) => update({ innerEdge: edge })} />
      <button type="button" className="layout-paper-apply-all" onClick={() => update({}, true)}>{zh ? "照片效果应用到全部页面" : "Apply photo effects to all pages"}</button>
    </div>}
  </>;
}
