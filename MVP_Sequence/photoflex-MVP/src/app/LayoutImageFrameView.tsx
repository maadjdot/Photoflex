import { useEffect, useState } from "react";
import type { LayoutImageFrame, PhotoId, PhotoSource } from "../contracts";
import { resolveImagePlacement } from "../modules/page-layout/pageGeometry";

export function LayoutImageFrameView({ frame, photoSource, sourceRevision, onMetadata, onMissing }: {
  frame: LayoutImageFrame; photoSource: PhotoSource;
  sourceRevision: number;
  onMetadata: (photoId: PhotoId, size: { width: number; height: number }) => void;
  onMissing: (photoId: PhotoId) => void;
}) {
  const [preview, setPreview] = useState<{ url: string; width: number; height: number }>();
  useEffect(() => {
    if (!frame.photoId) { setPreview(undefined); return; }
    let active = true;
    let release: (() => void) | undefined;
    setPreview(undefined);
    void Promise.all([photoSource.getPhoto(frame.photoId), photoSource.derivedPreview(frame.photoId, 768)]).then(([photo, image]) => {
      if (!active) { if (image.ok) image.value.release(); return; }
      if (!photo.ok || !image.ok) {
        if (image.ok) image.value.release();
        onMissing(frame.photoId!);
        return;
      }
      release = image.value.release;
      onMetadata(frame.photoId!, { width: photo.value.width, height: photo.value.height });
      setPreview({ url: image.value.url, width: photo.value.width, height: photo.value.height });
    });
    return () => { active = false; release?.(); };
  }, [frame.photoId, onMetadata, onMissing, photoSource, sourceRevision]);

  if (!frame.photoId) return <span className="layout-image-placeholder">Empty frame</span>;
  if (!preview) return <span className="layout-image-placeholder">Photo unavailable or loading</span>;
  const placed = resolveImagePlacement(preview, frame.rect, frame.crop);
  return <img draggable={false} className="layout-placed-image" src={preview.url} alt="" style={{
    left: `${placed.x / frame.rect.width * 100}%`, top: `${placed.y / frame.rect.height * 100}%`,
    width: `${placed.width / frame.rect.width * 100}%`, height: `${placed.height / frame.rect.height * 100}%`,
  }} />;
}
