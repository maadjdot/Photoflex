import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent as ReactWheelEvent } from "react";
import type { PhotoId, PhotoState, SequenceDocument, SourceError } from "../contracts";
import { centerPhotoIndex, horizontalWheelIntent, projectSequencePhotos, sequenceScrollTarget, visiblePhotoRange, type HorizontalSequenceGeometry } from "../modules/sequence";
import { PhotoThumb } from "./PhotoThumb";
import { useDialogKeyboard } from "./AppPrimitives";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";

interface SequenceReadModeProps {
  readonly sequence: SequenceDocument;
  readonly initialIndex: number;
  readonly photoSource: AppDependencies["photoSource"];
  /** Kept optional for source compatibility; pinning is intentionally not shown in Read. */
  readonly pinned?: Readonly<Partial<Record<PhotoId, PhotoState>>>;
  readonly onTogglePin?: (id: PhotoId) => void;
  readonly onClose: () => void;
  readonly onPhotoError: (id: PhotoId, error: SourceError) => void;
}

export async function warmSequenceReadAt(photoSource: AppDependencies["photoSource"], sequence: SequenceDocument, index: number): Promise<void> {
  const photoIds = projectSequencePhotos(sequence.items).slice(Math.max(0, index), index + 3).map(({ item }) => item.photoId);
  const results = await Promise.all(photoIds.map((photoId) => photoSource.derivedPreview(photoId, 2048)));
  results.forEach((result) => result.ok && result.value.release());
}

/** Continuous, photo-only horizontal reader. */
export function SequenceReadMode({ sequence, initialIndex, photoSource, onClose, onPhotoError }: SequenceReadModeProps) {
  const { t } = useLocale();
  const photos = useMemo(() => projectSequencePhotos(sequence.items), [sequence.items]);
  const safeInitial = Math.max(0, Math.min(photos.length - 1, initialIndex));
  const [currentIndex, setCurrentIndex] = useState(safeInitial);
  const [zoom, setZoom] = useState(55);
  const [viewportWidth, setViewportWidth] = useState(() => globalThis.innerWidth || 1280);
  const [visible, setVisible] = useState({ start: Math.max(0, safeInitial - 2), end: Math.min(photos.length, safeInitial + 3) });
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogKeyboard(rootRef, onClose);

  const itemWidth = Math.min(viewportWidth * .44, 680) * (zoom / 55);
  const sidePadding = Math.max(24, (viewportWidth - itemWidth) / 2);
  const geometry: HorizontalSequenceGeometry = { count: photos.length, itemWidth, gap: 12, sidePadding, viewportWidth };
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  const syncFromScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const nextGeometry = { ...geometryRef.current, viewportWidth: track.clientWidth || geometryRef.current.viewportWidth };
    setCurrentIndex(centerPhotoIndex(track.scrollLeft, nextGeometry));
    setVisible(visiblePhotoRange(track.scrollLeft, nextGeometry));
  }, []);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "auto") => {
    const track = trackRef.current;
    if (!track || !photos.length) return;
    const targetIndex = Math.max(0, Math.min(photos.length - 1, index));
    const nextGeometry = { ...geometryRef.current, viewportWidth: track.clientWidth || geometryRef.current.viewportWidth };
    const totalWidth = nextGeometry.sidePadding * 2 + nextGeometry.count * nextGeometry.itemWidth + Math.max(0, nextGeometry.count - 1) * nextGeometry.gap;
    const maximum = Math.max(0, (track.scrollWidth || totalWidth) - nextGeometry.viewportWidth);
    const left = sequenceScrollTarget(targetIndex, nextGeometry, maximum);
    setCurrentIndex(targetIndex);
    setVisible(visiblePhotoRange(left, nextGeometry));
    if (typeof track.scrollTo === "function") track.scrollTo({ left, behavior });
    else track.scrollLeft = left;
  }, [photos.length]);

  useLayoutEffect(() => { scrollToIndex(safeInitial, "auto"); }, [safeInitial, scrollToIndex]);
  useLayoutEffect(() => { scrollToIndex(currentIndex, "auto"); }, [itemWidth]);
  useEffect(() => {
    closeRef.current?.focus();
    const resize = () => setViewportWidth(globalThis.innerWidth || 1280);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); scrollToIndex(currentIndex - 1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); scrollToIndex(currentIndex + 1); }
      else if (event.key === "Home") { event.preventDefault(); scrollToIndex(0); }
      else if (event.key === "End") { event.preventDefault(); scrollToIndex(photos.length - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, photos.length, scrollToIndex]);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const intent = horizontalWheelIntent(event.deltaX, event.deltaY);
    if (!intent.handled) return;
    event.preventDefault();
    event.currentTarget.scrollLeft += intent.delta;
    syncFromScroll();
  };

  if (!photos.length) return null;
  const style = { "--sequence-read-width": `${itemWidth}px`, "--sequence-read-side": `${sidePadding}px`, "--sequence-read-scale": zoom / 55 } as CSSProperties;
  return <section ref={rootRef} className="sequence-read" role="dialog" aria-modal="true" aria-label={`${t("sequence.read")} ${sequence.name}`} style={style}>
    <div ref={trackRef} className="sequence-read-track" role="group" aria-label="Continuous photo reader" onScroll={syncFromScroll} onWheel={onWheel}>
      {photos.map(({ item, photoIndex }) => <article key={item.id} className="sequence-read-photo" aria-label={`Photo ${photoIndex + 1} of ${photos.length}`}>
        {photoIndex >= visible.start && photoIndex < visible.end
          ? <PhotoThumb resolution="table" progressiveTo={2048} fit="contain" eager={Math.abs(photoIndex - currentIndex) <= 1} photoSource={photoSource} photoId={item.photoId} alt={`Sequence reading photograph ${photoIndex + 1}`} onError={onPhotoError} />
          : <div className="thumb-placeholder" aria-hidden="true" />}
      </article>)}
    </div>
    <div className="sequence-read-zoom" role="group" aria-label="Read zoom">
      <button aria-label="Zoom out" disabled={zoom <= 35} onClick={() => setZoom((value) => Math.max(35, value - 5))}>−</button>
      <output>{zoom}%</output>
      <button aria-label="Zoom in" disabled={zoom >= 85} onClick={() => setZoom((value) => Math.min(85, value + 5))}>+</button>
      <button ref={closeRef} className="sequence-read-close" aria-label={t("common.close")} onClick={onClose}>×</button>
    </div>
    <div className="sequence-read-navigation">
      <output>{String(currentIndex + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}</output>
      <button aria-label="Previous photo" disabled={currentIndex === 0} onClick={() => scrollToIndex(currentIndex - 1)}>‹</button>
      <button aria-label="Next photo" disabled={currentIndex === photos.length - 1} onClick={() => scrollToIndex(currentIndex + 1)}>›</button>
    </div>
  </section>;
}
