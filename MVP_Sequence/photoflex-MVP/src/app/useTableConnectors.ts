import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { WorktableConnectorEndpoint, WorktableDraft, WorktableEditCommand, WorktablePoint, WorktableViewport } from "../contracts";
import { screenToWorld } from "../modules/worktable";
import { bindConnectorEndpoint, connectorTargets, findConnectorTarget, type ConnectorTarget } from "../modules/worktable/connectors";

interface ConnectorPreview {
  readonly start: WorktableConnectorEndpoint;
  readonly end: WorktableConnectorEndpoint;
}

export function useTableConnectors({ stageRef, draft, viewport, active, disabled, execute, onSelect }: {
  stageRef: RefObject<HTMLDivElement | null>; draft: WorktableDraft; viewport: WorktableViewport;
  active: boolean; disabled: boolean; execute: (command: WorktableEditCommand) => unknown;
  onSelect: (id: string | undefined) => void;
}) {
  const targets = useMemo(() => connectorTargets(draft), [draft]);
  const gesture = useRef<{ pointerId: number; start: WorktablePoint; startClient: WorktablePoint; target?: ConnectorTarget } | undefined>(undefined);
  const [preview, setPreview] = useState<ConnectorPreview>();
  const [hoverTarget, setHoverTarget] = useState<ConnectorTarget>();
  const release = () => {
    const pointerId = gesture.current?.pointerId;
    gesture.current = undefined;
    if (pointerId !== undefined && stageRef.current?.hasPointerCapture(pointerId)) stageRef.current.releasePointerCapture(pointerId);
  };
  const cancel = () => { release(); setPreview(undefined); setHoverTarget(undefined); };
  useEffect(() => {
    if (!active || disabled) cancel();
    return release;
  }, [active, disabled]);

  const worldPoint = (event: PointerEvent<HTMLDivElement>) => screenToWorld({ x: event.clientX, y: event.clientY }, stageRef.current!.getBoundingClientRect(), viewport);
  const sample = (event: PointerEvent<HTMLDivElement>): ConnectorPreview => {
    const g = gesture.current!;
    const point = worldPoint(event);
    const endTarget = findConnectorTarget(targets, point, 10 / viewport.zoom);
    setHoverTarget(endTarget);
    return { start: bindConnectorEndpoint(g.start, point, g.target), end: bindConnectorEndpoint(point, g.start, endTarget) };
  };
  const intercept = (event: PointerEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); };
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!active || disabled || event.button !== 0 || target.closest(".worktable-canvas-controls")) return;
    intercept(event);
    if (gesture.current) return;
    stageRef.current!.focus();
    const start = worldPoint(event);
    const startTarget = findConnectorTarget(targets, start, 10 / viewport.zoom);
    onSelect(undefined);
    gesture.current = { pointerId: event.pointerId, start, startClient: { x: event.clientX, y: event.clientY }, target: startTarget };
    stageRef.current!.setPointerCapture(event.pointerId);
    setPreview({ start: bindConnectorEndpoint(start, start, startTarget), end: { ...start } });
    setHoverTarget(startTarget);
  };
  const onPointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!active || disabled) return;
    if (gesture.current) {
      if (gesture.current.pointerId !== event.pointerId) return;
      intercept(event);
      setPreview(sample(event));
    } else setHoverTarget(findConnectorTarget(targets, worldPoint(event), 10 / viewport.zoom));
  };
  const onPointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    intercept(event);
    const line = sample(event);
    const distance = Math.hypot(event.clientX - g.startClient.x, event.clientY - g.startClient.y);
    const sameObject = line.start.binding && line.end.binding && line.start.binding.kind === line.end.binding.kind && line.start.binding.id === line.end.binding.id;
    cancel();
    if (distance < 4 || sameObject) return;
    const id = crypto.randomUUID();
    execute({ type: "create-connector", connector: { id, ...line } });
    onSelect(id);
  };
  const onPointerCancelCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    intercept(event); cancel();
  };
  return { preview, hoverTarget, startTarget: gesture.current?.target, cancel, onPointerDownCapture, onPointerMoveCapture, onPointerUpCapture, onPointerCancelCapture,
    onLostPointerCapture: () => { if (gesture.current) cancel(); }, onPointerLeave: () => { if (!gesture.current) setHoverTarget(undefined); } };
}
