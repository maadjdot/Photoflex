import { useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
import type {
  PhotoId,
  PhotoSource,
  SequenceDraft,
  SequenceItemId,
  SourceError,
  WorktableDraft,
} from "../contracts";
import { calculateSequenceStripVirtualRange } from "../modules/sequence";
import { PhotoThumb } from "./PhotoThumb";

export function SequenceStrip({
  sequence,
  worktable,
  photoSource,
  onPhotoError,
  onReorder,
  onSelect,
}: {
  readonly sequence: SequenceDraft;
  readonly worktable: WorktableDraft;
  readonly photoSource: PhotoSource;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
  readonly onReorder: (itemId: SequenceItemId, to: number) => void;
  readonly onSelect: (photoId: PhotoId) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<SequenceItemId>();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<SequenceItemId, HTMLButtonElement>());
  const previousPositions = useRef(new Map<SequenceItemId, { readonly left: number; readonly top: number }>());
  const range = useMemo(() => calculateSequenceStripVirtualRange({
    itemCount: sequence.items.length,
    viewportWidth,
    scrollLeft,
  }), [scrollLeft, sequence.items.length, viewportWidth]);
  const visibleItems = sequence.items.slice(range.startIndex, range.endIndex);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || collapsed) return;
    const measure = () => {
      const width = viewport.getBoundingClientRect().width;
      setViewportWidth((current) => current === width ? current : width);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [collapsed]);

  useLayoutEffect(() => {
    const nextPositions = new Map<SequenceItemId, { readonly left: number; readonly top: number }>();
    for (const [itemId, element] of itemRefs.current) {
      const next = element.getBoundingClientRect();
      const previous = previousPositions.current.get(itemId);
      const deltaX = previous ? previous.left - next.left : 0;
      const deltaY = previous ? previous.top - next.top : 0;
      if ((deltaX || deltaY) && typeof element.animate === "function") {
        element.animate([
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ], { duration: 220, easing: "cubic-bezier(.2,.75,.25,1)" });
      }
      nextPositions.set(itemId, { left: next.left, top: next.top });
    }
    previousPositions.current = nextPositions;
  }, [sequence.items]);

  return (
    <section className={`sequence-strip${collapsed ? " is-collapsed" : ""}`} aria-label="Sequence Order">
      <header>
        <button onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand Sequence Order" : "Collapse Sequence Order"}>{collapsed ? "↑" : "↓"}</button>
        <strong>SEQUENCE ORDER</strong><span>{sequence.items.length} photos</span><small>drag to reorder</small>
      </header>
      {!collapsed && <div
        ref={viewportRef}
        className="sequence-strip-items"
        onScroll={(event: UIEvent<HTMLDivElement>) => setScrollLeft(event.currentTarget.scrollLeft)}
      >
        <div className="sequence-strip-track" style={{ width: range.totalWidth }}>
        {visibleItems.map((item, offset) => {
          const index = range.startIndex + offset;
          const placement = worktable.placements[item.photoId];
          return <button
            key={item.id}
            ref={(element) => {
              if (element) itemRefs.current.set(item.id, element);
              else itemRefs.current.delete(item.id);
            }}
            className={`sequence-strip-item${dragId === item.id ? " is-dragging" : ""}`}
            style={{ left: index * range.itemStride }}
            draggable
            onDragStart={() => setDragId(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragId) onReorder(dragId, index);
              setDragId(undefined);
            }}
            onDragEnd={() => setDragId(undefined)}
            onClick={() => onSelect(item.photoId)}
            aria-label={`Sequence ${index + 1}`}
          >
            <PhotoThumb photoSource={photoSource} photoId={item.photoId} alt={placement?.filename ?? `Sequence ${index + 1}`} onError={onPhotoError} />
            <span>{String(index + 1).padStart(2, "0")}</span>
          </button>;
        })}
        </div>
      </div>}
    </section>
  );
}
