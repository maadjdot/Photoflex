import { useEffect, useState, type ReactNode } from "react";
import type { ProjectId, SequenceId, SourceId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import type { AppRoute } from "./router";
import { LanguageSwitcher, useLocale } from "./locale";
import { CloudControls } from "./CloudControls";

export function AppHeader({ dependencies, route, projectId, contactSourceId, lastSequenceId, navigate, variant = "default", projectLabel, actions }: {
  readonly dependencies: AppDependencies;
  readonly route: AppRoute;
  readonly projectId?: ProjectId;
  readonly contactSourceId?: SourceId;
  readonly lastSequenceId?: SequenceId;
  readonly navigate: (route: AppRoute) => void;
  readonly variant?: "default" | "table";
  readonly projectLabel?: string;
  readonly actions?: ReactNode;
}) {
  const [projectName, setProjectName] = useState<string>();
  const { t } = useLocale();

  useEffect(() => {
    let active = true;
    if (!projectId || projectLabel) {
      setProjectName(undefined);
      return () => { active = false; };
    }
    void dependencies.projectStore.loadWorkspace(projectId).then((result) => {
      if (active && result.ok) setProjectName(result.value.name);
    });
    return () => { active = false; };
  }, [dependencies.projectStore, projectId, projectLabel]);

  const brand = <button className="brand" onClick={() => navigate({ name: "home" })} aria-label={t("app.backHome")}>Photoflex</button>;
  const label = projectLabel ?? projectName ?? projectId;
  return <header className={`topbar${variant === "table" ? " is-table" : ""}${route.name === "home" ? " is-home" : ""}`}>
    {variant === "table" ? <div className="table-header-project">{brand}{projectId && <><span className="table-header-slash" aria-hidden="true">/</span><span className="project-context-name" title={label}>{label}</span></>}</div> : <>{brand}{projectId && <span className="project-context-name" title={label}>{label}</span>}</>}
    {route.name !== "home" && route.name !== "table" && route.name !== "sequence" && <nav className="topnav" aria-label={t("nav.main")}>
      {(!projectId || variant === "table") && <NavButton onClick={() => navigate({ name: "home" })}>{t("nav.home")}</NavButton>}
      <NavButton active={route.name === "project" || route.name === "contact-sheet"} disabled={!projectId} onClick={() => projectId && navigate({ name: "table", projectId })}>{t("nav.table")}</NavButton>
      <NavButton active={route.name === "sequence-compare" || route.name === "version-compare"} disabled={!projectId} title={t("nav.openLastSequence")} onClick={() => {
        if (!projectId) return;
        void Promise.all([dependencies.projectStore.listSequences(projectId), dependencies.projectStore.loadWorkspace(projectId)]).then(([sequences, workspace]) => {
          const available = sequences.ok ? sequences.value : [];
          const resumedId = lastSequenceId ?? (workspace.ok ? workspace.value.resumeContext?.sequenceId : undefined);
          const resumed = resumedId ? available.find((item) => item.id === resumedId) : undefined;
          const target = resumed ?? available[0];
          navigate(target ? { name: "sequence", projectId, sequenceId: target.id } : { name: "table", projectId });
        });
      }}>{t("nav.sequence")}</NavButton>
    </nav>}
    <div className={route.name === "home" ? "home-header-actions" : "topbar-actions"}>
      {route.name === "home" && <LanguageSwitcher />}
      {actions}
      {projectId && route.name !== "project" && <NavButton onClick={() => navigate({ name: "project", projectId })}>{t("nav.projectSettings")}</NavButton>}
      <CloudControls dependencies={dependencies} projectId={projectId} />
    </div>
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
