import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { aggregateLatencyRuns } from "@photoflex/benchmark-core";
import { createSequenceEngine, type SequenceSnapshot } from "@photoflex/sequence-engine";
import {
  commitWhiteboard,
  createWhiteboardState,
  discardWhiteboard,
  reduceWhiteboard,
  selectItemsInRect,
  stableStateHash,
  visibleWhiteboardItems,
  whiteboardStateMatchesIds,
  type WhiteboardItem,
  type WhiteboardRect,
  type WhiteboardState,
} from "@photoflex/whiteboard-engine";
import { probeFrames } from "./frameProbe";
import {
  hasNativeExportQueue,
  hasNativeFileSave,
  hasNativeSourceLibrary,
  hostDiagnostics,
  loadNativeBootstrapSource,
  loadNativeSource,
  nativePdfCancel,
  nativePdfSave,
  nativeJsonSave,
  nativePdfRetry,
  nativePdfStart,
  nativePdfStatus,
} from "./host";
import { createBenchmarkPdf } from "./pdfDocument";
import { expandPhotoAssets, isSupportedPhoto, type PhotoAsset, type PhotoRecord } from "./photoCatalog";

const GRID_COUNT = 10_000;
const SEQUENCE_COUNT = 500;
const BOARD_WIDTH = 5200;
const BOARD_HEIGHT = 3600;
const TABS = ["Library T-01", "Sequence T-02", "Whiteboard WB-01", "Mixed MIX-01", "PDF T-04", "Results"] as const;
type Tab = (typeof TABS)[number];

interface EvidenceRecord {
  kind: string;
  capturedAt: string;
  [key: string]: unknown;
}

interface PreviewState {
  recordId: string;
  records: PhotoRecord[];
}

interface SequencePointerDrag {
  pointerId: number;
  ids: string[];
  startX: number;
  startY: number;
  moved: boolean;
  startedAt: number;
  targetIndex: number;
  framePending: boolean;
}

interface SequenceDragPreview {
  ids: string[];
  dx: number;
  dy: number;
  targetIndex: number;
}

interface BoardDrag {
  kind: "drag";
  ids: string[];
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  startedAt: number;
}

interface BoardMarquee {
  kind: "marquee";
  startX: number;
  startY: number;
  rect: WhiteboardRect;
  retainedIds: string[];
}

interface BoardPan {
  kind: "pan";
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

interface BoardResize {
  kind: "resize";
  id: string;
  corner: "nw" | "ne" | "sw" | "se";
  startItem: Pick<WhiteboardItem, "x" | "y" | "width" | "height">;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  startedAt: number;
}

type BoardInteraction = BoardDrag | BoardMarquee | BoardPan | BoardResize;

function resizeGeometry(interaction: BoardResize): Pick<WhiteboardItem, "x" | "y" | "width" | "height"> {
  const minimum = 40;
  const startRight = interaction.startItem.x + interaction.startItem.width;
  const startBottom = interaction.startItem.y + interaction.startItem.height;
  let left = interaction.corner.includes("w")
    ? Math.min(startRight - minimum, Math.max(0, interaction.startItem.x + interaction.dx))
    : interaction.startItem.x;
  let right = interaction.corner.includes("e")
    ? Math.max(left + minimum, Math.min(BOARD_WIDTH, startRight + interaction.dx))
    : startRight;
  let top = interaction.corner.includes("n")
    ? Math.min(startBottom - minimum, Math.max(0, interaction.startItem.y + interaction.dy))
    : interaction.startItem.y;
  let bottom = interaction.corner.includes("s")
    ? Math.max(top + minimum, Math.min(BOARD_HEIGHT, startBottom + interaction.dy))
    : startBottom;
  left = Math.max(0, Math.min(left, BOARD_WIDTH - minimum));
  top = Math.max(0, Math.min(top, BOARD_HEIGHT - minimum));
  right = Math.max(left + minimum, Math.min(right, BOARD_WIDTH));
  bottom = Math.max(top + minimum, Math.min(bottom, BOARD_HEIGHT));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function initialTab(): Tab {
  const requested = new URLSearchParams(window.location.search).get("tab");
  const aliases: Record<string, Tab> = {
    grid: "Library T-01",
    library: "Library T-01",
    sequence: "Sequence T-02",
    whiteboard: "Whiteboard WB-01",
    mixed: "Mixed MIX-01",
    pdf: "PDF T-04",
    results: "Results",
  };
  return requested && aliases[requested] ? aliases[requested] : "Library T-01";
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function PhotoImage({ record, alt = "" }: { record: PhotoRecord; alt?: string }) {
  return <img src={record.thumbnailUrl ?? record.url} alt={alt || record.name} draggable={false} loading="lazy" decoding="async" />;
}

function PreviewDialog({ preview, onClose }: { preview: PreviewState; onClose(): void }) {
  const [recordId, setRecordId] = useState(preview.recordId);
  const index = Math.max(0, preview.records.findIndex((record) => record.recordId === recordId));
  const record = preview.records[index] as PhotoRecord;
  const step = (delta: number) => {
    const next = (index + delta + preview.records.length) % preview.records.length;
    setRecordId((preview.records[next] as PhotoRecord).recordId);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true" aria-label="照片预览" onMouseDown={onClose}>
      <div className="preview-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <button className="preview-close" onClick={onClose}>关闭 Esc</button>
        <button className="preview-step previous" onClick={() => step(-1)}>‹</button>
        <img src={record.url} alt={record.name} />
        <button className="preview-step next" onClick={() => step(1)}>›</button>
        <div className="preview-caption"><b>{record.name}</b><span>{index + 1} / {preview.records.length}</span></div>
      </div>
    </div>
  );
}

function EmptyPhotos() {
  return (
    <div className="empty-state">
      <b>先加载真实照片目录</b>
      <span>点击页面顶部“选择照片目录”，选择 D:\project\Photoflex\Spike\test 或其中的照片子目录。</span>
    </div>
  );
}

function VirtualGrid({ records, compact = false, selectedIds, onSelect, onPreview }: {
  records: PhotoRecord[];
  compact?: boolean;
  selectedIds: Set<string>;
  onSelect(recordId: string, additive: boolean): void;
  onPreview(recordId: string, records: PhotoRecord[]): void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const columns = compact ? 4 : 7;
  const rowCount = Math.ceil(records.length / columns);
  const virtualizer = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => compact ? 118 : 166, overscan: 4 });

  if (records.length === 0) return <section className="module-panel"><EmptyPhotos /></section>;

  return (
    <section className="module-panel grid-module">
      <div className="module-heading">
        <div><b>{records.length.toLocaleString()} 项真实图片代理网格</b><span>虚拟行，只挂载视口与 overscan；单击选择，双击预览</span></div>
        <output>selected {selectedIds.size} · DOM ≤ {virtualizer.getVirtualItems().length * columns}</output>
      </div>
      <div ref={parentRef} className="grid-scroll" data-testid="photo-grid">
        <div className="virtual-space" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div className="grid-row" key={row.key} style={{ transform: `translateY(${row.start}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: columns }, (_, column) => row.index * columns + column)
                .filter((recordIndex) => recordIndex < records.length)
                .map((recordIndex) => {
                  const record = records[recordIndex] as PhotoRecord;
                  return (
                    <button
                      className={`photo-tile${compact ? " compact" : ""}${selectedIds.has(record.recordId) ? " selected" : ""}`}
                      key={record.recordId}
                      onClick={(event) => onSelect(record.recordId, event.ctrlKey || event.metaKey)}
                      onDoubleClick={() => onPreview(record.recordId, records)}
                      title={record.relativePath ?? record.name}
                    >
                      <PhotoImage record={record} />
                      <span>{record.name}</span>
                      <small>{record.recordId}</small>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SequencePanel({ records, compact = false, onPreview, onEvidence }: {
  records: PhotoRecord[];
  compact?: boolean;
  onPreview(recordId: string, records: PhotoRecord[]): void;
  onEvidence(record: EvidenceRecord): void;
}) {
  const ids = useMemo(() => records.map((record) => record.recordId), [records]);
  const sequenceStorageKey = useMemo(() => {
    const first = records[0]?.relativePath ?? records[0]?.name ?? "empty";
    const last = records.at(-1)?.relativePath ?? records.at(-1)?.name ?? "empty";
    return `photoflex-sequence-v1-${records.length}-${first}-${last}`;
  }, [records]);
  const initialOrder = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(sequenceStorageKey) ?? "null") as unknown;
      if (Array.isArray(saved) && saved.length === ids.length && new Set(saved).size === ids.length && saved.every((id) => ids.includes(id))) {
        return saved as string[];
      }
    } catch {
      localStorage.removeItem(sequenceStorageKey);
    }
    return ids;
  }, [ids, sequenceStorageKey]);
  const engine = useMemo(() => createSequenceEngine(initialOrder), [initialOrder]);
  const recordMap = useMemo(() => new Map(records.map((record) => [record.recordId, record])), [records]);
  const [snapshot, setSnapshot] = useState<SequenceSnapshot>(() => engine.snapshot());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sequencePointerDragRef = useRef<SequencePointerDrag | null>(null);
  const suppressSequenceClickRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<SequenceDragPreview | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  useEffect(() => {
    setSnapshot(engine.snapshot());
    setSelectedIds([]);
    sequencePointerDragRef.current = null;
    suppressSequenceClickRef.current = false;
    setDragPreview(null);
  }, [engine]);

  const persistOrder = (next: SequenceSnapshot) => {
    localStorage.setItem(sequenceStorageKey, JSON.stringify(next.order));
  };

  const select = (id: string, additive: boolean) => {
    setSelectedIds((current) => additive ? current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id] : [id]);
  };

  const beginPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return;
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    let nextSelected = selectedIds;
    let moving = selectedIds.includes(id) ? selectedIds : [id];
    if (additive) {
      nextSelected = selectedIds.includes(id)
        ? selectedIds.filter((entry) => entry !== id)
        : [...selectedIds, id];
      moving = nextSelected.includes(id) ? nextSelected : [];
      setSelectedIds(nextSelected);
    } else if (!selectedIds.includes(id)) {
      nextSelected = [id];
      moving = nextSelected;
      setSelectedIds(nextSelected);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressSequenceClickRef.current = true;
    sequencePointerDragRef.current = {
      pointerId: event.pointerId,
      ids: moving,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      startedAt: performance.now(),
      targetIndex: snapshot.order.indexOf(id),
      framePending: false,
    };
  };

  const sequenceTargetIndexAt = (clientX: number, movingIds: readonly string[]) => {
    const moving = new Set(movingIds);
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-sequence-index]"))
      .filter((card) => !moving.has(card.dataset.sequenceId ?? ""))
      .map((card) => ({ card, rect: card.getBoundingClientRect() }))
      .sort((a, b) => a.rect.left - b.rect.left);
    const target = cards.find(({ rect }) => clientX < rect.left + rect.width / 2);
    if (!target) return snapshot.order.length;
    const index = Number(target.card.dataset.sequenceIndex);
    return Number.isInteger(index) ? index : snapshot.order.length;
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sequencePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    sequencePointerDragRef.current = null;
    setDragPreview(null);
    if (!drag.moved || drag.ids.length === 0) return;
    const targetIndex = sequenceTargetIndexAt(event.clientX, drag.ids);
    const next = engine.move(drag.ids, targetIndex);
    setSnapshot(next);
    persistOrder(next);
    const latencyMs = performance.now() - drag.startedAt;
    setLastLatency(latencyMs);
    onEvidence({ kind: drag.ids.length > 1 ? "T-02-pointer-group-drag" : "T-02-pointer-single-drag", capturedAt: new Date().toISOString(), items: drag.ids.length, latencyMs });
  };

  const updatePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sequencePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
      drag.moved = true;
      event.preventDefault();
      drag.targetIndex = sequenceTargetIndexAt(event.clientX, drag.ids);
      if (!drag.framePending) {
        drag.framePending = true;
        window.requestAnimationFrame(() => {
          drag.framePending = false;
          if (sequencePointerDragRef.current !== drag) return;
          setDragPreview({
            ids: drag.ids,
            dx: event.clientX - drag.startX,
            dy: event.clientY - drag.startY,
            targetIndex: drag.targetIndex,
          });
        });
      }
    }
  };

  const moveWithKeyboard = (event: ReactKeyboardEvent, id: string) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const moving = selectedIds.includes(id) ? selectedIds : [id];
    if (!selectedIds.includes(id)) setSelectedIds([id]);
    const selected = new Set(moving);
    const firstIndex = snapshot.order.findIndex((entry) => selected.has(entry));
    const remainingLength = snapshot.order.length - moving.length;
    const targetIndex = event.key === "ArrowLeft"
      ? Math.max(0, firstIndex - 1)
      : Math.min(remainingLength, firstIndex + 1);
    const started = performance.now();
    const next = engine.move(moving, targetIndex);
    setSnapshot(next);
    persistOrder(next);
    setLastLatency(performance.now() - started);
  };

  const runFormalLatency = () => {
    const runs = Array.from({ length: 5 }, () => {
      const runEngine = createSequenceEngine(ids);
      return Array.from({ length: 100 }, (_, index) => {
        const order = runEngine.snapshot().order;
        const id = order[index % order.length] as string;
        const started = performance.now();
        runEngine.move([id], (index * 29) % order.length);
        return performance.now() - started;
      });
    });
    onEvidence({ kind: "T-02-sequence-5x100", capturedAt: new Date().toISOString(), statistics: aggregateLatencyRuns(runs, 100) });
  };

  if (records.length === 0) return <section className="module-panel"><EmptyPhotos /></section>;

  return (
    <section className={`module-panel sequence-module${compact ? " compact-module" : ""}`}>
      <div className="module-heading">
        <div><b>{snapshot.order.length} 项 Sequence</b><span>真实缩略图 · 单项/多项拖动 · 一次 drop 一个事务 · Undo</span></div>
        <output>revision {snapshot.revision} · selected {selectedIds.length} · {lastLatency === null ? "尚未拖动" : `${lastLatency.toFixed(2)} ms`}</output>
      </div>
      {!compact && (
        <div className="toolbar">
          <button onClick={() => setSelectedIds(snapshot.order.slice(0, 100) as string[])}>选择前 100 项</button>
          <button onClick={() => {
            const started = performance.now();
            const next = engine.move(selectedIds, snapshot.order.length);
            setSnapshot(next);
            persistOrder(next);
            setLastLatency(performance.now() - started);
          }} disabled={selectedIds.length === 0}>移动选中项到末尾</button>
          <button onClick={() => {
            persistOrder(snapshot);
            onEvidence({ kind: "T-02-sequence-save", capturedAt: new Date().toISOString(), items: snapshot.order.length, revision: snapshot.revision });
          }}>保存顺序</button>
          <button onClick={() => { const next = engine.undo(); setSnapshot(next); persistOrder(next); }}>Undo</button>
          <button onClick={runFormalLatency}>运行 5×100 排序采样</button>
        </div>
      )}
      <div className="sequence-strip" data-testid="sequence-strip">
        {snapshot.order.map((id, index) => {
          const record = recordMap.get(id) as PhotoRecord;
          const isDragging = dragPreview?.ids.includes(id) ?? false;
          const isDropTarget = dragPreview?.targetIndex === index;
          return (
            <button
               className={`sequence-card${selectedIds.includes(id) ? " selected" : ""}${isDragging ? " dragging" : ""}${isDropTarget ? " drop-target" : ""}`}
               key={id}
               style={isDragging ? { transform: `translate3d(${dragPreview?.dx ?? 0}px, ${dragPreview?.dy ?? 0}px, 0)`, zIndex: 20 } : undefined}
               draggable={false}
               data-sequence-index={index}
               data-sequence-id={id}
               onPointerDown={(event) => beginPointerDrag(event, id)}
               onPointerMove={updatePointerDrag}
               onPointerUp={finishPointerDrag}
               onPointerCancel={() => { sequencePointerDragRef.current = null; setDragPreview(null); }}
               onClick={(event) => {
                 if (suppressSequenceClickRef.current) {
                   event.preventDefault();
                   return;
                 }
                 select(id, event.ctrlKey || event.metaKey);
               }}
              onKeyDown={(event) => moveWithKeyboard(event, id)}
              onDoubleClick={() => onPreview(id, records)}
              title={`${index + 1}. ${record.name}`}
            >
              <PhotoImage record={record} />
              <span>{String(index + 1).padStart(3, "0")}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function loadWhiteboard(ids: string[], storageKey: string): WhiteboardState {
  const persisted = localStorage.getItem(storageKey);
  if (persisted) {
    try {
      const parsed = JSON.parse(persisted) as WhiteboardState;
      const sourceIds = parsed.sourcePhotoIds ?? Object.keys(parsed.entrySnapshot?.items ?? {});
      const sourceMatches = sourceIds.length === ids.length && ids.every((id) => sourceIds.includes(id));
      const liveItemsBelongToSource = Object.keys(parsed.items ?? {}).every((id) => ids.includes(id));
      if (sourceMatches && liveItemsBelongToSource) return parsed;
    } catch {
      localStorage.removeItem(storageKey);
    }
  }
  return createWhiteboardState(ids);
}

function WhiteboardPanel({ assets, compact = false, onPreview, onEvidence }: {
  assets: PhotoAsset[];
  compact?: boolean;
  onPreview(recordId: string, records: PhotoRecord[]): void;
  onEvidence(record: EvidenceRecord): void;
}) {
  const [count, setCount] = useState(compact ? 500 : 60);
  const records = useMemo(() => expandPhotoAssets(assets, count), [assets, count]);
  const ids = useMemo(() => records.map((record) => record.recordId), [records]);
  const recordMap = useMemo(() => new Map(records.map((record) => [record.recordId, record])), [records]);
  const sourceKey = assets.length === 0 ? "empty" : `${assets.length}-${assets[0]?.name}-${assets.at(-1)?.name}`;
  const storageKey = `photoflex-wb-v2-${sourceKey}-${count}`;
  const [state, setState] = useState<WhiteboardState>(() => createWhiteboardState([]));
  const stateReady = whiteboardStateMatchesIds(state, ids);
  const [interaction, setInteraction] = useState<BoardInteraction | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: compact ? 620 : 1100, height: compact ? 430 : 590 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setState(loadWhiteboard(ids, storageKey));
    setInteraction(null);
    requestAnimationFrame(() => {
      if (!viewportRef.current) return;
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    });
  }, [ids, storageKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const visible = useMemo(() => stateReady ? visibleWhiteboardItems(state, viewportSize.width, viewportSize.height, 1, 500) : [], [state, stateReady, viewportSize]);

  const pointInWorld = (clientX: number, clientY: number) => {
    const rect = worldRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / state.viewport.zoom, y: (clientY - rect.top) / state.viewport.zoom };
  };

  const beginItemDrag = (event: ReactPointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    let nextSelected = state.selectedIds;
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      nextSelected = state.selectedIds.includes(id) ? state.selectedIds.filter((entry) => entry !== id) : [...state.selectedIds, id];
      setState((current) => reduceWhiteboard(current, { type: "select", ids: nextSelected }));
      if (!nextSelected.includes(id)) return;
    } else if (!state.selectedIds.includes(id)) {
      nextSelected = [id];
      setState((current) => reduceWhiteboard(current, { type: "select", ids: nextSelected }));
    }
    setInteraction({ kind: "drag", ids: nextSelected, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, startedAt: performance.now() });
  };

  const beginMarquee = (event: ReactPointerEvent) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointInWorld(event.clientX, event.clientY);
    const retainedIds = event.ctrlKey || event.metaKey || event.shiftKey ? state.selectedIds : [];
    if (retainedIds.length === 0) setState((current) => reduceWhiteboard(current, { type: "select", ids: [] }));
    setInteraction({ kind: "marquee", startX: point.x, startY: point.y, retainedIds, rect: { left: point.x, top: point.y, right: point.x, bottom: point.y } });
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 2 || !viewportRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({ kind: "pan", startX: event.clientX, startY: event.clientY, scrollLeft: viewportRef.current.scrollLeft, scrollTop: viewportRef.current.scrollTop });
  };

  const beginResize = (event: ReactPointerEvent, id: string, corner: BoardResize["corner"]) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const item = state.items[id];
    if (!item) return;
    if (!state.selectedIds.includes(id)) {
      setState((current) => reduceWhiteboard(current, { type: "select", ids: [id] }));
    }
    setInteraction({
      kind: "resize",
      id,
      corner,
      startItem: { x: item.x, y: item.y, width: item.width, height: item.height },
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      startedAt: performance.now(),
    });
  };

  const updateInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interaction) return;
    if (interaction.kind === "drag") {
      setInteraction({ ...interaction, dx: (event.clientX - interaction.startX) / state.viewport.zoom, dy: (event.clientY - interaction.startY) / state.viewport.zoom });
      return;
    }
    if (interaction.kind === "resize") {
      setInteraction({ ...interaction, dx: (event.clientX - interaction.startX) / state.viewport.zoom, dy: (event.clientY - interaction.startY) / state.viewport.zoom });
      return;
    }
    if (interaction.kind === "pan" && viewportRef.current) {
      viewportRef.current.scrollLeft = interaction.scrollLeft - (event.clientX - interaction.startX);
      viewportRef.current.scrollTop = interaction.scrollTop - (event.clientY - interaction.startY);
      return;
    }
    if (interaction.kind === "marquee") {
      const point = pointInWorld(event.clientX, event.clientY);
      const rect = { left: interaction.startX, top: interaction.startY, right: point.x, bottom: point.y };
      const selected = selectItemsInRect(state, rect);
      setState((current) => reduceWhiteboard(current, { type: "select", ids: [...new Set([...interaction.retainedIds, ...selected])] }));
      setInteraction({ ...interaction, rect });
    }
  };

  const finishInteraction = () => {
    if (interaction?.kind === "drag" && Math.abs(interaction.dx) + Math.abs(interaction.dy) > 0.25) {
      setState((current) => reduceWhiteboard(current, { type: "move-items", ids: interaction.ids, dx: interaction.dx, dy: interaction.dy }));
      onEvidence({ kind: interaction.ids.length > 1 ? "WB-group-drag" : "WB-single-drag", capturedAt: new Date().toISOString(), items: interaction.ids.length, latencyMs: performance.now() - interaction.startedAt });
    }
    if (interaction?.kind === "resize" && Math.abs(interaction.dx) + Math.abs(interaction.dy) > 0.25) {
      const geometry = resizeGeometry(interaction);
      setState((current) => reduceWhiteboard(current, { type: "set-item", id: interaction.id, patch: geometry }));
      onEvidence({ kind: "WB-item-resize", capturedAt: new Date().toISOString(), itemId: interaction.id, latencyMs: performance.now() - interaction.startedAt, ...geometry });
    }
    setInteraction(null);
  };

  const setZoom = (zoom: number) => {
    const viewport = viewportRef.current;
    const scrollX = viewport ? viewport.scrollLeft / state.viewport.zoom : state.viewport.scrollX;
    const scrollY = viewport ? viewport.scrollTop / state.viewport.zoom : state.viewport.scrollY;
    setState((current) => reduceWhiteboard(current, { type: "set-viewport", zoom, scrollX, scrollY }));
    requestAnimationFrame(() => {
      if (!viewportRef.current) return;
      viewportRef.current.scrollLeft = scrollX * zoom;
      viewportRef.current.scrollTop = scrollY * zoom;
    });
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(Math.max(0.25, Math.min(2, state.viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1))));
  };

  const save = () => {
    const started = performance.now();
    const result = commitWhiteboard(state);
    setState(result.state);
    localStorage.setItem(storageKey, JSON.stringify(result.state));
    onEvidence({ kind: "WB-save-and-sequence-writeback", capturedAt: new Date().toISOString(), items: result.sequenceOrder.length, latencyMs: performance.now() - started, sequenceHead: result.sequenceOrder.slice(0, 10) });
  };

  const discard = () => {
    const discarded = discardWhiteboard(state);
    setState(discarded);
    requestAnimationFrame(() => {
      if (!viewportRef.current) return;
      viewportRef.current.scrollLeft = discarded.viewport.scrollX * discarded.viewport.zoom;
      viewportRef.current.scrollTop = discarded.viewport.scrollY * discarded.viewport.zoom;
    });
  };

  if (assets.length === 0) return <section className="module-panel"><EmptyPhotos /></section>;
  if (!stateReady) return (
    <section className={`module-panel whiteboard-module${compact ? " compact-module" : ""}`}>
      <div className="empty-state"><b>正在切换白板规模</b><span>正在载入 {count} 项布局，旧布局不会参与渲染。</span></div>
    </section>
  );

  const marquee = interaction?.kind === "marquee" ? {
    left: Math.min(interaction.rect.left, interaction.rect.right),
    top: Math.min(interaction.rect.top, interaction.rect.bottom),
    width: Math.abs(interaction.rect.right - interaction.rect.left),
    height: Math.abs(interaction.rect.bottom - interaction.rect.top),
  } : null;

  return (
    <section className={`module-panel whiteboard-module${compact ? " compact-module" : ""}`}>
      <div className="module-heading">
        <div><b>5,200 × 3,600 自由白板</b><span>总项目与 zoom 解耦 · 真实照片 · 框选/多选/组移动 · pointer-up 提交</span></div>
        <output>{Object.keys(state.items).length} total · {visible.length} DOM · {state.selectedIds.length} selected · hash {stableStateHash(state)}</output>
      </div>
      {!compact && (
        <div className="toolbar">
          {[60, 500, 1000, 1500, 2000, 3000].map((size) => <button className={count === size ? "active" : ""} key={size} onClick={() => setCount(size)}>{size}</button>)}
          <button onClick={() => setState((current) => reduceWhiteboard(current, { type: "select", ids: Object.keys(current.items) }))}>全选</button>
          <button onClick={() => setState((current) => reduceWhiteboard(current, { type: "remove-items", ids: current.selectedIds }))} disabled={state.selectedIds.length === 0}>删除选中</button>
          <button onClick={save}>保存</button>
          <button onClick={discard}>放弃</button>
          <button onClick={() => setState(loadWhiteboard(ids, storageKey))}>重开已保存布局</button>
          <label>Zoom {Math.round(state.viewport.zoom * 100)}% <input type="range" min="25" max="200" value={state.viewport.zoom * 100} onChange={(event) => setZoom(Number(event.target.value) / 100)} /></label>
          <span className={visible.length > 500 ? "gate-fail" : "gate-pass"}>DOM {visible.length > 500 ? "超过 500，记录为失败证据" : "≤500"}</span>
        </div>
      )}
      <div
        className="whiteboard-viewport"
        ref={viewportRef}
        tabIndex={0}
        onPointerDownCapture={beginPan}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={onWheel}
        onScroll={(event) => {
          if (interaction?.kind === "pan") return;
          const target = event.currentTarget;
          setState((current) => reduceWhiteboard(current, { type: "set-viewport-ephemeral", zoom: current.viewport.zoom, scrollX: target.scrollLeft / current.viewport.zoom, scrollY: target.scrollTop / current.viewport.zoom }));
        }}
        onKeyDown={(event) => {
          const distance = event.shiftKey ? 10 : 1;
          const delta = event.key === "ArrowLeft" ? [-distance, 0] : event.key === "ArrowRight" ? [distance, 0] : event.key === "ArrowUp" ? [0, -distance] : event.key === "ArrowDown" ? [0, distance] : null;
          if (delta) {
            event.preventDefault();
            setState((current) => reduceWhiteboard(current, { type: "move-selection", dx: delta[0] as number, dy: delta[1] as number }));
          }
          if (event.key === "Delete") setState((current) => reduceWhiteboard(current, { type: "remove-items", ids: current.selectedIds }));
          if (event.key === "Escape") setInteraction(null);
        }}
      >
        <div className="whiteboard-surface" style={{ width: BOARD_WIDTH * state.viewport.zoom, height: BOARD_HEIGHT * state.viewport.zoom }}>
          <div className="whiteboard-world" ref={worldRef} style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `scale(${state.viewport.zoom})` }} onPointerDown={beginMarquee}>
            {visible.map((item) => {
              const record = recordMap.get(item.photoId) as PhotoRecord;
              const dragPreview = interaction?.kind === "drag" && interaction.ids.includes(item.photoId) ? interaction : null;
              const resizePreview = interaction?.kind === "resize" && interaction.id === item.photoId ? resizeGeometry(interaction) : null;
              return (
                <button
                  className={`board-item${state.selectedIds.includes(item.photoId) ? " selected" : ""}`}
                  key={item.photoId}
                  onPointerDown={(event) => beginItemDrag(event, item.photoId)}
                  onDoubleClick={() => onPreview(item.photoId, records)}
                  style={{ left: resizePreview?.x ?? item.x + (dragPreview?.dx ?? 0), top: resizePreview?.y ?? item.y + (dragPreview?.dy ?? 0), width: resizePreview?.width ?? item.width, height: resizePreview?.height ?? item.height, zIndex: item.zIndex }}
                  title={record.name}
                >
                  <PhotoImage record={record} />
                  <span>{record.name}</span>
                  {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                    <i
                      aria-label={`${corner} 缩放手柄`}
                      className={`resize-handle ${corner}`}
                      key={corner}
                      onPointerDown={(event) => beginResize(event, item.photoId, corner)}
                    />
                  ))}
                </button>
              );
            })}
            {marquee && <div className="selection-marquee" style={marquee} />}
            <div className="canvas-label">logical canvas 5200 × 3600</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PdfPanel({ records, onEvidence }: { records: PhotoRecord[]; onEvidence(record: EvidenceRecord): void }) {
  const [job, setJob] = useState<{ state: string; completed: number; total: number; jobId: string; elapsedMs: number; mode: "renderer" | "native" }>({ state: "idle", completed: 0, total: 200, jobId: "", elapsedMs: 0, mode: "renderer" });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  const prepareDownload = () => {
    const labels = records.slice(0, 200).map((record) => `${record.recordId} ${record.name}`);
    const bytes = createBenchmarkPdf(labels);
    const pdfBuffer = Uint8Array.from(bytes).buffer;
    const url = URL.createObjectURL(new Blob([pdfBuffer], { type: "application/pdf" }));
    setDownloadUrl(url);
    return bytes.byteLength;
  };

  const resetDownload = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setSavedPath(null);
  };

  const saveNativePdf = async () => {
    if (job.mode !== "native" || job.state !== "succeeded") return;
    const path = await nativePdfSave(job.jobId);
    if (path) setSavedPath(path);
  };

  const startRenderer = async () => {
    if (records.length === 0) return;
    cancelled.current = false;
    resetDownload();
    const jobId = crypto.randomUUID();
    const started = performance.now();
    setJob({ state: "queued", completed: 0, total: 200, jobId, elapsedMs: 0, mode: "renderer" });
    await nextAnimationFrame();
    setJob({ state: "running", completed: 0, total: 200, jobId, elapsedMs: 0, mode: "renderer" });
    for (let completed = 1; completed <= 200; completed += 1) {
      if (cancelled.current) return;
      if (completed % 5 === 0) setJob({ state: "running", completed, total: 200, jobId, elapsedMs: performance.now() - started, mode: "renderer" });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const bytes = prepareDownload();
    const elapsedMs = performance.now() - started;
    setJob({ state: "succeeded", completed: 200, total: 200, jobId, elapsedMs, mode: "renderer" });
    onEvidence({ kind: "T-04-renderer-pdf-200-pages", capturedAt: new Date().toISOString(), jobId, elapsedMs, bytes, verdictScope: "valid text-label PDF renderer control; image embedding is not measured" });
  };

  const followNativeJob = async (jobId: string, started: number) => {
    for (;;) {
      const status = await nativePdfStatus(jobId);
      const elapsedMs = performance.now() - started;
      setJob({ state: status.state, completed: status.completed, total: status.total, jobId, elapsedMs, mode: "native" });
      if (["succeeded", "failed"].includes(status.state) || (status.state === "cancelled" && status.workerStopped !== false)) {
        const bytes = 0;
        onEvidence({ kind: "T-04-native-background-pdf", capturedAt: new Date().toISOString(), jobId, elapsedMs, state: status.state, completed: status.completed, workerStopped: status.workerStopped, previewBytes: bytes, errors: status.errors });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };

  const startNative = async (retryJobId?: string) => {
    if (records.length === 0) return;
    resetDownload();
    const started = performance.now();
    const pageIds = records.slice(0, 200).map((record) => record.recordId);
    const result = retryJobId ? await nativePdfRetry(retryJobId) : await nativePdfStart(pageIds);
    setJob({ state: "queued", completed: 0, total: 200, jobId: result.jobId, elapsedMs: 0, mode: "native" });
    await followNativeJob(result.jobId, started);
  };

  const cancel = async () => {
    const started = performance.now();
    if (job.mode === "native") {
      const acknowledgement = await nativePdfCancel(job.jobId);
      setJob((current) => ({ ...current, state: acknowledgement.state, completed: acknowledgement.completed }));
    } else {
      cancelled.current = true;
      setJob((current) => ({ ...current, state: "cancelled" }));
    }
    onEvidence({ kind: `T-04-${job.mode}-pdf-cancel`, capturedAt: new Date().toISOString(), acknowledgementMs: performance.now() - started });
  };

  if (records.length === 0) return <section className="module-panel"><EmptyPhotos /></section>;

  return (
    <section className="module-panel pdf-panel">
      <div className="module-heading">
        <div><b>200 页 PDF job</b><span>桌面壳使用后台 worker/thread；renderer 版本保留为可下载的控制组</span></div>
        <output>{job.mode} · {job.state} · {job.completed}/{job.total} · {job.elapsedMs.toFixed(0)} ms</output>
      </div>
      <div className="toolbar">
        {hasNativeExportQueue() && <button onClick={() => void startNative()} disabled={job.state === "running" || job.state === "queued"}>宿主后台生成 200 页</button>}
        <button onClick={() => void startRenderer()} disabled={job.state === "running" || job.state === "queued"}>Renderer 对照 PDF</button>
        <button onClick={() => void cancel()} disabled={job.state !== "running" && job.state !== "queued"}>取消</button>
        <button onClick={() => void (job.mode === "native" && job.state === "cancelled" ? startNative(job.jobId) : job.mode === "native" ? startNative() : startRenderer())} disabled={job.state !== "cancelled" && job.state !== "succeeded" && job.state !== "failed"}>重试</button>
        {downloadUrl && <a className="button-link" href={downloadUrl} download={`photoflex-benchmark-${job.jobId}.pdf`} target="_blank" rel="noreferrer">打开/保存 PDF</a>}
        {hasNativeFileSave() && job.mode === "native" && job.state === "succeeded" && <button onClick={() => void saveNativePdf()}>保存 Native PDF</button>}
        {savedPath && <small className="saved-path">已保存：{savedPath}</small>}
      </div>
      <div className="job-body">
        <progress max={job.total} value={job.completed} />
        <dl><dt>Job ID</dt><dd>{job.jobId || "尚未创建"}</dd><dt>状态</dt><dd>{job.state}</dd><dt>说明</dt><dd>宿主模式测后台生命周期、停止和临时文件；下载链接是同页数的 renderer 预览副本，不计入宿主耗时。正式照片嵌入吞吐仍需单独记录。</dd></dl>
      </div>
    </section>
  );
}

function MixedPanel({ assets, gridRecords, sequenceRecords, selectedIds, onSelect, onPreview, onEvidence }: {
  assets: PhotoAsset[];
  gridRecords: PhotoRecord[];
  sequenceRecords: PhotoRecord[];
  selectedIds: Set<string>;
  onSelect(recordId: string, additive: boolean): void;
  onPreview(recordId: string, records: PhotoRecord[]): void;
  onEvidence(record: EvidenceRecord): void;
}) {
  return (
    <div className="mixed-stack">
      <div className="mixed-layout">
        <VirtualGrid records={gridRecords} compact selectedIds={selectedIds} onSelect={onSelect} onPreview={onPreview} />
        <WhiteboardPanel assets={assets} compact onPreview={onPreview} onEvidence={onEvidence} />
      </div>
      <SequencePanel records={sequenceRecords} compact onPreview={onPreview} onEvidence={onEvidence} />
    </div>
  );
}

function ResultsPanel({ results, onClear }: { results: EvidenceRecord[]; onClear(): void }) {
  const downloadResults = async () => {
    const content = JSON.stringify(results, null, 2);
    if (hasNativeFileSave()) {
      const saved = await nativeJsonSave(content, `photoflex-evidence-${Date.now()}.json`);
      if (saved) return;
    }
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `photoflex-evidence-${Date.now()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <section className="module-panel results-panel">
      <div className="module-heading">
        <div><b>本次会话证据</b><span>所有自动采样和交互延迟集中在这里，可导出原始 JSON</span></div>
        <div className="inline-actions"><button onClick={downloadResults} disabled={results.length === 0}>导出 JSON</button><button onClick={onClear}>清空</button></div>
      </div>
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </section>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [diagnostics, setDiagnostics] = useState("detecting…");
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [results, setResults] = useState<EvidenceRecord[]>([]);
  const [activeProbe, setActiveProbe] = useState<{ label: string; startedAt: number } | null>(null);
  const [sourceStatus, setSourceStatus] = useState("请选择真实照片目录");
  const [sourceBusy, setSourceBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetUrls = useRef<string[]>([]);
  const probeController = useRef<AbortController | null>(null);

  useEffect(() => {
    fileInputRef.current?.setAttribute("webkitdirectory", "");
    fileInputRef.current?.setAttribute("directory", "");
    void hostDiagnostics().then((value) => setDiagnostics(`${value.framework} · ${value.environmentId}`));
    return () => assetUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const gridRecords = useMemo(() => expandPhotoAssets(assets, GRID_COUNT), [assets]);
  const sequenceRecords = useMemo(() => expandPhotoAssets(assets, SEQUENCE_COUNT), [assets]);
  const addEvidence = (record: EvidenceRecord) => setResults((current) => [...current, record]);

  const loadFiles = (event: ChangeEvent<HTMLInputElement>) => {
    assetUrls.current.forEach((url) => URL.revokeObjectURL(url));
    assetUrls.current = [];
    const files = Array.from(event.target.files ?? []).filter(isSupportedPhoto).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
    const next = files.map((file, index) => {
      const url = URL.createObjectURL(file);
      assetUrls.current.push(url);
      return { sourceId: `source-${String(index).padStart(5, "0")}`, name: file.name, relativePath: file.webkitRelativePath || file.name, url, thumbnailUrl: url, bytes: file.size };
    });
    setAssets(next);
    setSelectedIds(new Set());
    setPreview(null);
    const rootName = next[0]?.relativePath?.split(/[\\/]/)[0] ?? "浏览器所选目录";
    setSourceStatus(`${rootName} · 浏览器临时授权`);
    addEvidence({ kind: "source-directory-loaded", capturedAt: new Date().toISOString(), filesOffered: event.target.files?.length ?? 0, supportedPhotos: next.length, bytes: next.reduce((sum, item) => sum + item.bytes, 0) });
  };

  const useNativeSource = async (restore = false) => {
    setSourceBusy(true);
    setSourceStatus(restore ? "正在恢复并重新扫描目录…" : "正在读取并建立照片代理索引…");
    try {
      const savedSourceId = restore ? localStorage.getItem("photoflex:last-source-id") ?? undefined : undefined;
      const { grant, entries } = await loadNativeSource(savedSourceId);
      const next = entries.map((entry) => ({
        sourceId: entry.photoId,
        name: entry.relativePath.split(/[\\/]/).pop() ?? entry.relativePath,
        relativePath: entry.relativePath,
        url: entry.proxyUrl,
        thumbnailUrl: `${entry.proxyUrl}?kind=thumbnail`,
        bytes: entry.bytes ?? 0,
      }));
      localStorage.setItem("photoflex:last-source-id", grant.sourceId);
      setAssets(next);
      setSelectedIds(new Set());
      setPreview(null);
      setSourceStatus(`${grant.displayName} · ${grant.restored ? "授权已恢复" : "目录已授权"}`);
      addEvidence({ kind: restore ? "native-source-restored" : "native-source-directory-loaded", capturedAt: new Date().toISOString(), sourceId: grant.sourceId, supportedPhotos: next.length, bytes: next.reduce((sum, item) => sum + item.bytes, 0) });
    } catch (error) {
      setSourceStatus(`加载失败：${error instanceof Error ? error.message : String(error)}`);
      addEvidence({ kind: "native-source-load-failed", capturedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
    } finally {
      setSourceBusy(false);
    }
  };

  useEffect(() => {
    void loadNativeBootstrapSource().then((result) => {
      if (!result) return;
      const next = result.entries.map((entry) => ({
        sourceId: entry.photoId,
        name: entry.relativePath.split(/[\\/]/).pop() ?? entry.relativePath,
        relativePath: entry.relativePath,
        url: entry.proxyUrl,
        thumbnailUrl: `${entry.proxyUrl}?kind=thumbnail`,
        bytes: entry.bytes ?? 0,
      }));
      localStorage.setItem("photoflex:last-source-id", result.grant.sourceId);
      setAssets(next);
      setSourceStatus(`${result.grant.displayName} · 已从 PHOTOFLEX_TEST_SOURCE 加载`);
      addEvidence({ kind: "native-source-test-bootstrap", capturedAt: new Date().toISOString(), sourceId: result.grant.sourceId, supportedPhotos: next.length, bytes: next.reduce((sum, item) => sum + item.bytes, 0) });
    }).catch((error) => {
      setSourceStatus(`自动加载失败：${error instanceof Error ? error.message : String(error)}`);
      addEvidence({ kind: "native-source-test-bootstrap-failed", capturedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
    });
  }, []);

  const choosePhotoDirectory = () => {
    if (hasNativeSourceLibrary()) void useNativeSource(false);
    else fileInputRef.current?.click();
  };

  const selectGridRecord = (recordId: string, additive: boolean) => {
    setSelectedIds((current) => {
      if (!additive) return new Set([recordId]);
      const next = new Set(current);
      if (next.has(recordId)) next.delete(recordId); else next.add(recordId);
      return next;
    });
  };

  const runTimedProbe = async (label: string, durationMs: number) => {
    if (activeProbe) return;
    const controller = new AbortController();
    probeController.current = controller;
    const startedAt = performance.now();
    setActiveProbe({ label, startedAt });
    const memorySamples: unknown[] = [];
    const sampleMemory = async () => {
      const host = await hostDiagnostics();
      const browserPerformance = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
      memorySamples.push({ elapsedMs: performance.now() - startedAt, processTreeRssBytes: host.processTreeRssBytes, rendererHeap: browserPerformance.memory ? { ...browserPerformance.memory } : null });
    };
    await sampleMemory();
    const interval = window.setInterval(() => { void sampleMemory(); }, 1000);
    const frameResult = await probeFrames(durationMs, controller.signal);
    window.clearInterval(interval);
    await sampleMemory();
    addEvidence({ kind: label, capturedAt: new Date().toISOString(), requestedDurationMs: durationMs, cancelled: controller.signal.aborted, frameResult, memorySamples });
    setActiveProbe(null);
    probeController.current = null;
  };

  return (
    <main>
      <header className="app-header">
        <div><p className="eyebrow">PHOTOFLEX / TECH REVERSAL</p><h1>可操作技术反转测试台</h1></div>
        <div className="header-actions">
          <span className="environment-pill">{diagnostics}</span>
          <button onClick={choosePhotoDirectory} disabled={sourceBusy}>{sourceBusy ? "正在读取…" : "选择照片目录"}</button>
          {hasNativeSourceLibrary() && localStorage.getItem("photoflex:last-source-id") && <button onClick={() => void useNativeSource(true)} disabled={sourceBusy}>恢复上次目录</button>}
        </div>
        <input ref={fileInputRef} className="hidden-input" type="file" accept="image/*,.heic,.heif,.tif,.tiff" multiple onChange={loadFiles} />
      </header>

      <section className="source-status">
        <div><b>真实照片源</b><span>{assets.length > 0 ? `${assets.length} 张 · ${(assets.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024 / 1024).toFixed(2)} GB` : "尚未加载"}</span></div>
        <div><b>目录状态</b><span>{sourceStatus}</span></div>
        <div><b>测试记录</b><span>{assets.length > 0 ? "Grid 10,000 · Sequence 500 · Whiteboard 60–3,000" : "加载目录后生成"}</span></div>
      </section>

      <div className="probe-bar">
        <span>{activeProbe ? `正在采样 ${activeProbe.label}… 请在当前页面执行规定手势` : "采样器：切换到目标页面后启动，并在计时期间人工操作"}</span>
        <button onClick={() => void runTimedProbe(`${tab}-60-second-manual-run`, 60_000)} disabled={Boolean(activeProbe)}>60 秒视觉采样</button>
        <button onClick={() => void runTimedProbe("MIX-01-5-minute-manual-run", 5 * 60_000)} disabled={Boolean(activeProbe)}>5 分钟 MIX</button>
        <button onClick={() => void runTimedProbe("SOAK-50-minute-manual-run", 50 * 60_000)} disabled={Boolean(activeProbe)}>50 分钟 SOAK</button>
        <button onClick={() => probeController.current?.abort()} disabled={!activeProbe}>停止采样</button>
      </div>

      <nav>{TABS.map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}</nav>
      <div className="scope-note"><b>可观察状态：</b>真实源照片数、测试项数、DOM 数、selection、revision、state hash、帧时间、renderer heap 和宿主 RSS。测试结果允许失败，但不能再因为缺少入口而无法执行。</div>

      {tab === "Library T-01" && <VirtualGrid records={gridRecords} selectedIds={selectedIds} onSelect={selectGridRecord} onPreview={(recordId, records) => setPreview({ recordId, records })} />}
      {tab === "Sequence T-02" && <SequencePanel records={sequenceRecords} onPreview={(recordId, records) => setPreview({ recordId, records })} onEvidence={addEvidence} />}
      {tab === "Whiteboard WB-01" && <WhiteboardPanel assets={assets} onPreview={(recordId, records) => setPreview({ recordId, records })} onEvidence={addEvidence} />}
      {tab === "Mixed MIX-01" && <MixedPanel assets={assets} gridRecords={gridRecords} sequenceRecords={sequenceRecords} selectedIds={selectedIds} onSelect={selectGridRecord} onPreview={(recordId, records) => setPreview({ recordId, records })} onEvidence={addEvidence} />}
      {tab === "PDF T-04" && <PdfPanel records={sequenceRecords} onEvidence={addEvidence} />}
      {tab === "Results" && <ResultsPanel results={results} onClear={() => setResults([])} />}
      {preview && <PreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </main>
  );
}
