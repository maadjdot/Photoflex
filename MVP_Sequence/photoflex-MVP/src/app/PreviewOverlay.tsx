import { useEffect, useRef, useState } from "react";
import type { PhotoId, PhotoRef, ProjectWorkspace, SourceError } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";
import { useDialogKeyboard, shortId } from "./AppPrimitives";

export function PreviewOverlay({ photoIds, index, workspace, photoSource, onClose, onMove, onToggleTable, onPhotoSourceError }: { readonly photoIds: readonly PhotoId[]; readonly index: number; readonly workspace: ProjectWorkspace; readonly photoSource: AppDependencies["photoSource"]; readonly onClose: () => void; readonly onMove: (index: number) => void; readonly onToggleTable: (photoId: PhotoId) => Promise<void>; readonly onPhotoSourceError?: (photoId: PhotoId, error: SourceError) => void; }) {
  const { locale, t } = useLocale();
  const photoId = photoIds[index];
  const [photo, setPhoto] = useState<PhotoRef>();
  const [url, setUrl] = useState<string>();
  // Zoom is relative to the fitted image, so the first increment always grows
  // from the image the reader is already seeing instead of jumping to natural
  // pixel dimensions.
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ readonly width: number; readonly height: number }>();
  const [imageWrapSize, setImageWrapSize] = useState<{ readonly width: number; readonly height: number }>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(dialogRef, onClose);

  useEffect(() => {
    let active = true;
    setPhoto(undefined);
    void photoSource.getPhoto(photoId).then((result) => {
      if (active && result.ok) setPhoto(result.value);
      if (active && !result.ok) onPhotoSourceError?.(photoId, result.error);
    });
    return () => { active = false; };
  }, [onPhotoSourceError, photoId, photoSource]);
  useEffect(() => {
    let active = true;
    let lease: { url: string; release(): void } | undefined;
    setUrl(undefined);
    setZoom(1);
    setNaturalSize(undefined);

    // Preview URLs are leased by PhotoSource. Releasing on photo change prevents
    // large Blob URLs from accumulating while the user navigates with arrows.
    void photoSource.preview(photoId).then((result) => {
      if (!result.ok) { if (active) onPhotoSourceError?.(photoId, result.error); return; }
      if (!active) { result.value.release(); return; }
      lease = result.value;
      setUrl(result.value.url);
    });
    return () => { active = false; lease?.release(); };
  }, [onPhotoSourceError, photoId, photoSource]);
  useEffect(() => {
    const imageWrap = imageWrapRef.current;
    if (!imageWrap) return;
    const updateSize = () => setImageWrapSize({ width: imageWrap.clientWidth, height: imageWrap.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(imageWrap);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    for (const adjacentIndex of [index - 1, index + 1]) {
      const adjacentId = photoIds[adjacentIndex];
      if (!adjacentId) continue;
      void photoSource.preview(adjacentId).then((result) => {
        if (result.ok) result.value.release();
      });
    }
  }, [index, photoIds, photoSource]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowLeft") onMove(Math.max(0, index - 1));
      if (event.key === "ArrowRight") onMove(Math.min(photoIds.length - 1, index + 1));
      if (event.key === " ") { event.preventDefault(); setZoom(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onMove, photoIds.length]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onPreviewWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      // A non-passive native listener must cancel Ctrl+wheel before the browser
      // interprets it as page zoom. PhotoFlex then owns the same gesture locally.
      event.preventDefault();
      event.stopPropagation();
      setZoom((value) => Math.max(1, Math.min(4, value * Math.exp(-event.deltaY * .0015))));
    };
    dialog.addEventListener("wheel", onPreviewWheel, { passive: false });
    return () => dialog.removeEventListener("wheel", onPreviewWheel);
  }, []);

  const inTable = workspace.worktableDraft.entryOrder.some(
    (itemId) => workspace.worktableDraft.placements[itemId]?.photoId === photoId,
  );
  const label = photo?.relativePath ?? shortId(photoId);
  const fitScale = naturalSize && imageWrapSize
    ? Math.min(imageWrapSize.width / naturalSize.width, imageWrapSize.height / naturalSize.height)
    : undefined;
  return (
    <div ref={dialogRef} className="preview-backdrop" role="dialog" aria-modal="true" aria-label={t("table.preview")}>
      <div className="preview-top">
        <span>{locale === "zh-CN" ? "照片" : "PHOTO"} {String(index + 1).padStart(2, "0")} / {label}</span>
        <button autoFocus onClick={onClose} aria-label={t("table.closePreview")}>×</button>
      </div>
      <button className="preview-arrow preview-arrow-left" onClick={() => onMove(Math.max(0, index - 1))} disabled={!index}>‹</button>
      <div ref={imageWrapRef} className="preview-image-wrap is-zoomed">
        {url
          ? <img
              src={url}
              alt={label}
              onLoad={(event) => {
                // The browser-decoded dimensions already reflect JPEG EXIF orientation.
                setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
              }}
              style={naturalSize && fitScale
                ? { width: `${naturalSize.width * fitScale * zoom}px`, height: `${naturalSize.height * fitScale * zoom}px` }
                : { width: "100%", height: "100%", objectFit: "contain", objectPosition: "center" }}
            />
          : <div className="preview-placeholder">{t("table.previewUnavailable")}</div>}
      </div>
      <button className="preview-arrow preview-arrow-right" onClick={() => onMove(Math.min(photoIds.length - 1, index + 1))} disabled={index === photoIds.length - 1}>›</button>
      <div className="preview-bottom">
        <span>
          {String(index + 1).padStart(2, "0")} / {photoIds.length}
          <small>{locale === "zh-CN" ? "← / → 下一张 · 空格 适应画面 · Ctrl + 滚轮缩放 · Esc 返回" : "← / → Next · Space to fit · Ctrl + wheel to zoom · Esc to return"}</small>
        </span>
        <span className="preview-zoom-controls">
          <button onClick={() => setZoom(1)} aria-pressed={zoom === 1}>{t("table.fit")}</button>
          <button onClick={() => setZoom((value) => Math.max(1, value / 1.25))} disabled={zoom <= 1}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.min(4, value * 1.25))} disabled={zoom >= 4}>+</button>
        </span>
        <button className="button button-secondary" onClick={() => void onToggleTable(photoId)}>
          {inTable ? t("table.remove") : t("table.placeOnTable")}
        </button>
      </div>
    </div>
  );
}
