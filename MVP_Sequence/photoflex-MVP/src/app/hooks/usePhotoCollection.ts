import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoId, PhotoRef, PhotoSource, SourceId } from "../../contracts";

const PAGE_SIZE = 100;

export function usePhotoCollection(photoSource: PhotoSource, sourceId: SourceId, indexedCount: number) {
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [missingPhotoIds, setMissingPhotoIds] = useState<Set<PhotoId>>(new Set());
  const [cursor, setCursor] = useState("0");
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const exhaustedRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || exhaustedRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const page = await photoSource.listPhotos(sourceId, cursor, PAGE_SIZE);
    if (page.ok) {
      setPhotos((current) => {
        const byId = new Map(current.map((photo) => [photo.id, photo]));
        page.value.items.forEach((photo) => byId.set(photo.id, photo));
        return [...byId.values()];
      });
      setMissingPhotoIds((current) => {
        const next = new Set(current);
        page.value.issues.forEach((issue) => {
          if (issue.kind === "missing-file") next.add(issue.photoId);
        });
        return next;
      });
      if (!page.value.items.length || page.value.nextCursor === null) exhaustedRef.current = true;
      else setCursor(page.value.nextCursor);
    }
    loadingRef.current = false;
    setLoading(false);
  }, [cursor, photoSource, sourceId]);

  useEffect(() => {
    setPhotos([]);
    setMissingPhotoIds(new Set());
    setCursor("0");
    exhaustedRef.current = false;
    loadingRef.current = false;
  }, [photoSource, sourceId]);

  useEffect(() => {
    if (!photos.length && !loading) void loadMore();
  }, [loadMore, loading, photos.length]);

  useEffect(() => {
    if (indexedCount > photos.length && !loading && !exhaustedRef.current) void loadMore();
  }, [indexedCount, loadMore, loading, photos.length]);

  return { photos, missingPhotoIds, loading, loadMore };
}
