import type { ReactNode } from "react";
import type { ProjectId, SequenceId, SourceId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";

export function AppHeader({ dependencies, route, projectId, contactSourceId, lastSequenceId, navigate }: {
  readonly dependencies: AppDependencies;
  readonly route: AppRoute;
  readonly projectId?: ProjectId;
  readonly contactSourceId?: SourceId;
  readonly lastSequenceId?: SequenceId;
  readonly navigate: (route: AppRoute) => void;
}) {
  return <header className="topbar">
    <button className="brand" onClick={() => navigate({ name: "home" })} aria-label="返回 Home">Photoflex</button>
    <nav className="topnav" aria-label="主导航">
      <NavButton active={route.name === "home"} onClick={() => navigate({ name: "home" })}>Home</NavButton>
      <NavButton active={route.name === "project"} disabled={!projectId} onClick={() => projectId && navigate({ name: "project", projectId })}>Project</NavButton>
      <NavButton active={route.name === "contact-sheet"} disabled={!projectId || !contactSourceId} title={contactSourceId ? undefined : "项目尚未连接照片来源"} onClick={() => projectId && contactSourceId && navigate({ name: "contact-sheet", projectId, sourceId: contactSourceId })}>Photos</NavButton>
      <NavButton active={route.name === "table"} disabled={!projectId} onClick={() => projectId && navigate({ name: "table", projectId })}>Table</NavButton>
      <NavButton active={route.name === "sequence" || route.name === "sequence-compare" || route.name === "version-compare"} disabled={!projectId} title="Open the last Sequence" onClick={() => {
        if (!projectId) return;
        void Promise.all([dependencies.projectStore.listSequences(projectId), dependencies.projectStore.loadWorkspace(projectId)]).then(([sequences, workspace]) => {
          const available = sequences.ok ? sequences.value : [];
          const resumedId = lastSequenceId ?? (workspace.ok ? workspace.value.resumeContext?.sequenceId : undefined);
          const resumed = resumedId ? available.find((item) => item.id === resumedId) : undefined;
          const target = resumed ?? available[0];
          navigate(target ? { name: "sequence", projectId, sequenceId: target.id } : { name: "table", projectId });
        });
      }}>Sequence</NavButton>
    </nav>
    <button className="login-button" aria-label="登录（M1 占位）">Login</button>
  </header>;
}

function NavButton({ active, disabled, onClick, title, children }: {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return <button className={`nav-button${active ? " is-active" : ""}`} disabled={disabled} onClick={onClick} title={title}>{children}</button>;
}
