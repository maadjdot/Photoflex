import { useEffect, useState } from "react";
import type { ProjectId, SequenceId, SourceId } from "../contracts";

export type AppRoute =
  | { readonly name: "home" }
  | { readonly name: "project"; readonly projectId: ProjectId }
  | { readonly name: "contact-sheet"; readonly projectId: ProjectId; readonly sourceId: SourceId }
  | { readonly name: "table"; readonly projectId: ProjectId }
  | { readonly name: "sequence"; readonly projectId: ProjectId; readonly sequenceId: SequenceId }
  | { readonly name: "sequence-compare"; readonly projectId: ProjectId; readonly leftSequenceId: SequenceId; readonly rightSequenceId: SequenceId };

export function routeToHash(route: AppRoute): string {
  if (route.name === "home") return "#/";
  if (route.name === "project") return `#/projects/${route.projectId}`;
  if (route.name === "table") return `#/projects/${route.projectId}/table`;
  if (route.name === "sequence") return `#/projects/${route.projectId}/sequences/${route.sequenceId}`;
  if (route.name === "sequence-compare") return `#/projects/${route.projectId}/sequences/compare/${route.leftSequenceId}/${route.rightSequenceId}`;
  return `#/projects/${route.projectId}/sources/${route.sourceId}`;
}

export function readRoute(hash = globalThis.location?.hash ?? ""): AppRoute {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] !== "projects" || !parts[1]) return { name: "home" };
  const projectId = safeDecode(parts[1]) as ProjectId | undefined;
  if (!projectId) return { name: "home" };
  if (parts[2] === "table" && parts.length === 3) {
    return { name: "table", projectId };
  }
  if (parts[2] === "sequences" && parts[3] === "compare" && parts[4] && parts[5]) {
    const leftSequenceId = safeDecode(parts[4]) as SequenceId | undefined;
    const rightSequenceId = safeDecode(parts[5]) as SequenceId | undefined;
    if (leftSequenceId && rightSequenceId) return { name: "sequence-compare", projectId, leftSequenceId, rightSequenceId };
  }
  if (parts[2] === "sequences" && parts[3] && parts.length === 4) {
    const sequenceId = safeDecode(parts[3]) as SequenceId | undefined;
    if (sequenceId) return { name: "sequence", projectId, sequenceId };
  }
  if (parts[2] === "sources" && parts[3]) {
    const sourceId = safeDecode(parts[3]) as SourceId | undefined;
    if (!sourceId) return { name: "home" };
    return {
      name: "contact-sheet",
      projectId,
      sourceId,
    };
  }
  return { name: "project", projectId };
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function useAppRoute(): [AppRoute, (route: AppRoute) => void] {
  const [route, setRoute] = useState<AppRoute>(() => readRoute());
  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (next: AppRoute) => {
    const hash = routeToHash(next);
    if (window.location.hash === hash) setRoute(next);
    else window.location.hash = hash;
  };
  return [route, navigate];
}
