import { useEffect, useRef, useState } from "react";
import type { PhotoId, PhotoSource, SourceError, WorktableDraft } from "../contracts";
import { useDialogKeyboard } from "./AppPrimitives";
import { useLocale } from "./locale";
import { PhotoPreviewControls, usePhotoPreviewInteraction } from "./usePhotoPreviewInteraction";

export function TablePhotoPreview({
  photoId,
  filename,
  photoSource,
  onClose,
  onError,
}: {
  readonly photoId: PhotoId;
  readonly filename: string;
  readonly photoSource: PhotoSource;
  readonly onClose: () => void;
  readonly onError: (id: PhotoId, error: SourceError) => void;
}) {
  const { t } = useLocale();
  const [url, setUrl] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const interaction = usePhotoPreviewInteraction();
  useDialogKeyboard(dialogRef, onClose);

  useEffect(() => {
    let live = true;
    let lease: { url: string; release(): void } | undefined;
    void photoSource.preview(photoId).then((result) => {
      if (!result.ok) {
        if (live) onError(photoId, result.error);
        return;
      }
      if (!live) {
        result.value.release();
        return;
      }
      lease = result.value;
      setUrl(lease.url);
    });
    return () => {
      live = false;
      lease?.release();
    };
  }, [onError, photoId, photoSource]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return <div ref={dialogRef} className="table-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${filename}`} onPointerDown={onClose}>
    <section className="table-preview-dialog table-photo-preview-dialog" onPointerDown={(event) => event.stopPropagation()}>
      <header><span>{filename}</span><button ref={closeButtonRef} onClick={onClose} aria-label={t("table.closePreview")}>×</button></header>
      <div
        ref={interaction.viewportRef}
        className={`table-preview-image-wrap photo-preview-viewport${interaction.pannable ? " is-pannable" : ""}${interaction.dragging ? " is-dragging" : ""}`}
        onPointerDown={interaction.onPointerDown}
        onPointerMove={interaction.onPointerMove}
        onPointerUp={interaction.onPointerUp}
        onPointerCancel={interaction.onPointerCancel}
      >
        {url ? <div className={`table-photo-preview-image${interaction.sideways ? " is-sideways" : ""}`} style={{ transform: interaction.imageTransform }} data-rotation={interaction.normalizedRotation}><img src={url} alt={filename} draggable={false} /></div> : <div className="preview-placeholder">{t("table.previewUnavailable")}</div>}
        <PhotoPreviewControls interaction={interaction} />
      </div>
    </section>
  </div>;
}

export function TablePhotoCompare({
  ids,
  draft,
  photoSource,
  onClose,
}: {
  readonly ids: readonly [PhotoId, PhotoId];
  readonly draft: WorktableDraft;
  readonly photoSource: PhotoSource;
  readonly onClose: () => void;
}) {
  const { t } = useLocale();
  const [order, setOrder] = useState(ids);
  const [urls, setUrls] = useState<readonly string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogKeyboard(dialogRef, onClose);

  useEffect(() => {
    let live = true;
    const leases: Array<{ release(): void }> = [];
    void Promise.all(order.map((id) => photoSource.preview(id))).then((results) => {
      if (!live) {
        results.forEach((result) => result.ok && result.value.release());
        return;
      }
      leases.push(...results.flatMap((result) => result.ok ? [result.value] : []));
      setUrls(results.map((result) => result.ok ? result.value.url : ""));
    });
    return () => {
      live = false;
      leases.forEach((lease) => lease.release());
    };
  }, [order, photoSource]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return <div ref={dialogRef} className="compare-backdrop" role="dialog" aria-modal="true" aria-label={t("table.compareTwo")}>
    <header><span>{t("table.compare")}</span><button onClick={() => setOrder([order[1], order[0]])}>{t("table.swap")}</button><button ref={closeButtonRef} onClick={onClose} aria-label={t("table.closeCompare")}>×</button></header>
    <div className="compare-images">{order.map((id, index) => {
      const filename = draft.entryOrder.map((itemId) => draft.placements[itemId]).find((placement) => placement.photoId === id)?.filename ?? id;
      return <figure key={`${id}-${index}`}>{urls[index] ? <img src={urls[index]} alt={filename} /> : <div className="preview-placeholder">{t("table.previewUnavailable")}</div>}</figure>;
    })}</div>
  </div>;
}
