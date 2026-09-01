import { useEffect, useRef, useState } from "react";
import type { ProjectId, SequenceId, SourceId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";

/**
 * Keeps route-derived navigation state in one place. The shell only consumes
 * this small interface and does not know how resume metadata is resolved.
 */
export function useAppNavigationState(dependencies: AppDependencies, route: AppRoute) {
  const currentProjectId: ProjectId | undefined = route.name === "home" ? undefined : route.projectId;
  const [contactSourceId, setContactSourceId] = useState<SourceId>();
  const lastSequenceIdRef = useRef<SequenceId | undefined>(undefined);

  useEffect(() => {
    if (route.name === "sequence") lastSequenceIdRef.current = route.sequenceId;
  }, [route]);

  useEffect(() => {
    let active = true;
    if (!currentProjectId) {
      setContactSourceId(undefined);
      return () => { active = false; };
    }
    if (route.name === "contact-sheet") {
      setContactSourceId(route.sourceId);
      return () => { active = false; };
    }
    void dependencies.projectStore.loadWorkspace(currentProjectId).then((result) => {
      if (!active || !result.ok) return;
      const sources = result.value.sources.filter((source) => !source.removedAt);
      const resumed = result.value.resumeContext?.sourceId;
      setContactSourceId(sources.some((source) => source.id === resumed) ? resumed : sources[0]?.id);
    });
    return () => { active = false; };
  }, [currentProjectId, dependencies.projectStore, route]);

  return { currentProjectId, contactSourceId, lastSequenceId: lastSequenceIdRef.current };
}
