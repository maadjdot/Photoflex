import { useEffect, useState } from "react";
import type { PhotoId, WorktableDraft } from "../contracts";
import type { AppDependencies } from "./dependencies";

export function CompareOverlay({
  photoIds,
  draft,
  photoSource,
  onClose,
}: {
  readonly photoIds: readonly [PhotoId, PhotoId];
  readonly draft: WorktableDraft;
  readonly photoSource: AppDependencies["photoSource"];
  readonly onClose: () => void;
}) {
  const [order, setOrder] = useState(photoIds);
  const [urls, setUrls] = useState<ReadonlyMap<PhotoId, string>>(new Map());
  useEffect(() => {
    let active = true;
    const leases: Array<{ release(): void }> = [];
    setUrls(new Map());
    void Promise.all(photoIds.map((photoId) => photoSource.preview(photoId))).then((results) => {
      if (!active) {
        results.forEach((result) => { if (result.ok) result.value.release(); });
        return;
      }
      const loaded = results.flatMap((result) => result.ok ? [result.value] : []);
      leases.push(...loaded);
      setUrls(new Map(results.flatMap((result, index) => result.ok ? [[photoIds[index], result.value.url] as const] : [])));
    });
    return () => { active = false; leases.forEach((lease) => lease.release()); };
  }, [photoIds, photoSource]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="compare-backdrop" role="dialog" aria-modal="true" aria-label="Compare two photos">
    <header><span>COMPARE</span><button onClick={() => setOrder([order[1], order[0]])}>Swap</button><button onClick={onClose} aria-label="Close compare">×</button></header>
    <div className="compare-images">{order.map((photoId, index) => <figure key={photoId}><span>{index === 0 ? "A" : "B"}</span>{urls.get(photoId) ? <img src={urls.get(photoId)} alt={draft.placements[photoId].filename} /> : <div className="preview-placeholder">Preview unavailable</div>}</figure>)}</div>
  </div>;
}
