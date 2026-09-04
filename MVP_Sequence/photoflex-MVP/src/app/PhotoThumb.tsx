import { useEffect, useState } from "react";
import type { PhotoId, PhotoSource, SourceError } from "../contracts";

export function PhotoThumb({
  photoSource,
  photoId,
  alt,
  onError,
  eager = false,
  resolution = "thumbnail",
}: {
  readonly photoSource: PhotoSource;
  readonly photoId: PhotoId;
  readonly alt: string;
  readonly onError?: (photoId: PhotoId, error: SourceError) => void;
  readonly eager?: boolean;
  readonly resolution?: "thumbnail" | "table" | "sequence" | "read" | "full";
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let lease: { url: string; release(): void } | undefined;
    setUrl(undefined);
    const load = resolution === "full"
      ? photoSource.preview(photoId)
      : resolution === "table"
        ? photoSource.derivedPreview(photoId, 768)
        : resolution === "sequence"
          ? photoSource.derivedPreview(photoId, 1536)
          : resolution === "read"
            ? photoSource.derivedPreview(photoId, 2048)
            : photoSource.thumbnail(photoId);
    void load.then((result) => {
      if (!result.ok) {
        if (active) onError?.(photoId, result.error);
        return;
      }
      if (!active) {
        result.value.release();
        return;
      }
      lease = result.value;
      setUrl(result.value.url);
    });
    return () => {
      active = false;
      lease?.release();
    };
  }, [onError, photoId, photoSource, resolution]);

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
    <div className="thumb-placeholder" aria-label={`${alt} 缩略图加载中`} />
  );
}
