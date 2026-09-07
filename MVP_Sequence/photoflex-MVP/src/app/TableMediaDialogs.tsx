import { useEffect, useRef, useState } from "react";
import type { PhotoId, PhotoSource, SourceError, WorktableDraft } from "../contracts";
import { useDialogKeyboard } from "./AppPrimitives";

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
  const [url, setUrl] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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
    <section className="table-preview-dialog" onPointerDown={(event) => event.stopPropagation()}>
      <header><span>{filename}</span><button ref={closeButtonRef} onClick={onClose} aria-label="Close preview">×</button></header>
      <div className="table-preview-image-wrap">{url ? <img src={url} alt={filename} /> : <div className="preview-placeholder">Preview unavailable</div>}</div>
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

  return <div ref={dialogRef} className="compare-backdrop" role="dialog" aria-modal="true" aria-label="Compare two photos">
    <header><span>COMPARE</span><button onClick={() => setOrder([order[1], order[0]])}>Swap</button><button ref={closeButtonRef} onClick={onClose} aria-label="Close compare">×</button></header>
    <div className="compare-images">{order.map((id, index) => <figure key={id}><span>{index ? "B" : "A"}</span>{urls[index] ? <img src={urls[index]} alt={draft.placements[id].filename} /> : <div className="preview-placeholder">Preview unavailable</div>}</figure>)}</div>
  </div>;
}
