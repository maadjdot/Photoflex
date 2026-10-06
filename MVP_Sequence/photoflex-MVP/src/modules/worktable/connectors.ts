import type { FrameId, SequenceId, WorktableConnector, WorktableConnectorBinding, WorktableConnectorEndpoint, WorktableDraft, WorktableItemId, WorktablePoint } from "../../contracts";
import { frameWorldSize } from "./frameLayout";

export interface ConnectorTarget extends WorktablePoint {
  readonly kind: WorktableConnectorBinding["kind"];
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly z: number;
}

export function connectorTargets(draft: WorktableDraft): readonly ConnectorTarget[] {
  const photos = Object.entries(draft.placements).map(([id, item]) => ({ ...item, kind: "photo" as const, id }));
  const piles = Object.entries(draft.pilePlacements).map(([id, item]) => ({ ...item, kind: "pile" as const, id }));
  const graphicZ = Math.max(-1, ...photos.map((item) => item.z), ...piles.map((item) => item.z));
  const lowestPhotoZ = Math.min(...photos.map((item) => item.z));
  const memos = (draft.memos ?? []).map((item, index) => ({ ...item, kind: "memo" as const, z: item.z ?? graphicZ + index + 1 }));
  const frames = Object.values(draft.frames ?? {}).map((item) => ({ ...frameWorldSize(item), x: item.x, y: item.y,
    kind: "frame" as const, id: item.id, z: item.frontOfPhotos ? item.z : Math.min(item.z, lowestPhotoZ - 1) }));
  return [...photos, ...piles, ...memos, ...frames].sort((a, b) => b.z - a.z);
}

export function connectorTarget(draft: WorktableDraft, binding: WorktableConnectorBinding): ConnectorTarget | undefined {
  if (binding.kind === "photo") {
    const item = draft.placements[binding.id as WorktableItemId];
    return item && { ...item, id: binding.id, kind: binding.kind };
  }
  if (binding.kind === "pile") {
    const item = draft.pilePlacements?.[binding.id as SequenceId];
    return item && { ...item, id: binding.id, kind: binding.kind };
  }
  if (binding.kind === "memo") {
    const item = draft.memos?.find((memo) => memo.id === binding.id);
    return item && { ...item, kind: binding.kind, z: item.z ?? 0 };
  }
  const item = draft.frames?.[binding.id as FrameId];
  return item && { ...frameWorldSize(item), x: item.x, y: item.y, z: item.z, kind: binding.kind, id: item.id };
}

export function findConnectorTarget(targets: readonly ConnectorTarget[], point: WorktablePoint, tolerance: number): ConnectorTarget | undefined {
  // Prefer the actual object under the pointer over a nearby border.
  return targets.find((item) => inside(item, point)) ?? targets.find((item) => {
    const dx = Math.max(item.x - point.x, 0, point.x - item.x - item.width);
    const dy = Math.max(item.y - point.y, 0, point.y - item.y - item.height);
    return Math.hypot(dx, dy) <= tolerance;
  });
}

function inside(item: ConnectorTarget, point: WorktablePoint): boolean {
  return point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height;
}

export function bindConnectorEndpoint(point: WorktablePoint, toward: WorktablePoint, target?: ConnectorTarget): WorktableConnectorEndpoint {
  if (!target) return { ...point };
  let x = Math.max(target.x, Math.min(target.x + target.width, point.x));
  let y = Math.max(target.y, Math.min(target.y + target.height, point.y));
  if (inside(target, point)) {
    const dx = toward.x - point.x, dy = toward.y - point.y;
    const tx = dx > 0 ? (target.x + target.width - x) / dx : dx < 0 ? (target.x - x) / dx : Infinity;
    const ty = dy > 0 ? (target.y + target.height - y) / dy : dy < 0 ? (target.y - y) / dy : Infinity;
    const distance = Math.min(tx, ty);
    if (Number.isFinite(distance)) {
      x += dx * distance; y += dy * distance;
      if (tx <= ty) x = dx > 0 ? target.x + target.width : target.x;
      else y = dy > 0 ? target.y + target.height : target.y;
    }
    else x = target.x + target.width;
  }
  const anchor = { x: Math.max(0, Math.min(1, (x - target.x) / target.width)), y: Math.max(0, Math.min(1, (y - target.y) / target.height)) };
  return { x, y, binding: { kind: target.kind, id: target.id, anchor } };
}

export function resolveConnectorEndpoint(draft: WorktableDraft, endpoint: WorktableConnectorEndpoint): WorktablePoint {
  const target = endpoint.binding && connectorTarget(draft, endpoint.binding);
  return target && endpoint.binding ? {
    x: target.x + endpoint.binding.anchor.x * target.width,
    y: target.y + endpoint.binding.anchor.y * target.height,
  } : { x: endpoint.x, y: endpoint.y };
}

export function validConnectorEndpoint(draft: WorktableDraft, value: unknown): value is WorktableConnectorEndpoint {
  if (!value || typeof value !== "object") return false;
  const endpoint = value as WorktableConnectorEndpoint;
  if (![endpoint.x, endpoint.y].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (endpoint.binding === undefined) return true;
  const binding = endpoint.binding;
  return Boolean(binding && ["photo", "memo", "frame", "pile"].includes(binding.kind) && typeof binding.id === "string" && binding.anchor
    && [binding.anchor.x, binding.anchor.y].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)
    && (binding.anchor.x === 0 || binding.anchor.x === 1 || binding.anchor.y === 0 || binding.anchor.y === 1)
    && connectorTarget(draft, binding));
}

export function copyConnector(connector: WorktableConnector): WorktableConnector {
  const copy = (endpoint: WorktableConnectorEndpoint) => ({ ...endpoint,
    ...(endpoint.binding ? { binding: { ...endpoint.binding, anchor: { ...endpoint.binding.anchor } } } : {}) });
  return { ...connector, start: copy(connector.start), end: copy(connector.end) };
}

/** Remove connectors with deleted objects in the same undoable edit. */
export function pruneConnectors(draft: WorktableDraft): WorktableDraft {
  if (!draft.connectors) return draft;
  const connectors = draft.connectors.filter((line) => [line.start, line.end].every((endpoint) => !endpoint.binding || connectorTarget(draft, endpoint.binding)));
  return connectors.length === draft.connectors.length ? draft : { ...draft, connectors };
}
