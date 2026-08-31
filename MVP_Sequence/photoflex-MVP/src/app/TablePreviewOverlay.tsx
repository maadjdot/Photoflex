import { useEffect, useState } from "react";
import type { PhotoId, SourceError } from "../contracts";
import type { AppDependencies } from "./dependencies";

export function TablePreviewOverlay({
  photoId,
  filename,
  photoSource,
  onClose,
  onPhotoSourceError,
}: {
  readonly photoId: PhotoId;
  readonly filename: string;
  readonly photoSource: AppDependencies["photoSource"];
  readonly onClose: () => void;
  readonly onPhotoSourceError: (photoId: PhotoId, error: SourceError) => void;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let lease: { readonly url: string; release(): void } | undefined;
    void photoSource.preview(photoId).then((result) => {
      if (!result.ok) {
        if (active) onPhotoSourceError(photoId, result.error);
        return;
      }
      if (!active) {
        result.value.release();
        return;
      }
      lease = result.value;
      setUrl(lease.url);
    });
    return () => { active = false; lease?.release(); };
  }, [onPhotoSourceError, photoId, photoSource]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="table-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${filename}`} onPointerDown={onClose}>
      <section className="table-preview-dialog" onPointerDown={(event) => event.stopPropagation()}>
        <header><span>{filename}</span><button autoFocus onClick={onClose} aria-label="Close preview">×</button></header>
        <div className="table-preview-image-wrap">
          {url ? <img src={url} alt={filename} /> : <div className="preview-placeholder">Preview unavailable</div>}
        </div>
      </section>
    </div>
  );
}
