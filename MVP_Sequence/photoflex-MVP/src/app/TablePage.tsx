import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  PhotoId,
  ProjectId,
  SequenceDraft,
  SequenceItem,
  SequenceItemId,
  SourceError,
  WorktableAlignment,
  WorktableDraft,
  WorktableEditCommand,
  WorktableEditor,
  WorktableViewport,
} from "../contracts";
import {
  clampWorktableZoom,
  createWorktableEditor,
  visibleWorktablePhotoIds,
  zoomAroundScreenPoint,
} from "../modules/worktable";
import { createSequenceEditor } from "../modules/sequence";
import { CompareOverlay } from "./CompareOverlay";
import type { AppDependencies } from "./dependencies";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { SequenceStrip } from "./SequenceStrip";
import { TablePreviewOverlay } from "./TablePreviewOverlay";
import { useProjectWorkspace, workspaceSaveErrorMessage } from "./useProjectWorkspace";
import { useWorktableGestures } from "./useWorktableGestures";

const DEFAULT_VIEWPORT: WorktableViewport = { originX: 48, originY: 38, zoom: 1 };

export function TablePage({
  dependencies,
  projectId,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const { workspace, save, loading, error } = useProjectWorkspace(dependencies, projectId);
  const [draft, setDraft] = useState<WorktableDraft>();
  const [sequenceDraft, setSequenceDraft] = useState<SequenceDraft>();
  const [selected, setSelected] = useState<Set<PhotoId>>(new Set());
  const [viewport, setViewportState] = useState<WorktableViewport>(DEFAULT_VIEWPORT);
  const [missing, setMissing] = useState<Set<PhotoId>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [previewPhotoId, setPreviewPhotoId] = useState<PhotoId>();
  const [comparePhotoIds, setComparePhotoIds] = useState<readonly [PhotoId, PhotoId]>();
  const [sequenceConfirmation, setSequenceConfirmation] = useState<readonly PhotoId[]>();
  const [alignment, setAlignment] = useState<WorktableAlignment | "">("");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<WorktableEditor | undefined>(undefined);
  const initializedProjectRef = useRef<ProjectId | undefined>(undefined);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const setViewport = useCallback((next: WorktableViewport) => {
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !draft) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize((current) => current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [draft?.projectId]);

  useEffect(() => {
    if (!workspace || initializedProjectRef.current === projectId) return;
    initializedProjectRef.current = projectId;
    const editor = createWorktableEditor(workspace.worktableDraft);
    editorRef.current = editor;
    setDraft(editor.snapshot());
    setSequenceDraft(workspace.sequenceDraft);
    const restored = workspace.resumeContext?.page === "table"
      ? workspace.resumeContext.tableViewport
      : undefined;
    setViewport(restored ?? DEFAULT_VIEWPORT);
    void save((current) => ({
      ...current,
      lastOpenedAt: new Date().toISOString(),
      resumeContext: {
        page: "table",
        filter: "all",
        tableViewport: restored ?? DEFAULT_VIEWPORT,
      },
    }));
  }, [projectId, save, setViewport, workspace]);

  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => {
      void save((current) => ({
        ...current,
        resumeContext: { page: "table", filter: "all", tableViewport: viewportRef.current },
      }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft?.projectId, save, viewport]);

  const persistDraft = useCallback(async (next: WorktableDraft) => {
    const result = await save((current) => ({
      ...current,
      worktableDraft: next,
      updatedAt: new Date().toISOString(),
    }));
    setNotice(result.ok ? undefined : workspaceSaveErrorMessage(result.error));
  }, [save]);

  const execute = useCallback((command: WorktableEditCommand) => {
    const result = editorRef.current?.execute(command);
    if (!result) return;
    if (!result.ok) {
      setNotice("该桌面操作无法完成，照片状态可能已经变化。");
      return;
    }
    setDraft(result.value);
    void persistDraft(result.value);
  }, [persistDraft]);

  const history = useCallback((direction: "undo" | "redo") => {
    const editor = editorRef.current;
    if (!editor) return;
    if (direction === "undo" && !editor.canUndo()) return;
    if (direction === "redo" && !editor.canRedo()) return;
    const next = direction === "undo" ? editor.undo() : editor.redo();
    setDraft(next);
    setSelected((current) => new Set([...current].filter((photoId) => next.placements[photoId])));
    void persistDraft(next);
  }, [persistDraft]);

  const commitToSequence = useCallback(async (photoIds: readonly PhotoId[]) => {
    if (!photoIds.length) return;
    const requestedPhotoIds = [...new Set(photoIds)];
    const candidates: SequenceItem[] = requestedPhotoIds
      .map((photoId) => ({ id: sequenceItemId() as SequenceItemId, photoId }));
    const saved = await save((current) => {
      const existingPhotoIds = new Set(current.sequenceDraft.items.map((item) => item.photoId));
      const additions = candidates.filter((item) => !existingPhotoIds.has(item.photoId));
      if (!additions.length) return current;
      const editor = createSequenceEditor(current.sequenceDraft);
      const edited = editor.execute({ type: "add", items: additions });
      return edited.ok
        ? { ...current, sequenceDraft: edited.value, updatedAt: new Date().toISOString() }
        : current;
    });
    if (!saved.ok) {
      setNotice(workspaceSaveErrorMessage(saved.error));
      return;
    }
    const nextDraft = saved.value.sequenceDraft;
    const nextPhotoIds = new Set(nextDraft.items.map((item) => item.photoId));
    if (!requestedPhotoIds.every((photoId) => nextPhotoIds.has(photoId))) {
      setNotice("无法加入 Sequence，请检查数量限制后重试。");
      return;
    }
    const added = new Set(nextDraft.items.map((item) => item.id));
    setSequenceDraft(nextDraft);
    setSequenceConfirmation(undefined);
    setNotice(candidates.some((item) => added.has(item.id)) ? "照片已加入 Sequence。" : "所选照片已经在 Sequence 中。");
  }, [save]);

  const requestSequence = (photoIds: readonly PhotoId[]) => {
    const ordered = draft?.entryOrder.filter((photoId) => photoIds.includes(photoId)) ?? [];
    if (ordered.length === 1) {
      void commitToSequence(ordered);
      return;
    }
    if (ordered.length > 1) setSequenceConfirmation(ordered);
  };

  const reorderSequence = async (itemId: SequenceItemId, to: number) => {
    const saved = await save((current) => {
      const editor = createSequenceEditor(current.sequenceDraft);
      const edited = editor.execute({ type: "move", itemIds: [itemId], to });
      if (!edited.ok || edited.value.items.every((item, index) => item.id === current.sequenceDraft.items[index]?.id)) {
        return current;
      }
      return { ...current, sequenceDraft: edited.value, updatedAt: new Date().toISOString() };
    });
    if (saved.ok) setSequenceDraft(saved.value.sequenceDraft);
    else setNotice(workspaceSaveErrorMessage(saved.error));
  };

  const selectedIds = useMemo(
    () => draft?.entryOrder.filter((photoId) => selected.has(photoId)) ?? [],
    [draft, selected],
  );
  const visiblePhotoIds = useMemo(
    () => draft
      ? visibleWorktablePhotoIds(draft, viewport, stageSize)
      : new Set<PhotoId>(),
    [draft, stageSize, viewport],
  );
  const sequenceIndexByPhotoId = useMemo(() => new Map(
    (sequenceDraft?.items ?? workspace?.sequenceDraft.items ?? []).map((item, index) => [item.photoId, index] as const),
  ), [sequenceDraft?.items, workspace?.sequenceDraft.items]);

  const onPhotoError = useCallback((photoId: PhotoId, photoError: SourceError) => {
    if (photoError.kind === "photo-not-found" || photoError.kind === "preview-unavailable") {
      setMissing((current) => current.has(photoId) ? current : new Set([...current, photoId]));
    }
  }, []);

  const {
    gestureRef,
    dragDelta,
    resizeScale,
    marquee,
    onCardPointerDown,
    onResizePointerDown,
    onStagePointerDown,
    onStagePointerMove,
    finishPointer,
  } = useWorktableGestures({
    draft,
    selected,
    setSelected,
    execute,
    stageRef,
    viewportRef,
    setViewportState,
  });

  const zoomAtCenter = (nextZoom: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    setViewport(zoomAroundScreenPoint(
      viewportRef.current,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      rect,
      nextZoom,
    ));
  };

  const fitTable = () => {
    const stage = stageRef.current;
    if (!stage || !draft?.entryOrder.length) {
      setViewport(DEFAULT_VIEWPORT);
      return;
    }
    const cards = draft.entryOrder.map((photoId) => draft.placements[photoId]);
    const minX = Math.min(...cards.map((item) => item.x));
    const minY = Math.min(...cards.map((item) => item.y));
    const maxX = Math.max(...cards.map((item) => item.x + item.width));
    const maxY = Math.max(...cards.map((item) => item.y + item.height));
    const padding = 64;
    const zoom = clampWorktableZoom(Math.min(
      (stage.clientWidth - padding * 2) / Math.max(1, maxX - minX),
      (stage.clientHeight - padding * 2) / Math.max(1, maxY - minY),
    ));
    setViewport({
      zoom,
      originX: (stage.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom,
      originY: (stage.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom,
    });
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
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
    // Native non-passive handling owns both zoom and pan, so browser zoom can
    // be cancelled without a second React wheel path.
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [draft?.projectId, setViewport]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelected(new Set(draft?.entryOrder ?? []));
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      history(event.shiftKey ? "redo" : "undo");
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      history("redo");
    }
    if (event.key === "Escape") setSelected(new Set());
    if (event.key.toLowerCase() === "g" && selectedIds.length > 1) execute({ type: "create-group", photoIds: selectedIds });
    if (event.key.toLowerCase() === "l" && selectedIds.length >= 2 && selectedIds.length <= 6) execute({ type: "create-link", photoIds: selectedIds });
    if (event.key.toLowerCase() === "j" && selectedIds.length === 2) setComparePhotoIds([selectedIds[0], selectedIds[1]]);
    if (event.key.toLowerCase() === "s" && selectedIds.length) requestSequence(selectedIds);
    if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length) {
      event.preventDefault();
      execute({ type: "remove", photoIds: selectedIds });
      setSelected(new Set());
    }
  };

  if (loading || !draft) return <main className="page centered-state"><div className="loading-mark" /><p>Loading table…</p></main>;
  if (!workspace) return <main className="page centered-state"><h1>{error ?? "Table 无法读取。"}</h1></main>;

  const arrange = (command: WorktableEditCommand) => selectedIds.length > 1 && execute(command);
  const firstSource = workspace.sources.find((source) => !source.removedAt);
  const selectedGroup = draft.groups.find((group) => group.photoIds.length === selectedIds.length && group.photoIds.every((photoId) => selected.has(photoId)));
  const singleSelectedGroup = selectedIds.length === 1 ? draft.groups.find((group) => group.photoIds.includes(selectedIds[0])) : undefined;
  const canCreateGroup = selectedIds.length > 1 && selectedIds.every((photoId) => !draft.groups.some((group) => group.photoIds.includes(photoId)));
  const canJoinGroup = selectedIds.length === 1 && !singleSelectedGroup && draft.groups.length > 0;
  const activeSequence = sequenceDraft ?? workspace.sequenceDraft;

  return (
    <main className="table-page page">
      <div className="table-toolbar" aria-label="Table 工具栏">
        <strong>TABLE</strong>
        <span className="table-toolbar-divider" />
        <span className="table-project-name" title={workspace.name}>{workspace.name}</span>
        <span className="table-toolbar-divider" />
        <button disabled={!editorRef.current?.canUndo()} onClick={() => history("undo")}>Undo</button>
        <button disabled={!editorRef.current?.canRedo()} onClick={() => history("redo")}>Redo</button>
        <button disabled={!selectedIds.length} onClick={() => requestSequence(selectedIds)}>Sequence</button>
        <button disabled={!selectedGroup && !canCreateGroup} onClick={() => selectedGroup ? execute({ type: "remove-group", groupId: selectedGroup.id }) : execute({ type: "create-group", photoIds: selectedIds })}>{selectedGroup ? "Ungroup" : "Group"}</button>
        <button aria-label="Remove selected photo" title="Leave Group" disabled={!singleSelectedGroup} onClick={() => singleSelectedGroup && execute({ type: "remove-from-group", photoId: selectedIds[0] })}>Leave</button>
        <label className="table-align-control">
          <span className="sr-only">Add selected photo to group</span>
          <select value="" disabled={!canJoinGroup} onChange={(event) => {
            if (event.target.value && selectedIds[0]) execute({ type: "add-to-group", groupId: event.target.value, photoId: selectedIds[0] });
          }}>
            <option value="" disabled>Add to Group</option>
            {draft.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <button disabled={selectedIds.length < 2 || selectedIds.length > 6} onClick={() => execute({ type: "create-link", photoIds: selectedIds })}>Link</button>
        <button disabled={selectedIds.length !== 2} onClick={() => setComparePhotoIds([selectedIds[0], selectedIds[1]])}>Compare</button>
        <button disabled={selectedIds.length !== 1} onClick={() => selectedIds[0] && setPreviewPhotoId(selectedIds[0])}>Preview</button>
        <button disabled={selectedIds.length < 2} onClick={() => arrange({ type: "arrange", photoIds: selectedIds, layout: { type: "grid" } })}>Grid</button>
        <button disabled={selectedIds.length < 2} onClick={() => arrange({ type: "arrange", photoIds: selectedIds, layout: { type: "row" } })}>Row</button>
        <label className="table-align-control">
          <span className="sr-only">Align selection</span>
          <select value={alignment} disabled={selectedIds.length < 2} onChange={(event) => {
            const edge = event.target.value as WorktableAlignment;
            arrange({ type: "arrange", photoIds: selectedIds, layout: { type: "align", edge } });
            setAlignment("");
          }}>
            <option value="" disabled>Align</option>
            <option value="left">Align left</option>
            <option value="center-x">Align center</option>
            <option value="right">Align right</option>
            <option value="top">Align top</option>
            <option value="center-y">Align middle</option>
            <option value="bottom">Align bottom</option>
          </select>
        </label>
        <button disabled={!selectedIds.length} onClick={() => execute({ type: "bring-to-front", photoIds: selectedIds })}>Front</button>
        <button disabled={!selectedIds.length} onClick={() => { execute({ type: "remove", photoIds: selectedIds }); setSelected(new Set()); }}>Remove</button>
        <span className="table-toolbar-spacer" />
        <span>{selectedIds.length ? `${selectedIds.length} selected` : `${draft.entryOrder.length} photos`}</span>
        <button onClick={fitTable}>Fit</button>
        <button onClick={() => zoomAtCenter(viewport.zoom - .25)} disabled={viewport.zoom <= .25} aria-label="缩小桌面">−</button>
        <span className="table-zoom-label">{Math.round(viewport.zoom * 100)}%</span>
        <button onClick={() => zoomAtCenter(viewport.zoom + .25)} disabled={viewport.zoom >= 3} aria-label="放大桌面">＋</button>
      </div>
      {notice && <p className="table-notice" role="status">{notice}</p>}
      <div
        ref={stageRef}
        className="worktable-stage"
        tabIndex={0}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={(event) => finishPointer(event)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        aria-label="Photo worktable"
      >
        <div
          className="worktable-world"
          style={{ transform: `translate3d(${viewport.originX}px, ${viewport.originY}px, 0) scale(${viewport.zoom})` }}
        >
          <svg className="worktable-links" aria-hidden="true">
            {draft.links.flatMap((link) => link.photoIds.slice(1).map((photoId, index) => {
              const from = draft.placements[link.photoIds[index]];
              const to = draft.placements[photoId];
              return <line key={`${link.id}-${photoId}`} x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} />;
            }))}
          </svg>
          {draft.groups.map((group) => {
            const bounds = groupBounds(draft, group.photoIds);
            return <div key={group.id} className="worktable-group-frame" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}><span>{group.name} · {group.photoIds.length}</span></div>;
          })}
          {draft.entryOrder.map((photoId) => {
            const item = draft.placements[photoId];
            const isSelected = selected.has(photoId);
            const preview = isSelected && gestureRef.current?.kind === "drag" ? dragDelta : { x: 0, y: 0 };
            const visualScale = gestureRef.current?.kind === "resize" && gestureRef.current.photoId === photoId ? resizeScale : 1;
            const sequenceIndex = sequenceIndexByPhotoId.get(photoId);
            return (
              <article
                key={photoId}
                className={`worktable-card${isSelected ? " is-selected" : ""}${missing.has(photoId) ? " is-missing" : ""}`}
                style={{
                  width: item.width * visualScale,
                  height: item.height * visualScale,
                  zIndex: item.z,
                  transform: `translate3d(${item.x + preview.x}px, ${item.y + preview.y}px, 0)`,
                }}
                onPointerDown={(event) => onCardPointerDown(event, photoId)}
                onDoubleClick={(event) => { event.stopPropagation(); setPreviewPhotoId(photoId); }}
                aria-label={`${item.filename}${isSelected ? "，已选择" : ""}`}
              >
                <div className="worktable-photo" style={{ height: item.height * visualScale }}>
                  {visiblePhotoIds.has(photoId)
                    ? <PhotoThumb photoSource={dependencies.photoSource} photoId={photoId} alt={item.filename} onError={onPhotoError} eager />
                    : <div className="thumb-placeholder" aria-hidden="true" />}
                  {missing.has(photoId) && <span className="worktable-missing">MISSING</span>}
                  {sequenceIndex !== undefined && <span className="worktable-sequence-number">S{String(sequenceIndex + 1).padStart(2, "0")}</span>}
                </div>
                {isSelected && selectedIds.length === 1 && (
                  <button className="worktable-resize-handle" onPointerDown={(event) => onResizePointerDown(event, photoId)} aria-label="Resize photo" />
                )}
              </article>
            );
          })}
        </div>
        {marquee && <div className="worktable-marquee" style={marquee} />}
        {!draft.entryOrder.length && (
          <section className="worktable-empty">
            <span>EMPTY TABLE</span>
            <h1>Bring photographs here to think with them.</h1>
            <p>Select photographs in Contact Sheet, then choose Place on Table.</p>
            <button className="button button-primary" onClick={() => firstSource
              ? navigate({ name: "contact-sheet", projectId, sourceId: firstSource.id })
              : navigate({ name: "project", projectId })}
            >{firstSource ? "Open Contact Sheet" : "Add a photo folder"}</button>
          </section>
        )}
      </div>
      {sequenceConfirmation && (
        <section className="sequence-confirmation" role="dialog" aria-label="Confirm Sequence order">
          <span>Add {sequenceConfirmation.length} photos in Table entry order?</span>
          <div><button onClick={() => setSequenceConfirmation(undefined)}>Cancel</button><button className="button button-primary" onClick={() => void commitToSequence(sequenceConfirmation)}>Add to Sequence</button></div>
        </section>
      )}
      <SequenceStrip
        sequence={activeSequence}
        worktable={draft}
        photoSource={dependencies.photoSource}
        onPhotoError={onPhotoError}
        onReorder={(itemId, to) => { void reorderSequence(itemId, to); }}
        onSelect={(photoId) => setSelected(new Set([photoId]))}
      />
      {previewPhotoId && draft.placements[previewPhotoId] && (
        <TablePreviewOverlay
          photoId={previewPhotoId}
          filename={draft.placements[previewPhotoId].filename}
          photoSource={dependencies.photoSource}
          onClose={() => setPreviewPhotoId(undefined)}
          onPhotoSourceError={onPhotoError}
        />
      )}
      {comparePhotoIds && <CompareOverlay photoIds={comparePhotoIds} draft={draft} photoSource={dependencies.photoSource} onClose={() => setComparePhotoIds(undefined)} />}
    </main>
  );
}

function groupBounds(draft: WorktableDraft, photoIds: readonly PhotoId[]) {
  const placements = photoIds.map((photoId) => draft.placements[photoId]);
  const padding = 24;
  const left = Math.min(...placements.map((item) => item.x)) - padding;
  const top = Math.min(...placements.map((item) => item.y)) - padding;
  const right = Math.max(...placements.map((item) => item.x + item.width)) + padding;
  const bottom = Math.max(...placements.map((item) => item.y + item.height)) + padding;
  return { left, top, width: right - left, height: bottom - top };
}

function sequenceItemId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sequence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
