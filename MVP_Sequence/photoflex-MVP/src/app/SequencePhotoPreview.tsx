import { useEffect, useRef } from "react";
import type { PhotoId, PhotoSource, SourceError } from "../contracts";
import { useDialogKeyboard } from "./AppPrimitives";
import { PhotoThumb } from "./PhotoThumb";
import { useLocale } from "./locale";
import { PhotoPreviewControls, usePhotoPreviewInteraction } from "./usePhotoPreviewInteraction";

interface SequencePhotoPreviewProps {
  readonly photoId: PhotoId;
  readonly index: number;
  readonly total: number;
  readonly photoSource: PhotoSource;
  readonly onClose: () => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onPhotoError: (id: PhotoId, error: SourceError) => void;
}

/** A single-photo inspection layer, intentionally separate from continuous Read mode. */
export function SequencePhotoPreview({ photoId, index, total, photoSource, onClose, onMove, onPhotoError }: SequencePhotoPreviewProps) {
  const { t } = useLocale();
  const rootRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const interaction = usePhotoPreviewInteraction();
  useDialogKeyboard(rootRef, onClose);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable='true']"))) return;
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); onMove(-1); }
      if (event.key === "ArrowRight" && index < total - 1) { event.preventDefault(); onMove(1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, onMove, total]);

  return <section ref={rootRef} className="sequence-photo-preview" role="dialog" aria-modal="true" aria-label={`Preview photo ${index + 1}`} onPointerDown={onClose}>
    <div
      ref={interaction.viewportRef}
      className={`sequence-photo-preview-media photo-preview-viewport${interaction.pannable ? " is-pannable" : ""}${interaction.dragging ? " is-dragging" : ""}`}
      onPointerDown={(event) => { event.stopPropagation(); interaction.onPointerDown(event); }}
      onPointerMove={interaction.onPointerMove}
      onPointerUp={interaction.onPointerUp}
      onPointerCancel={interaction.onPointerCancel}
    >
      <div className={`sequence-photo-preview-stage${interaction.sideways ? " is-sideways" : ""}`}>
        <div className="sequence-photo-preview-image" style={{ transform: interaction.imageTransform }} data-rotation={interaction.normalizedRotation}>
          <PhotoThumb resolution="table" progressiveTo={2048} fit="contain" eager photoSource={photoSource} photoId={photoId} alt={`Sequence photograph ${index + 1}`} onError={onPhotoError} />
        </div>
      </div>
    </div>
    <PhotoPreviewControls interaction={interaction} />
    <button ref={closeRef} className="sequence-photo-preview-close" aria-label={t("common.close")} onClick={onClose}>×</button>
    <output>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</output>
  </section>;
}
