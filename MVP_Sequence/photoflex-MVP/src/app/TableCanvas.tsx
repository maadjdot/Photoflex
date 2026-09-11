import { TableMemos } from "./TableMemos";
import { TableHeaderControl } from "./TableHeaderControl";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import minusIcon from "../assets/icons/table-minus.svg";
import plusIcon from "../assets/icons/table-plus.svg";
import type {
  DerivedPreviewMaxEdge,
  PhotoId,
  SequenceId,
  SequenceSummary,
  SourceError,
  WorktableDraft,
  WorktableEditCommand,
  WorktablePoint,
  WorktableViewport,
} from "../contracts";
import {
  clampWorktableZoom,
  screenToWorld,
  visibleWorktablePhotoIds,
  zoomAroundScreenPoint,
} from "../modules/worktable";
import type { AppDependencies } from "./dependencies";
import { PhotoThumb } from "./PhotoThumb";
import { deriveTableActions } from "./tableActionPolicy";
import { useTableGestures } from "./useTableGestures";
import { useLocale } from "./locale";

const TABLE_IMAGE_RETENTION_MS = 20_000;
const TABLE_RETAINED_IMAGE_LIMIT = 72;

export interface TableCanvasHandle {
  getViewportCenter(): WorktablePoint;
}

interface TableCanvasSession {
  readonly draft: WorktableDraft;
  readonly selectedPhotoIds: readonly PhotoId[];
  readonly selectedPileIds: readonly SequenceId[];
  readonly execute: (command: WorktableEditCommand) => unknown;
  readonly undo: () => unknown;
  readonly redo: () => unknown;
  readonly selectPhoto: (photoId: PhotoId, toggle: boolean) => readonly PhotoId[] | undefined;
  readonly selectPile: (sequenceId: SequenceId, toggle: boolean) => readonly SequenceId[] | undefined;
  readonly selectPhotos: (photoIds: readonly PhotoId[], additive?: boolean) => unknown;
  readonly selectAllPhotos: () => unknown;
  readonly clearSelection: () => unknown;
}

interface TableCanvasProps {
  readonly session: TableCanvasSession;
  readonly photoSource: AppDependencies["photoSource"];
  readonly summaries: readonly SequenceSummary[];
  readonly initialViewport: WorktableViewport;
  readonly onViewportChange: (viewport: WorktableViewport) => void;
  readonly onOpenPhoto: (photoId: PhotoId) => void;
  readonly onOpenSequence: (sequenceId: SequenceId) => void;
  readonly onRequestSequence: (photoIds: readonly PhotoId[]) => void;
  readonly onDropPhotos: (photoIds: readonly PhotoId[], point: WorktablePoint) => void;
  readonly selectedMemoId?: string;
  readonly onSelectMemo?: (id: string | undefined) => void;
  readonly onSelectPile?: (sequenceId: SequenceId) => void;
  readonly onRemovePiles: (sequenceIds: readonly SequenceId[]) => void;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
  readonly missingPhotoIds: ReadonlySet<PhotoId>;
  readonly interactionDisabled?: boolean;
  readonly emptyAction: { readonly label: string; readonly onClick: () => void };
}

export const TableCanvas = forwardRef<TableCanvasHandle, TableCanvasProps>(function TableCanvas(props, forwardedRef) {
  const { t } = useLocale();
  const {
    session,
    photoSource,
    summaries,
    initialViewport,
    onViewportChange,
    onOpenPhoto,
    onOpenSequence,
    onRequestSequence,
    onDropPhotos,
    onRemovePiles,
    onPhotoError,
    missingPhotoIds,
    interactionDisabled = false,
    emptyAction,
  } = props;
  const { draft, selectedPhotoIds, selectedPileIds } = session;
  const [viewport, setViewportState] = useState(initialViewport);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [retainedPhotoIds, setRetainedPhotoIds] = useState<ReadonlySet<PhotoId>>(new Set());
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(viewport);
  const photoRetentionRef = useRef(new Map<PhotoId, number>());
  const photoRetentionTimerRef = useRef<number | undefined>(undefined);
  viewportRef.current = viewport;

  const selected = useMemo(() => new Set(selectedPhotoIds), [selectedPhotoIds]);
  const selectedPiles = useMemo(() => new Set(selectedPileIds), [selectedPileIds]);
  const visiblePhotoIds = useMemo(
    () => visibleWorktablePhotoIds(draft, viewport, stageSize),
    [draft, stageSize, viewport],
  );
  const mountedPhotoIds = useMemo(
    () => new Set<PhotoId>([...retainedPhotoIds, ...visiblePhotoIds]),
    [retainedPhotoIds, visiblePhotoIds],
  );
  const renderedPhotoIds = useMemo(
    () => new Set<PhotoId>([...mountedPhotoIds, ...selectedPhotoIds]),
    [mountedPhotoIds, selectedPhotoIds],
  );
  const summaryById = useMemo(
    () => new Map(summaries.map((summary) => [summary.id, summary])),
    [summaries],
  );

  const setViewport = useCallback((next: WorktableViewport) => {
    viewportRef.current = next;
    setViewportState(next);
    onViewportChange(next);
  }, [onViewportChange]);

  const execute = useCallback((command: WorktableEditCommand) => {
    session.execute(command);
  }, [session]);

  const gestures = useTableGestures({
    stageRef,
    draft,
    viewport,
    setViewport,
    execute,
    selectPhoto: session.selectPhoto,
    selectPile: session.selectPile,
    selectPhotos: session.selectPhotos,
    clearSelection: session.clearSelection,
    disabled: interactionDisabled,
  });

  useImperativeHandle(forwardedRef, () => ({
    getViewportCenter() {
      const stage = stageRef.current;
      if (!stage) return { x: 200, y: 160 };
      const rect = stage.getBoundingClientRect();
      return screenToWorld({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, viewportRef.current);
    },
  }), []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      const next = { width: stage.clientWidth || rect.width, height: stage.clientHeight || rect.height };
      setStageSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(stage);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [draft]);

  useEffect(() => {
    const retention = photoRetentionRef.current;
    const now = Date.now();
    visiblePhotoIds.forEach((id) => retention.set(id, now));
    if (photoRetentionTimerRef.current !== undefined) window.clearTimeout(photoRetentionTimerRef.current);
    const prune = () => {
      const cutoff = Date.now() - TABLE_IMAGE_RETENTION_MS;
      const valid = [...retention.entries()]
        .filter(([id, lastSeen]) => Boolean(draft.placements[id]) && (visiblePhotoIds.has(id) || lastSeen >= cutoff))
        .sort((left, right) => right[1] - left[1]);
      const visible = valid.filter(([id]) => visiblePhotoIds.has(id));
      const nearby = valid.filter(([id]) => !visiblePhotoIds.has(id)).slice(0, Math.max(0, TABLE_RETAINED_IMAGE_LIMIT - visible.length));
      const next = new Set([...visible, ...nearby].map(([id]) => id));
      retention.forEach((_lastSeen, id) => {
        if (!next.has(id) && !visiblePhotoIds.has(id)) retention.delete(id);
      });
      setRetainedPhotoIds((current) => setsEqual(current, next) ? current : next);
      const nextExpiry = valid
        .filter(([id, lastSeen]) => !visiblePhotoIds.has(id) && lastSeen >= cutoff)
        .sort((left, right) => left[1] - right[1])[0];
      if (nextExpiry) {
        photoRetentionTimerRef.current = window.setTimeout(
          prune,
          Math.max(250, nextExpiry[1] + TABLE_IMAGE_RETENTION_MS - Date.now() + 25),
        );
      }
    };
    prune();
    return () => {
      if (photoRetentionTimerRef.current !== undefined) window.clearTimeout(photoRetentionTimerRef.current);
      photoRetentionTimerRef.current = undefined;
    };
  }, [draft.placements, visiblePhotoIds]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey && (event.target as HTMLElement).closest(".table-memo textarea")) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setViewport(zoomAroundScreenPoint(
          viewportRef.current,
          { x: event.clientX, y: event.clientY },
          stage.getBoundingClientRect(),
          viewportRef.current.zoom * Math.exp(-event.deltaY * .002),
        ));
        return;
      }
      setViewport({
        ...viewportRef.current,
        originX: viewportRef.current.originX - event.deltaX,
        originY: viewportRef.current.originY - event.deltaY,
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [draft.projectId, setViewport]);

  const fit = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const cards = [
      ...draft.entryOrder.map((id) => draft.placements[id]),
      ...draft.pileOrder.map((id) => draft.pilePlacements[id]),
      ...(draft.memos ?? []),
    ];
    if (!cards.length) return setViewport(initialViewport);
    const minX = Math.min(...cards.map((item) => item.x));
    const minY = Math.min(...cards.map((item) => item.y));
    const maxX = Math.max(...cards.map((item) => item.x + item.width));
    const maxY = Math.max(...cards.map((item) => item.y + item.height));
    const zoom = clampWorktableZoom(Math.min(
      (stage.clientWidth - 128) / (maxX - minX),
      (stage.clientHeight - 128) / (maxY - minY),
    ));
    setViewport({
      zoom,
      originX: (stage.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom,
      originY: (stage.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom,
    });
  };

  const zoom = (value: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    setViewport(zoomAroundScreenPoint(
      viewportRef.current,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      rect,
      value,
    ));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (interactionDisabled) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      session.selectAllPhotos();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) session.redo();
      else session.undo();
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && ["g", "l"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const actions = deriveTableActions(draft, new Set(selectedPhotoIds), new Set(selectedPileIds));
      if (event.key.toLowerCase() === "g") {
        if (event.shiftKey && actions.selectedGroup) session.execute({ type: "remove-group", groupId: actions.selectedGroup.id });
        else if (!event.shiftKey && actions.canGroup) session.execute({ type: "create-group", photoIds: selectedPhotoIds });
      } else {
        if (event.shiftKey && actions.selectedLink) session.execute({ type: "remove-link", linkId: actions.selectedLink.id });
        else if (!event.shiftKey && actions.canCreateLink && !actions.selectedLink) session.execute({ type: "create-link", photoIds: selectedPhotoIds });
      }
    }
    if (event.key === "Escape") session.clearSelection();
    if (event.key.toLowerCase() === "s" && selectedPhotoIds.length) onRequestSequence(selectedPhotoIds);
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedPileIds.length) onRemovePiles(selectedPileIds);
      else if (selectedPhotoIds.length) session.execute({ type: "remove", photoIds: selectedPhotoIds });
    }
  };

  const preview = gestures.preview;
  return (
    <div
      ref={stageRef}
      className="worktable-stage"
      tabIndex={0}
      aria-label={t("table.worktable")}
      onPointerDown={(event) => { if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("worktable-world")) props.onSelectMemo?.(undefined); gestures.onStagePointerDown(event); }}
      onPointerMove={gestures.onStagePointerMove}
      onPointerUp={(event) => gestures.finishGesture(event)}
      onPointerCancel={(event) => gestures.finishGesture(event, true)}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-photoflex-photo")) event.preventDefault();
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData("application/x-photoflex-photo");
        if (!raw) return;
        event.preventDefault();
        const photoIds = raw.split(",").map((id) => id.trim()).filter(Boolean) as PhotoId[];
        if (photoIds.length) {
          const rect = stageRef.current?.getBoundingClientRect();
          if (rect) onDropPhotos(photoIds, screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current));
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
    >
      <div className="worktable-world" style={{ transform: `translate3d(${viewport.originX}px,${viewport.originY}px,0) scale(${viewport.zoom})` }}>
        <TableMemos draft={draft} zoom={viewport.zoom} selectedId={props.selectedMemoId} onSelect={(id) => props.onSelectMemo?.(id)} onExecute={session.execute} disabled={interactionDisabled} />
        <svg className="worktable-links">
          {draft.links.flatMap((link) => link.photoIds.slice(1).map((id, index) => {
            const left = draft.placements[link.photoIds[index]];
            const right = draft.placements[id];
            return <line key={`${link.id}-${id}`} x1={left.x + left.width / 2} y1={left.y + left.height / 2} x2={right.x + right.width / 2} y2={right.y + right.height / 2} />;
          }))}
        </svg>
        {draft.groups.map((group) => {
          const box = groupBounds(draft, group.photoIds);
          return <div key={group.id} className="worktable-group-frame" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}><span onPointerDown={(event) => gestures.onGroupPointerDown(event, group.photoIds)}>{group.name} · {t("common.photoCount", { count: group.photoIds.length })}</span></div>;
        })}
        {draft.entryOrder.filter((id) => renderedPhotoIds.has(id)).map((id) => {
          const item = draft.placements[id];
          const chosen = selected.has(id);
          const dragging = chosen && preview.kind === "photo";
          const delta = chosen && preview.kind === "photo" ? preview.dragDelta : { x: 0, y: 0 };
          const scale = preview.kind === "resize" && preview.photoId === id ? preview.resizeScale : 1;
          return (
            <article
              key={id}
              aria-label={item.filename}
              className={`worktable-card${chosen ? " is-selected" : ""}${dragging ? " is-dragging" : ""}${missingPhotoIds.has(id) ? " is-missing" : ""}`}
              style={{ width: item.width * scale, height: item.height * scale, zIndex: item.z, transform: `translate3d(${item.x + delta.x}px,${item.y + delta.y}px,0)` }}
              onPointerDown={(event) => gestures.onPhotoPointerDown(event, id)}
              onDoubleClick={() => onOpenPhoto(id)}
            >
              <div className="worktable-photo" style={{ height: item.height * scale }}>
                {mountedPhotoIds.has(id)
                  ? <PhotoThumb photoSource={photoSource} photoId={id} alt={item.filename} onError={onPhotoError} resolution="table" progressiveTo={visiblePhotoIds.has(id) ? tablePreviewEdge(viewport.zoom, chosen) : 768} />
                  : <div className="thumb-placeholder" aria-hidden="true" />}
                {missingPhotoIds.has(id) && <span className="worktable-missing">{t("status.missing")}</span>}
              </div>
              {chosen && selectedPhotoIds.length === 1 && <button aria-label="Resize photo" className="worktable-resize-handle" onPointerDown={(event) => gestures.onPhotoResizePointerDown(event, id)} />}
            </article>
          );
        })}
        {draft.pileOrder.map((id) => {
          const pile = draft.pilePlacements[id];
          const summary = summaryById.get(id);
          const chosen = selectedPiles.has(id);
          const dragging = chosen && preview.kind === "pile";
          const delta = chosen && preview.kind === "pile" ? preview.dragDelta : { x: 0, y: 0 };
          const scale = preview.kind === "resize-pile" && preview.sequenceId === id ? preview.pileResizeScale : 1;
          return (
            <article
              key={id}
              aria-label={`Sequence pile ${summary?.name ?? "Missing Sequence"}`}
              className={`sequence-pile${chosen ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
              style={{ width: pile.width * scale, height: pile.height * scale, zIndex: pile.z, transform: `translate3d(${pile.x + delta.x - (pile.width * (scale - 1)) / 2}px,${pile.y + delta.y - (pile.height * (scale - 1)) / 2}px,0)` }}
              onPointerDown={(event) => { if (event.button === 0 && !interactionDisabled) props.onSelectPile?.(id); gestures.onPilePointerDown(event, id); }}
              onDoubleClick={(event) => { event.stopPropagation(); onOpenSequence(id); }}
            >
              <header><strong>{summary?.name ?? "Missing Sequence"}</strong><span>{summary?.itemCount ?? 0}</span></header>
              <div className="sequence-pile-thumbs">{summary?.previewPhotoIds.map((photoId, index) => <span key={`${photoId}-${index}`}><PhotoThumb photoSource={photoSource} photoId={photoId} alt="" onError={onPhotoError} /></span>)}</div>
              {chosen && <button aria-label="Resize sequence pile" className="worktable-resize-handle sequence-pile-resize-handle" onPointerDown={(event) => gestures.onPileResizePointerDown(event, id)} />}
            </article>
          );
        })}
      </div>
      {preview.marquee && <div className="worktable-marquee" style={preview.marquee} />}
      {!draft.entryOrder.length && !draft.pileOrder.length && !draft.memos?.length && (
        <section className="worktable-empty">
          <span>{t("table.emptyLabel")}</span>
          <h1>{t("table.empty")}</h1>
          <p>{t("table.emptyDetail")}</p>
          <button className="button button-primary" onClick={emptyAction.onClick}>{emptyAction.label}</button>
        </section>
      )}
      <TableHeaderControl><div className="worktable-canvas-controls" aria-label={t("table.controls")}>
        <button className="table-tool-icon-button" aria-label={t("table.zoomOut")} onClick={() => zoom(viewport.zoom - .25)}><img src={minusIcon} alt="" /></button>
        <button className="table-zoom-label" aria-label={t("table.fit")} title={t("table.fitTitle")} onClick={fit}>{Math.round(viewport.zoom * 100)}%</button>
        <button className="table-tool-icon-button" aria-label={t("table.zoomIn")} onClick={() => zoom(viewport.zoom + .25)}><img src={plusIcon} alt="" /></button>
      </div></TableHeaderControl>
    </div>
  );
});

function groupBounds(draft: WorktableDraft, ids: readonly PhotoId[]) {
  const placements = ids.map((id) => draft.placements[id]);
  const contentLeft = Math.min(...placements.map((item) => item.x));
  const contentTop = Math.min(...placements.map((item) => item.y));
  const contentRight = Math.max(...placements.map((item) => item.x + item.width));
  const contentBottom = Math.max(...placements.map((item) => item.y + item.height));
  const left = contentLeft - 13;
  const top = contentTop - 44;
  return {
    left,
    top,
    width: Math.max(240, contentRight - contentLeft + 26),
    height: contentBottom - contentTop + 57,
  };
}

function setsEqual(left: ReadonlySet<PhotoId>, right: ReadonlySet<PhotoId>) {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function tablePreviewEdge(zoom: number, selected: boolean): DerivedPreviewMaxEdge {
  if (zoom >= 4) return 2048;
  if (selected || zoom >= 2) return 1536;
  return 768;
}
