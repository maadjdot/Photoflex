import type { PhotoId, SourceError, WorktableDraft } from "../contracts";
import { PhotoThumb } from "./PhotoThumb";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";

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
  const { t } = useLocale();
  return (
    <aside className="table-preview-panel" aria-label={`${t("nav.table")} ${t("table.preview")}`}>
      <header className="table-preview-heading">
        <span><small>{t("nav.table")}</small><strong>{t("common.photoCount", { count: draft.entryOrder.length })}</strong></span>
        <button onClick={onOpenTable}>{t("common.open")}</button>
      </header>
      {draft.entryOrder.length ? (
        <div className="table-preview-list">
          {draft.entryOrder.map((itemId) => {
            const placement = draft.placements[itemId];
            return (
              <button className="table-preview-item" key={itemId} onClick={() => onOpen(placement.photoId)}>
                <span className="table-preview-thumb"><PhotoThumb photoSource={photoSource} photoId={placement.photoId} alt={placement.filename} onError={onPhotoSourceError} /></span>
                <span>{placement.filename}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="table-preview-empty">{t("table.emptyDetail")}</p>}
    </aside>
  );
}
