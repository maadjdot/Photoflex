import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PhotoId, ProjectId, SequenceId, SequenceItemId, SourceError, VersionId } from "../contracts";
import { photoInsertionToItemIndex, projectSequencePhotos } from "../modules/sequence";
import { openVersionAsDraft } from "../modules/versioning";
import { useDialogKeyboard } from "./AppPrimitives";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";
import type { ProjectWriteCoordinator } from "./projectWriteCoordinator";
import { PhotoThumb } from "./PhotoThumb";
import { SequenceReadMode } from "./SequenceReadMode";
import { SequencePhotoPreview } from "./SequencePhotoPreview";
import { useSequenceReorderDrag } from "./useSequenceReorderDrag";
import { useSequenceSession } from "./sequenceSession";

interface SequenceOverlayProps {
  readonly dependencies: AppDependencies;
  readonly persistence: ProjectWriteCoordinator;
  readonly projectId: ProjectId;
  readonly sequenceId: SequenceId;
  readonly openVersionId?: VersionId;
  readonly onClose: () => void;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
}

/** Photo-only Sequence sorting surface embedded over the persistent Table. */
export function SequenceOverlay({ dependencies, persistence, projectId, sequenceId, openVersionId, onClose, onPhotoError }: SequenceOverlayProps) {
  const { t } = useLocale();
  const sequenceSession = useSequenceSession(persistence, projectId, sequenceId);
  const { sequence } = sequenceSession;
  const [selected, setSelected] = useState<Set<SequenceItemId>>(new Set());
  const [anchor, setAnchor] = useState<SequenceItemId>();
  const [readIndex, setReadIndex] = useState<number>();
  const [previewIndex, setPreviewIndex] = useState<number>();
  const [photoShapes, setPhotoShapes] = useState<ReadonlyMap<PhotoId, "landscape" | "portrait">>(new Map());
  const rootRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const unusedStageRef = useRef<HTMLElement>(null);
  const unusedStripRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedVersionRef = useRef<VersionId | undefined>(undefined);
  useDialogKeyboard(rootRef, () => void closeOverlay(), readIndex === undefined && previewIndex === undefined);

  const photos = useMemo(() => projectSequencePhotos(sequence?.items ?? []), [sequence?.items]);
  const photoItemIds = useMemo(() => photos.map(({ item }) => item.id), [photos]);

  useEffect(() => { closeRef.current?.focus(); }, [sequence?.id]);
  useEffect(() => {
    let live = true;
    void Promise.all(photos.map(async ({ item }) => {
      const result = await dependencies.photoSource.getPhoto(item.photoId);
      return [item.photoId, result.ok && result.value.height > result.value.width ? "portrait" : "landscape"] as const;
    })).then((entries) => { if (live) setPhotoShapes(new Map(entries)); });
    return () => { live = false; };
  }, [dependencies.photoSource, photos]);
  useEffect(() => {
    if (!sequence || !openVersionId || openedVersionRef.current === openVersionId) return;
    openedVersionRef.current = openVersionId;
    let live = true;
    void persistence.loadVersion(openVersionId).then((result) => {
      if (live && result.ok) sequenceSession.replaceDraft(openVersionAsDraft(result.value), `Opened ${result.value.name} as Working Draft.`);
    });
    return () => { live = false; };
  }, [openVersionId, persistence, sequence, sequenceSession]);

  const closeOverlay = useCallback(async () => {
    const result = await sequenceSession.flush();
    if (result.ok) onClose();
  }, [onClose, sequenceSession]);

  const reorder = useSequenceReorderDrag({
    itemIds: photoItemIds,
    selected,
    anchor,
    containers: { workspace: rootRef, stage: unusedStageRef, strip: unusedStripRef, overview: gridRef },
    onSelectionChange: (next, nextAnchor) => { setSelected(new Set(next)); setAnchor(nextAnchor); },
    onMove: (itemIds, visibleTarget) => {
      if (!sequence) return;
      sequenceSession.execute({ type: "move", itemIds, to: photoInsertionToItemIndex(sequence.items, visibleTarget) });
    },
    onActivate: (itemId) => {
      const index = photos.findIndex(({ item }) => item.id === itemId);
      if (index >= 0) setPreviewIndex(index);
    },
  });

  if (sequenceSession.loading) return <section className="sequence-overlay is-loading" role="dialog" aria-modal="true" aria-label="Sequence"><div className="loading-mark" /></section>;
  if (!sequence) return <section className="sequence-overlay is-loading" role="dialog" aria-modal="true" aria-label="Sequence"><p>{sequenceSession.error ?? t("sequence.loading")}</p><button onClick={() => void closeOverlay()}>{t("common.close")}</button></section>;

  const pointerHandlers = (itemId: SequenceItemId) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => reorder.begin(event, itemId, "overview"),
    onPointerMove: reorder.move,
    onPointerUp: reorder.end,
    onPointerCancel: reorder.cancel,
  });

  return <section ref={rootRef} className="sequence-overlay" role="dialog" aria-modal="true" aria-label={`Sequence ${sequence.name}`} tabIndex={-1}>
    <header className="sequence-overlay-header">
      <div><span>SEQUENCE</span><h1>{sequence.name}</h1></div>
      <nav aria-label="Sequence controls">
        <button className="sequence-overlay-read" disabled={!photos.length} onClick={() => setReadIndex(0)}>{t("sequence.read")}</button>
        <button ref={closeRef} className="sequence-overlay-close" aria-label={`${t("common.close")} Sequence`} onClick={() => void closeOverlay()}>×</button>
      </nav>
    </header>
    {sequenceSession.error && <div className="sequence-overlay-notice" role="status"><span>{sequenceSession.error}</span>{sequenceSession.saveState === "failed" && <button onClick={() => void sequenceSession.retry()}>{t("common.retry")}</button>}</div>}
    <section ref={gridRef} className="sequence-overlay-grid" role="grid" aria-label="Sequence photo order" onPointerMove={reorder.move} onPointerUp={reorder.end} onPointerCancel={reorder.cancel}>
      {photos.map(({ item, photoIndex }) => <button
        key={item.id}
        type="button"
        role="gridcell"
        aria-selected={selected.has(item.id)}
        aria-label={`Photo ${String(photoIndex + 1).padStart(2, "0")}`}
        data-sequence-index={photoIndex}
        data-item-id={item.id}
        className={`sequence-overlay-card is-${photoShapes.get(item.photoId) ?? "landscape"}${selected.has(item.id) ? " is-selected" : ""}${reorder.dropTarget === photoIndex ? " is-drop-target" : ""}`}
        onClick={() => { if (!reorder.consumeClickSuppression()) setPreviewIndex(photoIndex); }}
        {...pointerHandlers(item.id)}
      >
        <PhotoThumb resolution="table" progressiveTo={1536} fit="contain" photoSource={dependencies.photoSource} photoId={item.photoId} alt="" onError={onPhotoError} />
        <b>{String(photoIndex + 1).padStart(2, "0")}</b>
      </button>)}
      {reorder.dropTarget === photos.length && <i className="sequence-overlay-drop-end" aria-hidden="true" />}
      {!photos.length && <p className="sequence-overlay-empty">{t("sequence.noneOnTable")}</p>}
    </section>
    {previewIndex !== undefined && photos[previewIndex] && <SequencePhotoPreview photoId={photos[previewIndex].item.photoId} index={previewIndex} total={photos.length} photoSource={dependencies.photoSource} onClose={() => setPreviewIndex(undefined)} onPhotoError={onPhotoError} />}
    {readIndex !== undefined && <SequenceReadMode sequence={sequence} initialIndex={readIndex} photoSource={dependencies.photoSource} pinned={{}} onTogglePin={() => undefined} onClose={() => setReadIndex(undefined)} onPhotoError={onPhotoError} />}
  </section>;
}
