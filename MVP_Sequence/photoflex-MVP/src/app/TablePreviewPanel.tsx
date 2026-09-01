import type { PhotoId, SourceError, WorktableDraft } from "../contracts";
import { PhotoThumb } from "./PhotoThumb";
import type { AppDependencies } from "./dependencies";

export function TablePreviewPanel({
  draft,
  photoSource,
  onOpen,
  onOpenTable,
  onPhotoSourceError,
}: {
  readonly draft: WorktableDraft;
  readonly photoSource: AppDependencies["photoSource"];
  readonly onOpen: (photoId: PhotoId) => void;
  readonly onOpenTable: () => void;
  readonly onPhotoSourceError: (photoId: PhotoId, error: SourceError) => void;
}) {
  return (
    <aside className="table-preview-panel" aria-label="Table preview">
      <header className="table-preview-heading">
        <span><small>TABLE</small><strong>{draft.entryOrder.length} photos</strong></span>
        <button onClick={onOpenTable}>Open</button>
      </header>
      {draft.entryOrder.length ? (
        <div className="table-preview-list">
          {draft.entryOrder.map((photoId) => {
            const placement = draft.placements[photoId];
            return (
              <button className="table-preview-item" key={photoId} onClick={() => onOpen(photoId)}>
                <span className="table-preview-thumb"><PhotoThumb photoSource={photoSource} photoId={photoId} alt={placement.filename} onError={onPhotoSourceError} /></span>
                <span>{placement.filename}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="table-preview-empty">Place selected photographs here, then arrange them on Table.</p>}
    </aside>
  );
}
