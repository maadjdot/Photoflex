import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PhotoId, PhotoState, ReadingUnit, SequenceDocument, SequenceItem } from "../contracts";
import { createSequenceLookup, readingPaperLayout, readingUnitItemIds as unitItemIds, READING_PHOTO_INSET, type SequenceLookup } from "../modules/sequence";
import { PhotoThumb } from "./PhotoThumb";
import { useDialogKeyboard } from "./AppPrimitives";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";

interface SequenceReadModeProps {
  readonly sequence: SequenceDocument;
  readonly initialIndex: number;
  readonly photoSource: AppDependencies["photoSource"];
  readonly pinned: Readonly<Partial<Record<PhotoId, PhotoState>>>;
  readonly onTogglePin: (id: PhotoId) => void;
  readonly onClose: () => void;
  readonly onPhotoError: (id: PhotoId) => void;
}

export async function warmSequenceReadAt(photoSource: AppDependencies["photoSource"], sequence: SequenceDocument, index: number): Promise<void> {
  const { itemById } = createSequenceLookup(sequence);
  const photoIds = [index, index + 1]
    .flatMap((unitIndex) => sequence.readingUnits[unitIndex] ? unitItemIds(sequence.readingUnits[unitIndex]) : [])
    .map((itemId) => itemById.get(itemId))
    .filter((item): item is Extract<SequenceItem, { kind: "photo" }> => item?.kind === "photo")
    .map((item) => item.photoId);
  const results = await Promise.all(photoIds.map((photoId) => photoSource.derivedPreview(photoId, 2048)));
  results.forEach((result) => result.ok && result.value.release());
}

/** Owns the Read-mode keyboard, focus and preview-lease lifecycle. */
export function SequenceReadMode({ sequence, initialIndex, photoSource, pinned, onTogglePin, onClose, onPhotoError }: SequenceReadModeProps) {
  const { t } = useLocale();
  const [index, setIndex] = useState(Math.max(0, Math.min(sequence.readingUnits.length - 1, initialIndex)));
  const [background, setBackground] = useState<"dark" | "light">("dark");
  const [controls, setControls] = useState(true);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const timer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogKeyboard(rootRef, onClose);
  const lookup = useMemo(() => createSequenceLookup(sequence), [sequence]);
  const reveal = useCallback(() => {
    setControls(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setControls(false), 2000);
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    reveal();
    return () => window.clearTimeout(timer.current);
  }, [reveal]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      reveal();
      if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
      else if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(sequence.readingUnits.length - 1, value + 1)); }
      else if (event.key === "Home") { event.preventDefault(); setIndex(0); }
      else if (event.key === "End") { event.preventDefault(); setIndex(sequence.readingUnits.length - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reveal, sequence.readingUnits.length]);

  useEffect(() => {
    let live = true;
    const neighborIds = [index - 1, index + 1, index + 2]
      .flatMap((unitIndex) => sequence.readingUnits[unitIndex] ? unitItemIds(sequence.readingUnits[unitIndex]) : [])
      .map((id) => lookup.itemById.get(id))
      .filter((item): item is Extract<SequenceItem, { kind: "photo" }> => item?.kind === "photo")
      .map((item) => item.photoId);
    const leases: Array<{ release(): void }> = [];
    void Promise.all(neighborIds.map((photoId) => photoSource.derivedPreview(photoId, 2048))).then((results) => {
      if (!live) { results.forEach((result) => result.ok && result.value.release()); return; }
      leases.push(...results.flatMap((result) => result.ok ? [result.value] : []));
    });
    return () => { live = false; leases.forEach((lease) => lease.release()); };
  }, [index, lookup, photoSource, sequence.readingUnits]);

  const unit = sequence.readingUnits[index];
  if (!unit) return null;
  const items = unitItemIds(unit).map((id) => lookup.itemById.get(id)).filter((item): item is SequenceItem => Boolean(item));
  const layout = readingPaperLayout(viewport, items.length);
  const paperStyle = { width: layout.width, height: layout.height, gap: layout.gap, "--reading-photo-size": `${(1 - READING_PHOTO_INSET * 2) * 100}%` } as CSSProperties;
  return <section ref={rootRef} className={`sequence-read is-${background}${controls ? " has-controls" : ""}`} role="dialog" aria-modal="true" aria-label={`${t("sequence.read")} ${sequence.name}`} onMouseMove={reveal}>
    <div className="sequence-read-pages" style={paperStyle}>{items.map((item) => <article key={item.id} className="sequence-read-page">{item.kind === "photo" ? <PhotoThumb resolution="read" eager photoSource={photoSource} photoId={item.photoId} alt="Sequence reading photograph" onError={onPhotoError} /> : null}{controls && item.kind === "photo" && <button className="sequence-read-pin" onClick={() => onTogglePin(item.photoId)}>{pinned[item.photoId]?.pinned ? "Unpin" : "Pin"}</button>}</article>)}</div>
    <button className="sequence-read-zone is-left" disabled={index === 0} aria-label={t("sequence.previousUnit")} onClick={() => setIndex((value) => Math.max(0, value - 1))} />
    <button className="sequence-read-zone is-right" disabled={index === sequence.readingUnits.length - 1} aria-label={t("sequence.nextUnit")} onClick={() => setIndex((value) => Math.min(sequence.readingUnits.length - 1, value + 1))} />
    <header><button ref={closeRef} onClick={onClose}>{t("common.close")}</button><strong>{sequence.name}</strong><button onClick={() => setBackground((value) => value === "dark" ? "light" : "dark")}>{background === "dark" ? t("sequence.whiteBackground") : t("sequence.darkBackground")}</button></header>
    <footer>{pageLabel(sequence, unit, lookup)} · {index + 1} / {sequence.readingUnits.length}</footer>
  </section>;
}

function pageLabel(sequence: SequenceDocument, unit: ReadingUnit, lookup: SequenceLookup): string {
  const indices = unitItemIds(unit).map((id) => (lookup.itemIndexById.get(id) ?? -1) + 1);
  return indices.length === 2
    ? `${String(indices[0]).padStart(2, "0")}–${String(indices[1]).padStart(2, "0")} / ${sequence.items.length}`
    : `${String(indices[0]).padStart(2, "0")} / ${sequence.items.length}`;
}
