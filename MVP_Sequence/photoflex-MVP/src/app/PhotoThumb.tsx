import { memo, useEffect, useRef, useState } from "react";
import type { DerivedPreviewMaxEdge, PhotoId, PhotoSource, PreviewLease, SourceError } from "../contracts";
import { useLocale } from "./locale";

interface PhotoThumbProps {
  readonly photoSource: PhotoSource;
  readonly photoId: PhotoId;
  readonly alt: string;
  readonly onError?: (photoId: PhotoId, error: SourceError) => void;
  readonly eager?: boolean;
  readonly resolution?: "thumbnail" | "table" | "sequence" | "read" | "full";
  /** Optional higher table tier to swap in after the 768px image is visible. */
  readonly progressiveTo?: DerivedPreviewMaxEdge;
  readonly sourceRevision?: number;
}

export const PhotoThumb = memo(function PhotoThumb({
  photoSource,
  photoId,
  alt,
  onError,
  eager = false,
  resolution = "thumbnail",
  progressiveTo,
  sourceRevision,
}: PhotoThumbProps) {
  const { t } = useLocale();
  const [url, setUrl] = useState<string>();
  const upgradeRef = useRef<((maxEdge: DerivedPreviewMaxEdge) => void) | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const session: {
      loadedEdge: number;
      loadingEdge: number;
      pendingEdge: number;
      lease?: PreviewLease;
    } = { loadedEdge: 0, loadingEdge: 0, pendingEdge: 0 };
    setUrl(undefined);
    const loadAt = (maxEdge: DerivedPreviewMaxEdge) => resolution === "table"
      ? photoSource.derivedPreview(photoId, maxEdge)
      : resolution === "full"
        ? photoSource.preview(photoId)
        : resolution === "sequence"
          ? photoSource.derivedPreview(photoId, 1536)
          : resolution === "read"
            ? photoSource.derivedPreview(photoId, 2048)
            : photoSource.thumbnail(photoId);
    const request = (maxEdge: DerivedPreviewMaxEdge) => {
      if (!active || resolution !== "table" || maxEdge <= session.loadedEdge) return;
      if (session.loadingEdge) {
        session.pendingEdge = Math.max(session.pendingEdge, maxEdge);
        return;
      }
      session.loadingEdge = maxEdge;
      void loadAt(maxEdge).then((result) => {
        if (!result.ok) {
          if (active) onError?.(photoId, result.error);
        } else if (!active) {
          result.value.release();
        } else {
          session.lease?.release();
          session.lease = result.value;
          session.loadedEdge = maxEdge;
          setUrl(result.value.url);
        }
        session.loadingEdge = 0;
        const pending = session.pendingEdge;
        session.pendingEdge = 0;
        if (active && pending > session.loadedEdge) request(pending as DerivedPreviewMaxEdge);
      });
    };
    upgradeRef.current = request;
    if (resolution === "table") request(768);
    else void loadAt(768).then((result) => {
      if (!result.ok) {
        if (active) onError?.(photoId, result.error);
      } else if (!active) {
        result.value.release();
      } else {
        session.lease = result.value;
        setUrl(result.value.url);
      }
    });
    return () => {
      active = false;
      if (upgradeRef.current === request) upgradeRef.current = undefined;
      session.lease?.release();
    };
  }, [onError, photoId, photoSource, resolution, sourceRevision]);

  useEffect(() => {
    if (resolution === "table" && progressiveTo && progressiveTo > 768) upgradeRef.current?.(progressiveTo);
  }, [progressiveTo, resolution]);

  return url ? (
    <img
      src={url}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={resolution === "full" || resolution === "read" ? "high" : "auto"}
      draggable={false}
    />
  ) : (
    <div className="thumb-placeholder" aria-label={t("common.thumbnailLoading", { name: alt })} />
  );
});
