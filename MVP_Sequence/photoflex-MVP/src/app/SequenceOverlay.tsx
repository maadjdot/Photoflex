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
import { sequenceItemInDirection, type SequenceArrow } from "./sequenceKeyboardNavigation";
import { useSequenceSession } from "./sequenceSession";
import { exportSequenceFolder, SequenceFolderExportError } from "../platform/browser/exportSequenceFolder";

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
  const [actionError, setActionError] = useState<string>();
  const [folderExportNotice, setFolderExportNotice] = useState<string>();
  const [folderExporting, setFolderExporting] = useState(false);
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
  const selectedPhotoItemIds = useMemo(() => photoItemIds.filter((id) => selected.has(id)), [photoItemIds, selected]);

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

  const createSequenceFolder = useCallback(async () => {
    if (!sequence || !photos.length || folderExporting) return;
    setFolderExporting(true);
    setFolderExportNotice(t("sequence.folderChoosing"));
    try {
      const result = await exportSequenceFolder(sequence, dependencies.photoSource, ({ completed, total }) => {
        setFolderExportNotice(t("sequence.folderCopying", { completed, total }));
      });
      setFolderExportNotice(result.failed.length
        ? t("sequence.folderCreatedWithFailures", { folder: result.folderName, copied: result.copied, failed: result.failed.length })
        : t("sequence.folderCreated", { folder: result.folderName, copied: result.copied }));
    } catch (error) {
      if (error instanceof SequenceFolderExportError && error.kind === "cancelled") {
        setFolderExportNotice(undefined);
      } else if (error instanceof SequenceFolderExportError && error.kind === "unsupported") {
        setFolderExportNotice(t("sequence.folderUnsupported"));
      } else if (error instanceof SequenceFolderExportError && error.kind === "permission-denied") {
        setFolderExportNotice(t("sequence.folderPermissionDenied"));
      } else if (error instanceof SequenceFolderExportError && error.kind === "unsafe-destination") {
        setFolderExportNotice(t("sequence.folderUnsafeDestination"));
      } else {
        setFolderExportNotice(t("sequence.folderFailed"));
      }
    } finally {
      setFolderExporting(false);
    }
  }, [dependencies.photoSource, folderExporting, photos.length, sequence, t]);

  const removePhotoItems = useCallback((ids: readonly SequenceItemId[]) => {
    if (!sequence || !ids.length) return false;
    const result = sequenceSession.execute({ type: "remove", itemIds: ids });
    if (!result.ok) { setActionError(t("sequence.removeItemFailed")); return false; }
    setActionError(undefined);
    setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
    if (anchor && ids.includes(anchor)) setAnchor(undefined);
    return true;
  }, [anchor, sequence, sequenceSession, t]);

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

  const draggingPhoto = photos.find(({ item }) => reorder.draggingItemIds.includes(item.id));
  const renderDropGhost = (index: number) => {
    if (reorder.dropTarget !== index || !draggingPhoto) return null;
    const shape = photoShapes.get(draggingPhoto.item.photoId) ?? "landscape";
    return <div key={`drop-ghost-${index}`} className={`sequence-overlay-drag-ghost is-${shape}`} aria-hidden="true"><PhotoThumb resolution="table" progressiveTo={1536} photoSource={dependencies.photoSource} photoId={draggingPhoto.item.photoId} alt="" /></div>;
  };

  const pointerHandlers = (itemId: SequenceItemId) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => reorder.begin(event, itemId, "overview"),
    onPointerMove: reorder.move,
    onPointerUp: reorder.end,
    onPointerCancel: reorder.cancel,
  });

  return <section ref={rootRef} className="sequence-overlay" role="dialog" aria-modal="true" aria-label={`Sequence ${sequence.name}`} tabIndex={-1} onKeyDown={(event) => {
    if (readIndex !== undefined) return;
    if ((event.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) return;
    if (previewIndex === undefined && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "r" && photos.length) {
      event.preventDefault();
      setReadIndex(0);
      return;
    }
    if (previewIndex === undefined && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === " " && selectedPhotoItemIds.length === 1) {
      const index = photos.findIndex(({ item }) => item.id === selectedPhotoItemIds[0]);
      if (index >= 0) {
        event.preventDefault();
        setPreviewIndex(index);
      }
      return;
    }
    if (previewIndex === undefined && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.startsWith("Arrow") && photos.length) {
      event.preventDefault();
      const currentId = selectedPhotoItemIds.at(-1);
      const nextId = sequenceItemInDirection(gridRef.current, photoItemIds, currentId, event.key as SequenceArrow);
      if (nextId) {
        setSelected(new Set([nextId]));
        setAnchor(nextId);
        gridRef.current?.querySelector<HTMLElement>(`[data-item-id="${nextId}"]`)?.focus();
      }
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (selectedPhotoItemIds.length) {
      event.preventDefault();
      if (removePhotoItems(selectedPhotoItemIds) && previewIndex !== undefined) setPreviewIndex(undefined);
    }
  }}>
    <header className="sequence-overlay-header">
      <div><span>SEQUENCE</span><h1>{sequence.name}</h1></div>
      <nav aria-label="Sequence controls">
        <button className="sequence-overlay-folder" disabled={!photos.length || folderExporting} aria-busy={folderExporting} onClick={() => void createSequenceFolder()}>{folderExporting ? t("sequence.creatingFolder") : t("sequence.createFolder")}</button>
        <button className="sequence-overlay-read" title="R" disabled={!photos.length} onClick={() => setReadIndex(0)}>{t("sequence.read")}</button>
        <button ref={closeRef} className="sequence-overlay-close" aria-label={`${t("common.close")} Sequence`} onClick={() => void closeOverlay()}>×</button>
      </nav>
    </header>
    {(actionError || sequenceSession.error) && <div className="sequence-overlay-notice" role="status"><span>{actionError || sequenceSession.error}</span>{sequenceSession.saveState === "failed" && <button onClick={() => void sequenceSession.retry()}>{t("common.retry")}</button>}</div>}
    {folderExportNotice && <div className="sequence-overlay-notice" role="status"><span>{folderExportNotice}</span><button onClick={() => setFolderExportNotice(undefined)} aria-label={t("common.close")}>×</button></div>}
    <section ref={gridRef} className="sequence-overlay-grid" role="grid" aria-label="Sequence photo order" onPointerDown={(event) => { if (event.target === event.currentTarget) { setSelected(new Set()); setAnchor(undefined); } }} onPointerMove={reorder.move} onPointerUp={reorder.end} onPointerCancel={reorder.cancel}>
      {photos.flatMap(({ item, photoIndex }) => {
        const isDragging = reorder.draggingItemIds.includes(item.id);
        return [
          renderDropGhost(photoIndex),
          // The dragged photo is rendered only at the predicted insertion
          // point. Its original slot is removed instead of showing a second
          // faded copy there.
          isDragging ? null : <button key={item.id}
            type="button"
            role="gridcell"
            aria-selected={selected.has(item.id)}
            aria-label={`Photo ${String(photoIndex + 1).padStart(2, "0")}`}
            data-sequence-index={photoIndex}
            data-item-id={item.id}
            className={`sequence-overlay-card is-${photoShapes.get(item.photoId) ?? "landscape"}${selected.has(item.id) ? " is-selected" : ""}${reorder.dropTarget !== undefined && reorder.dropTarget <= photoIndex ? " is-drop-shifted" : ""}${reorder.dropTarget === photoIndex ? " is-drop-target" : ""}`}
            onClick={(event) => { if (!reorder.consumeClickSuppression() && !event.shiftKey && !event.ctrlKey && !event.metaKey) setPreviewIndex(photoIndex); }}
            {...pointerHandlers(item.id)}
          >
            <PhotoThumb resolution="table" progressiveTo={1536} fit="contain" photoSource={dependencies.photoSource} photoId={item.photoId} alt="" onError={onPhotoError} />
            <b>{String(photoIndex + 1).padStart(2, "0")}</b>
          </button>,
        ];
      })}
      {renderDropGhost(photos.length)}
      {!photos.length && <p className="sequence-overlay-empty">{t("sequence.noneOnTable")}</p>}
    </section>
    {previewIndex !== undefined && photos[previewIndex] && <SequencePhotoPreview key={photos[previewIndex].item.id} photoId={photos[previewIndex].item.photoId} index={previewIndex} total={photos.length} photoSource={dependencies.photoSource} onClose={() => setPreviewIndex(undefined)} onMove={(direction) => setPreviewIndex((current) => current === undefined ? current : Math.max(0, Math.min(photos.length - 1, current + direction)))} onPhotoError={onPhotoError} />}
    {readIndex !== undefined && <SequenceReadMode sequence={sequence} initialIndex={readIndex} photoSource={dependencies.photoSource} pinned={{}} onTogglePin={() => undefined} onClose={() => setReadIndex(undefined)} onPhotoError={onPhotoError} />}
  </section>;
}
