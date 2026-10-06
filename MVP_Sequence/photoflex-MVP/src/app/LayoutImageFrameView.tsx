import { useEffect, useState } from "react";
import type { DerivedPreviewMaxEdge, LayoutImageFrame, LayoutPage, PhotoId, PhotoSource } from "../contracts";
import { resolveImagePlacement } from "../modules/page-layout/pageGeometry";
import { layoutVisiblePhotoRect } from "../modules/layout/layoutPhotoAppearance";
import { frameInnerEdge } from "../modules/worktable/frameAppearance";
import { FramePhotoEdge } from "./FrameEdges";
import { useLocale } from "./locale";

export function LayoutImageFrameView({ frame, photoSource, sourceRevision, onMetadata, onMissing, previewEdge = 768, eager = false, page, scale = 1 }: {
  frame: LayoutImageFrame; photoSource: PhotoSource;
  sourceRevision: number;
  onMetadata: (photoId: PhotoId, size: { width: number; height: number }) => void;
  onMissing: (photoId: PhotoId) => void;
  previewEdge?: DerivedPreviewMaxEdge;
  eager?: boolean;
  page?: LayoutPage;
  scale?: number;
}) {
  const { locale } = useLocale();
  const [preview, setPreview] = useState<{ url: string; width: number; height: number }>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!frame.photoId) { setPreview(undefined); setMissing(false); return; }
    let active = true;
    let release: (() => void) | undefined;
    setPreview(undefined); setMissing(false);
    void (async () => {
      const [photo, initial] = await Promise.all([photoSource.getPhoto(frame.photoId!), photoSource.derivedPreview(frame.photoId!, 768)]);
      if (!active) { if (initial.ok) initial.value.release(); return; }
      if (!photo.ok || !initial.ok) {
        if (initial.ok) initial.value.release();
        setMissing(true); onMissing(frame.photoId!); return;
      }
      release = initial.value.release;
      onMetadata(frame.photoId!, { width: photo.value.width, height: photo.value.height });
      setPreview({ url: initial.value.url, width: photo.value.width, height: photo.value.height });
      if (previewEdge === 768) return;
      const upgraded = await photoSource.derivedPreview(frame.photoId!, previewEdge);
      if (!active) { if (upgraded.ok) upgraded.value.release(); return; }
      if (!upgraded.ok) return;
      release?.(); release = upgraded.value.release;
      setPreview({ url: upgraded.value.url, width: photo.value.width, height: photo.value.height });
    })();
    return () => { active = false; release?.(); };
  }, [frame.photoId, onMetadata, onMissing, photoSource, previewEdge, sourceRevision]);

  if (!frame.photoId) return <span className="layout-image-placeholder">Empty frame</span>;
  if (!preview) return <span className="layout-image-placeholder">{missing
    ? (locale === "zh-CN" ? "照片不可用" : "Photo unavailable")
    : (locale === "zh-CN" ? "正在载入照片…" : "Loading photo…")}</span>;
  const placed = resolveImagePlacement(preview, frame.rect, frame.crop);
  const visible = layoutVisiblePhotoRect(frame, preview);
  const edge = frameInnerEdge(page ?? {});
  const elevation = (page?.photoElevationPt ?? 0) * scale;
  return <>
    {elevation > 0 && <span className="layout-photo-elevation" aria-hidden="true" style={{
      left: `${visible.x / frame.rect.width * 100}%`, top: `${visible.y / frame.rect.height * 100}%`,
      width: `${visible.width / frame.rect.width * 100}%`, height: `${visible.height / frame.rect.height * 100}%`,
      boxShadow: `0 ${elevation}px ${elevation * 2.5}px rgb(0 0 0 / .3)`,
    }} />}
    <span className="layout-image-clip"><img draggable={false} className="layout-placed-image" src={preview.url} alt="" loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "auto"} style={{
    left: `${placed.x / frame.rect.width * 100}%`, top: `${placed.y / frame.rect.height * 100}%`,
    width: `${placed.width / frame.rect.width * 100}%`, height: `${placed.height / frame.rect.height * 100}%`,
    }} /></span>
    <FramePhotoEdge edge={{ ...edge, widthPt: edge.widthPt * scale }} cornerRadiusPt={0} rect={{
      x: visible.x * scale, y: visible.y * scale, width: visible.width * scale, height: visible.height * scale,
    }} />
  </>;
}
