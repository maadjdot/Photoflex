import { useEffect, useRef, useState } from "react";
import type { LayoutId, ProjectId, SequenceId, SourceId, VersionId } from "../contracts";

export type AppRoute =
  | { readonly name: "home" }
  | { readonly name: "project"; readonly projectId: ProjectId }
  | { readonly name: "contact-sheet"; readonly projectId: ProjectId; readonly sourceId: SourceId }
  | { readonly name: "table"; readonly projectId: ProjectId }
  | { readonly name: "sequence"; readonly projectId: ProjectId; readonly sequenceId: SequenceId; readonly openVersionId?: VersionId }
  | { readonly name: "layout"; readonly projectId: ProjectId; readonly sequenceId: SequenceId; readonly layoutId: LayoutId }
  | { readonly name: "sequence-compare"; readonly projectId: ProjectId; readonly leftSequenceId: SequenceId; readonly rightSequenceId: SequenceId }
  | { readonly name: "version-compare"; readonly projectId: ProjectId; readonly leftVersionId: VersionId; readonly rightVersionId: VersionId };

export function routeToHash(route: AppRoute): string {
  if (route.name === "home") return "#/";
  if (route.name === "project") return `#/projects/${route.projectId}`;
  if (route.name === "table") return `#/projects/${route.projectId}/table`;
  if (route.name === "sequence") return `#/projects/${route.projectId}/sequences/${route.sequenceId}${route.openVersionId ? `?openVersion=${encodeURIComponent(route.openVersionId)}` : ""}`;
  if (route.name === "layout") return `#/projects/${route.projectId}/sequences/${route.sequenceId}/layout/${route.layoutId}`;
  if (route.name === "sequence-compare") return `#/projects/${route.projectId}/sequences/compare/${route.leftSequenceId}/${route.rightSequenceId}`;
  if (route.name === "version-compare") return `#/projects/${route.projectId}/versions/compare/${route.leftVersionId}/${route.rightVersionId}`;
  return `#/projects/${route.projectId}/sources/${route.sourceId}`;
}

export function readRoute(hash = globalThis.location?.hash ?? ""): AppRoute {
  const path = hash.split("?", 1)[0];
  const parts = path.replace(/^#\/?/, "").split("/").filter(Boolean);
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
  if (parts[2] === "versions" && parts[3] === "compare" && parts[4] && parts[5]) {
    const leftVersionId = safeDecode(parts[4]) as VersionId | undefined;
    const rightVersionId = safeDecode(parts[5]) as VersionId | undefined;
    if (leftVersionId && rightVersionId) return { name: "version-compare", projectId, leftVersionId, rightVersionId };
  }
  if (parts[2] === "sequences" && parts.length === 6 && parts[4] === "layout") {
    const sequenceId = safeDecode(parts[3]) as SequenceId | undefined;
    const layoutId = safeDecode(parts[5]) as LayoutId | undefined;
    if (sequenceId && layoutId) return { name: "layout", projectId, sequenceId, layoutId };
  }
  if (parts[2] === "sequences" && parts[3] && parts.length === 4) {
    const sequenceId = safeDecode(parts[3]) as SequenceId | undefined;
    if (sequenceId) {
      const query = hashQuery(hash);
      const openVersionId = query.get("openVersion");
      return openVersionId ? { name: "sequence", projectId, sequenceId, openVersionId: openVersionId as VersionId } : { name: "sequence", projectId, sequenceId };
    }
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

function hashQuery(hash = globalThis.location?.hash ?? ""): URLSearchParams {
  const query = hash.indexOf("?");
  return new URLSearchParams(query >= 0 ? hash.slice(query + 1) : "");
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function useAppRoute(beforeNavigate?: () => Promise<boolean>): [AppRoute, (route: AppRoute) => void] {
  const [route, setRoute] = useState<AppRoute>(() => readRoute());
  const routeRef = useRef(route);
  const guardRef = useRef(beforeNavigate);
  guardRef.current = beforeNavigate;
  const requestId = useRef(0);
  const navigate = async (next: AppRoute, fromHistory = false) => {
    const id = ++requestId.current;
    if (guardRef.current && !await guardRef.current()) {
      if (fromHistory && id === requestId.current) window.history.replaceState(null, "", routeToHash(routeRef.current));
      return;
    }
    if (id !== requestId.current) return;
    routeRef.current = next;
    setRoute(next);
    const hash = routeToHash(next);
    if (!fromHistory && window.location.hash !== hash) window.location.hash = hash;
  };
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    const onHashChange = () => {
      const next = readRoute();
      if (routeToHash(next) === routeToHash(routeRef.current)) return;
      // Browser Back and direct hash changes use the same save barrier as buttons.
      void navigateRef.current(next, true);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return [route, (next) => { void navigate(next); }];
}
