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
  SequenceDocument,
  SequenceId,
  SequenceSummary,
  SourceError,
  WorktableDraft,
  WorktableEditCommand,
  WorktableItemId,
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
import { sequencePileCardWidth } from "./sequenceCardGeometry";
import { calculateSequenceStripVirtualRange } from "../modules/sequence";

const TABLE_IMAGE_RETENTION_MS = 20_000;
const TABLE_RETAINED_IMAGE_LIMIT = 72;

export interface TableCanvasHandle {
  getViewportCenter(): WorktablePoint;
}

interface TableCanvasSession {
  readonly draft: WorktableDraft;
  readonly selectedPhotoIds: readonly WorktableItemId[];
  readonly selectedPileIds: readonly SequenceId[];
  readonly execute: (command: WorktableEditCommand) => unknown;
  readonly undo: () => unknown;
  readonly redo: () => unknown;
  readonly copySelection: () => boolean;
  readonly pasteSelection: () => unknown;
  readonly selectPhoto: (photoId: WorktableItemId, toggle: boolean) => readonly WorktableItemId[] | undefined;
  readonly selectPile: (sequenceId: SequenceId, toggle: boolean) => readonly SequenceId[] | undefined;
  readonly selectPhotos: (photoIds: readonly WorktableItemId[], additive?: boolean) => unknown;
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
  readonly onComparePhotos: (photoIds: readonly [PhotoId, PhotoId]) => void;
  readonly onCompareSequences: (sequenceIds: readonly [SequenceId, SequenceId]) => void;
  readonly onRequestSequence: (photoIds: readonly WorktableItemId[]) => void;
  readonly onAddToSequence?: () => void;
  readonly onAddMemo?: () => void;
  readonly onDropPhotos: (photoIds: readonly PhotoId[], point: WorktablePoint) => void;
  readonly onDropExternalFiles: (handles: readonly FileSystemHandle[], point: WorktablePoint) => void;
  readonly onDropPhotosOnSequence: (photoIds: readonly WorktableItemId[], sequenceId: SequenceId, at?: number) => void;
  readonly onReadSequence: (sequenceId: SequenceId) => Promise<SequenceDocument | undefined>;
  readonly selectedMemoId?: string;
  readonly onSelectMemo?: (id: string | undefined) => void;
  readonly onSelectPile?: (sequenceId: SequenceId) => void;
  readonly onRemovePiles: (sequenceIds: readonly SequenceId[]) => void;
  readonly onPhotoError: (photoId: PhotoId, error: SourceError) => void;
  readonly missingPhotoIds: ReadonlySet<PhotoId>;
  readonly sourceRevision?: number;
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
    onComparePhotos,
    onCompareSequences,
    onRequestSequence,
    onAddToSequence,
    onAddMemo,
    onDropPhotos,
    onDropExternalFiles,
    onDropPhotosOnSequence,
    onReadSequence,
    onRemovePiles,
    onPhotoError,
    missingPhotoIds,
    sourceRevision,
    interactionDisabled = false,
    emptyAction,
  } = props;
  const { draft, selectedPhotoIds, selectedPileIds } = session;
  const [viewport, setViewportState] = useState(initialViewport);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [retainedPhotoIds, setRetainedPhotoIds] = useState<ReadonlySet<WorktableItemId>>(new Set());
  const [sequenceTray, setSequenceTray] = useState<{ readonly sequence: SequenceDocument; readonly left: number; readonly top: number; readonly width: number }>();
  const [trayScrollLeft, setTrayScrollLeft] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(viewport);
  const photoRetentionRef = useRef(new Map<WorktableItemId, number>());
  const photoRetentionTimerRef = useRef<number | undefined>(undefined);
  viewportRef.current = viewport;

  const selected = useMemo(() => new Set(selectedPhotoIds), [selectedPhotoIds]);
  const selectedPiles = useMemo(() => new Set(selectedPileIds), [selectedPileIds]);
  const visiblePhotoIds = useMemo(
    () => visibleWorktablePhotoIds(draft, viewport, stageSize),
    [draft, stageSize, viewport],
  );
  const mountedPhotoIds = useMemo(
    () => new Set<WorktableItemId>([...retainedPhotoIds, ...visiblePhotoIds]),
    [retainedPhotoIds, visiblePhotoIds],
  );
  const renderedPhotoIds = useMemo(
    () => new Set<WorktableItemId>([...mountedPhotoIds, ...selectedPhotoIds]),
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
    onOpenSequence,
    onDropPhotosOnSequence,
    disabled: interactionDisabled,
  });
  const trayRange = useMemo(() => calculateSequenceStripVirtualRange({
    itemCount: sequenceTray?.sequence.items.length ?? 0,
    viewportWidth: sequenceTray?.width ?? 0,
    scrollLeft: trayScrollLeft,
    itemWidth: 72,
    itemGap: 10,
  }), [sequenceTray, trayScrollLeft]);

  useEffect(() => {
    const sequenceId = gestures.preview.targetSequenceId;
    setSequenceTray(undefined);
    setTrayScrollLeft(0);
    if (!sequenceId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void onReadSequence(sequenceId).then((sequence) => {
        if (!active || !sequence) return;
        const stage = stageRef.current;
        const pile = [...(stage?.querySelectorAll<HTMLElement>("[data-sequence-pile-id]") ?? [])].find((item) => item.dataset.sequencePileId === sequenceId);
        if (!stage || !pile) return;
        const stageRect = stage.getBoundingClientRect();
        const pileRect = pile.getBoundingClientRect();
        const width = Math.max(1, Math.min(560, stageRect.width - 24));
        const left = Math.max(12, Math.min(stageRect.width - width - 12, pileRect.left + pileRect.width / 2 - stageRect.left - width / 2));
        const below = pileRect.bottom - stageRect.top;
        const above = pileRect.top - stageRect.top - 108;
        const top = below + 108 <= stageRect.height ? below : Math.max(8, above);
        setSequenceTray({ sequence, left, top, width });
      });
    }, 240);
    return () => { active = false; window.clearTimeout(timer); };
  }, [gestures.preview.targetSequenceId, onReadSequence]);

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
      const tray = (event.target as HTMLElement).closest<HTMLElement>("[data-sequence-insert-tray]");
      if (tray) {
        event.preventDefault();
        tray.scrollLeft += event.deltaY + event.deltaX;
        return;
      }
      if ((event.target as HTMLElement).closest(".table-memo textarea")) return;
      event.preventDefault();
      const delta = event.deltaY || event.deltaX;
      if (!delta) return;
      setViewport(zoomAroundScreenPoint(
        viewportRef.current,
        { x: event.clientX, y: event.clientY },
        stage.getBoundingClientRect(),
        viewportRef.current.zoom * Math.exp(-delta * .002),
      ));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [draft.projectId, setViewport]);

  const fitItems = (cards: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[]) => {
    const stage = stageRef.current;
    if (!stage) return;
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

  const fit = () => fitItems([
    ...draft.entryOrder.map((id) => draft.placements[id]),
    ...draft.pileOrder.map((id) => draft.pilePlacements[id]),
    ...(draft.memos ?? []),
  ]);

  const framePhotos = () => fitItems(draft.entryOrder.map((id) => draft.placements[id]));

  const centerSelectedPhotos = () => {
    const stage = stageRef.current;
    const cards = selectedPhotoIds.map((id) => draft.placements[id]).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!stage || !cards.length) return;
    const minX = Math.min(...cards.map((item) => item.x));
    const minY = Math.min(...cards.map((item) => item.y));
    const maxX = Math.max(...cards.map((item) => item.x + item.width));
    const maxY = Math.max(...cards.map((item) => item.y + item.height));
    setViewport({
      ...viewportRef.current,
      originX: stage.clientWidth / 2 - ((minX + maxX) / 2) * viewportRef.current.zoom,
      originY: stage.clientHeight / 2 - ((minY + maxY) / 2) * viewportRef.current.zoom,
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
    const target = event.target as HTMLElement;
    if (target.matches("input, textarea, [contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    const actions = deriveTableActions(draft, new Set(selectedPhotoIds), new Set(selectedPileIds));
    const selectedPhoto = selectedPhotoIds.length === 1 ? draft.placements[selectedPhotoIds[0]]?.photoId : undefined;
    if (plain && event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 160 : 64;
      const pan = event.key === "ArrowLeft" ? { x: step, y: 0 }
        : event.key === "ArrowRight" ? { x: -step, y: 0 }
          : event.key === "ArrowUp" ? { x: 0, y: step }
            : { x: 0, y: -step };
      setViewport({ ...viewportRef.current, originX: viewportRef.current.originX + pan.x, originY: viewportRef.current.originY + pan.y });
      return;
    }
    const lockedSelectedIds = selectedPhotoIds.filter((id) => draft.placements[id]?.locked);
    const hasLockedPhotoSelection = lockedSelectedIds.length > 0;
    if (plain && key === "k") {
      event.preventDefault();
      if (event.shiftKey) {
        const lockedIds = draft.entryOrder.filter((id) => draft.placements[id].locked);
        if (lockedIds.length) session.execute({ type: "set-locked", photoIds: lockedIds, locked: false });
      } else if (lockedSelectedIds.length) {
        session.execute({ type: "set-locked", photoIds: lockedSelectedIds, locked: false });
      } else if (selectedPhotoIds.length) {
        session.execute({ type: "set-locked", photoIds: selectedPhotoIds, locked: true });
      }
      return;
    }
    if (hasLockedPhotoSelection) {
      const historyShortcut = (event.ctrlKey || event.metaKey) && key === "z";
      const viewShortcut = plain && ["j", "b", "+", "=", "-", "0"].includes(key);
      if (!historyShortcut && !viewShortcut && event.key !== "Escape") {
        event.preventDefault();
        return;
      }
    }
    if (plain && event.key === " " && selectedPhoto) {
      event.preventDefault();
      onOpenPhoto(selectedPhoto);
      return;
    }
    if (plain && key === "p" && selectedPhoto) {
      event.preventDefault();
      onOpenPhoto(selectedPhoto);
      return;
    }
    if (plain && key === "o" && selectedPileIds.length === 1) {
      event.preventDefault();
      onOpenSequence(selectedPileIds[0]);
      return;
    }
    if (plain && key === "c" && actions.canCompare) {
      event.preventDefault();
      if (actions.compareKind === "photos") {
        const ids = selectedPhotoIds.map((id) => draft.placements[id]?.photoId).filter((id): id is PhotoId => Boolean(id));
        if (ids.length === 2) onComparePhotos([ids[0], ids[1]]);
      } else if (actions.compareKind === "sequences") {
        onCompareSequences([selectedPileIds[0], selectedPileIds[1]]);
      }
      return;
    }
    if (plain && key === "n" && selectedPhotoIds.length && summaries.length && onAddToSequence) {
      event.preventDefault();
      onAddToSequence();
      return;
    }
    if (plain && key === "m" && onAddMemo) {
      event.preventDefault();
      onAddMemo();
      return;
    }
    if (plain && key === "j" && selectedPhotoIds.length) {
      event.preventDefault();
      centerSelectedPhotos();
      return;
    }
    if (plain && key === "b") {
      event.preventDefault();
      framePhotos();
      return;
    }
    if (plain && key === "y" && actions.canArrange) {
      event.preventDefault();
      session.execute({ type: "arrange", photoIds: selectedPhotoIds, layout: { type: "grid" } });
      return;
    }
    if (plain && key === "r" && actions.canArrange) {
      event.preventDefault();
      session.execute({ type: "arrange", photoIds: selectedPhotoIds, layout: { type: "row" } });
      return;
    }
    if (plain && key === "h" && actions.canArrange) {
      event.preventDefault();
      session.execute({ type: "shuffle", photoIds: selectedPhotoIds });
      return;
    }
    if (plain && key === "a" && actions.canArrange) {
      event.preventDefault();
      session.execute({ type: "arrange", photoIds: selectedPhotoIds, layout: { type: "align", edge: event.shiftKey ? "right" : "left" } });
      return;
    }
    if (plain && key === "f" && actions.canBringToFront) {
      event.preventDefault();
      session.execute(selectedPileIds.length ? { type: "bring-sequence-piles-to-front", sequenceIds: selectedPileIds } : { type: "bring-to-front", photoIds: selectedPhotoIds });
      return;
    }
    if (plain && (event.key === "+" || event.key === "=")) {
      event.preventDefault();
      zoom(viewport.zoom + .25);
      return;
    }
    if (plain && event.key === "-") {
      event.preventDefault();
      zoom(viewport.zoom - .25);
      return;
    }
    if (plain && event.key === "0") {
      event.preventDefault();
      fit();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      if (session.copySelection()) event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      session.pasteSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      session.selectAllPhotos();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) session.redo();
      else session.undo();
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && ["g", "l"].includes(key)) {
      event.preventDefault();
      if (key === "g") {
        if (event.shiftKey && actions.selectedGroup) session.execute({ type: "remove-group", groupId: actions.selectedGroup.id });
        else if (!event.shiftKey && actions.canGroup) session.execute({ type: "create-group", photoIds: selectedPhotoIds });
      } else {
        if (event.shiftKey && actions.selectedLink) session.execute({ type: "remove-link", linkId: actions.selectedLink.id });
        else if (!event.shiftKey && actions.canCreateLink && !actions.selectedLink) session.execute({ type: "create-link", photoIds: selectedPhotoIds });
      }
    }
    if (event.key === "Escape") {
      if (!gestures.cancelActiveGesture()) session.clearSelection();
      return;
    }
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
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown J B K Shift+K"
      aria-label={t("table.worktable")}
      onPointerDown={(event) => { if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("worktable-world")) props.onSelectMemo?.(undefined); gestures.onStagePointerDown(event); }}
      onPointerMove={gestures.onStagePointerMove}
      onPointerUp={(event) => gestures.finishGesture(event)}
      onPointerCancel={(event) => gestures.finishGesture(event, true)}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-photoflex-photo") || event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData("application/x-photoflex-photo");
        event.preventDefault();
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const point = screenToWorld({
          x: Number.isFinite(event.clientX) ? event.clientX : rect.left + rect.width / 2,
          y: Number.isFinite(event.clientY) ? event.clientY : rect.top + rect.height / 2,
        }, rect, viewportRef.current);
        if (raw) {
          const photoIds = raw.split(",").map((id) => id.trim()).filter(Boolean) as PhotoId[];
          if (photoIds.length) onDropPhotos(photoIds, point);
          return;
        }
        const handlePromises = Array.from(event.dataTransfer.items).flatMap((item) => {
          const getHandle = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }).getAsFileSystemHandle;
          return getHandle ? [getHandle.call(item)] : [];
        });
        if (!handlePromises.length) { onDropExternalFiles([], point); return; }
        void Promise.all(handlePromises).then((handles) => onDropExternalFiles(handles.filter((handle): handle is FileSystemHandle => Boolean(handle)), point));
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
            <div key={id} className="worktable-photo-position">
            <article
              data-worktable-photo-id={id}
              aria-label={`${item.filename}${item.locked ? ` · ${t("table.locked")}` : ""}`}
              className={`worktable-card${chosen ? " is-selected" : ""}${dragging ? " is-dragging" : ""}${item.locked ? " is-locked" : ""}${missingPhotoIds.has(item.photoId) ? " is-missing" : ""}`}
              style={{ width: item.width * scale, height: item.height * scale, zIndex: item.z, transform: `translate3d(${item.x + delta.x}px,${item.y + delta.y}px,0)` }}
              onPointerDown={(event) => gestures.onPhotoPointerDown(event, id)}
              onDoubleClick={() => onOpenPhoto(item.photoId)}
            >
              <div className="worktable-photo" style={{ height: item.height * scale }}>
                {mountedPhotoIds.has(id)
                  ? <PhotoThumb photoSource={photoSource} photoId={item.photoId} alt={item.filename} onError={onPhotoError} resolution="table" progressiveTo={visiblePhotoIds.has(id) ? tablePreviewEdge(viewport.zoom, chosen) : 768} sourceRevision={sourceRevision} />
                  : <div className="thumb-placeholder" aria-hidden="true" />}
                {missingPhotoIds.has(item.photoId) && <span className="worktable-missing">{t("status.missing")}</span>}
                {item.locked && <span className="worktable-lock-badge" aria-label={t("table.locked")}>LOCK</span>}
              </div>
              {chosen && !item.locked && selectedPhotoIds.length === 1 && <button aria-label="Resize photo" className="worktable-resize-handle" onPointerDown={(event) => gestures.onPhotoResizePointerDown(event, id)} />}
            </article>
            </div>
          );
        })}
        {draft.pileOrder.map((id) => {
          const pile = draft.pilePlacements[id];
          const summary = summaryById.get(id);
          const chosen = selectedPiles.has(id);
          const dragging = chosen && preview.kind === "pile";
          const delta = chosen && preview.kind === "pile" ? preview.dragDelta : { x: 0, y: 0 };
          const scale = preview.kind === "resize-pile" && preview.sequenceId === id ? preview.pileResizeScale : 1;
          const minimumCardWidth = sequencePileCardWidth(summary?.previewPhotoIds.length ?? 0);
          const cardWidth = Math.max(pile.width, minimumCardWidth);
          const cardHeight = Math.max(pile.height, 176);
          return (
            <article
              key={id}
              data-sequence-pile-id={id}
              aria-label={`Sequence pile ${summary?.name ?? "Missing Sequence"}`}
              className={`sequence-pile${chosen ? " is-selected" : ""}${dragging ? " is-dragging" : ""}${preview.targetSequenceId === id ? " is-add-target" : ""}`}
              style={{ width: cardWidth * scale, height: cardHeight * scale, zIndex: pile.z, transform: `translate3d(${pile.x + delta.x - (cardWidth * (scale - 1)) / 2}px,${pile.y + delta.y - (cardHeight * (scale - 1)) / 2}px,0)` }}
              onPointerDown={(event) => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !interactionDisabled) props.onSelectPile?.(id); gestures.onPilePointerDown(event, id); }}
            >
              <header><div><small>SEQUENCE</small><strong>{summary?.name ?? "Missing Sequence"}</strong></div><span>{summary?.photoCount ?? 0}</span></header>
              <div className="sequence-pile-thumbs">{summary?.previewPhotoIds.map((photoId, index) => <span key={`${photoId}-${index}`}><PhotoThumb fit="cover" photoSource={photoSource} photoId={photoId} alt="" onError={onPhotoError} sourceRevision={sourceRevision} /></span>)}</div>
              <button
                type="button"
                aria-label="Resize sequence pile"
                className="worktable-resize-handle sequence-pile-resize-handle"
                disabled={interactionDisabled}
                onPointerDown={(event) => gestures.onPileResizePointerDown(event, id, { width: cardWidth, height: cardHeight })}
              />
            </article>
          );
        })}
      </div>
      {preview.marquee && <div className="worktable-marquee" style={preview.marquee} />}
      {sequenceTray && preview.targetSequenceId === sequenceTray.sequence.id && <div
        className="sequence-insert-tray"
        data-sequence-insert-tray
        data-sequence-id={sequenceTray.sequence.id}
        data-item-count={sequenceTray.sequence.items.length}
        aria-hidden="true"
        style={{ left: sequenceTray.left, top: sequenceTray.top, width: sequenceTray.width }}
        onScroll={(event) => setTrayScrollLeft(event.currentTarget.scrollLeft)}
      >
        <div className="sequence-insert-track" style={{ width: Math.max(sequenceTray.width, trayRange.totalWidth + 24) }}>
          {sequenceTray.sequence.items.slice(trayRange.startIndex, trayRange.endIndex).map((item, offset) => {
            const index = trayRange.startIndex + offset;
            return <div key={item.id} className="sequence-insert-item" style={{ left: 12 + index * trayRange.itemStride }}>
              {item.kind === "photo" ? <PhotoThumb photoSource={photoSource} photoId={item.photoId} alt="" onError={onPhotoError} resolution="sequence" sourceRevision={sourceRevision} /> : <span className="sequence-insert-nonphoto">{item.kind === "blank" ? t("sequence.blank") : t("sequence.text")}</span>}
              <small>{index + 1}</small>
            </div>;
          })}
          {preview.insertIndex !== undefined && <span className="sequence-insert-marker" style={{ left: 8 + preview.insertIndex * trayRange.itemStride }} />}
        </div>
      </div>}
      {!draft.entryOrder.length && !draft.pileOrder.length && !draft.memos?.length && (
        <section className="worktable-empty">
          <span>{t("table.emptyLabel")}</span>
          <h1>{t("table.empty")}</h1>
          <p>{t("table.emptyDetail")}</p>
          <button className="button button-primary" onClick={emptyAction.onClick}>{emptyAction.label}</button>
        </section>
      )}
      <TableHeaderControl><div className="worktable-canvas-controls" aria-label={t("table.controls")}>
        <button className="table-tool-icon-button" aria-label={t("table.zoomOut")} title={`${t("table.zoomOut")} · -`} onClick={() => zoom(viewport.zoom - .25)}><img src={minusIcon} alt="" /></button>
        <button className="table-zoom-label" aria-label={t("table.fit")} title={`${t("table.fitTitle")} · 0 · B = photos`} onClick={fit}>{Math.round(viewport.zoom * 100)}%</button>
        <button className="table-tool-icon-button" aria-label={t("table.zoomIn")} title={`${t("table.zoomIn")} · +`} onClick={() => zoom(viewport.zoom + .25)}><img src={plusIcon} alt="" /></button>
      </div></TableHeaderControl>
    </div>
  );
});

function groupBounds(draft: WorktableDraft, ids: readonly WorktableItemId[]) {
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

function setsEqual(left: ReadonlySet<WorktableItemId>, right: ReadonlySet<WorktableItemId>) {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function tablePreviewEdge(zoom: number, selected: boolean): DerivedPreviewMaxEdge {
  if (zoom >= 4) return 2048;
  if (selected || zoom >= 2) return 1536;
  return 768;
}
