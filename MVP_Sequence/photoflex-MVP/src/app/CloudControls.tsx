import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { AccountUser, ProjectId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";

export function CloudControls({ dependencies, projectId, showSaveStatus = true, beforeSignOut }: { readonly dependencies: AppDependencies; readonly projectId?: ProjectId; readonly showSaveStatus?: boolean; readonly beforeSignOut?: () => Promise<boolean> }) {
  const { t } = useLocale();
  const account = dependencies.accountSession;
  const save = dependencies.cloudSave;
  const [user, setUser] = useState<AccountUser | null>();
  const [busy, setBusy] = useState(false);
  const subscribe = useCallback((listener: () => void) => save?.subscribe(listener) ?? (() => {}), [save]);
  const snapshot = useCallback(() => projectId && save ? save.getStatus(projectId) : "saved", [projectId, save]);
  const status = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (!account) { setUser(null); return; }
    let active = true;
    let observedAuthChange = false;
    const unsubscribe = account.subscribe((next) => {
      observedAuthChange = true;
      if (active) setUser(next);
    });
    void account.getCurrentUser().then((result) => {
      if (active && !observedAuthChange) setUser(result.ok ? result.value : null);
    });
    return () => { active = false; unsubscribe(); };
  }, [account]);

  if (!account) return null;
  return <>
    {showSaveStatus && user && projectId && save && <span role="status" className={`cloud-save-status is-${status}`}>{t(`cloud.save.${status}`)}</span>}
    {user && <button className="login-button" type="button" disabled={busy} title={user.email} onClick={() => {
      setBusy(true);
      void (async () => { if (!beforeSignOut || await beforeSignOut()) await account.signOut(); })().finally(() => setBusy(false));
    }}>{t("cloud.signOut")}</button>}
  </>;
}

export function CloudSaveStatus({ dependencies, projectId }: { readonly dependencies: AppDependencies; readonly projectId: ProjectId }) {
  const { t } = useLocale();
  const account = dependencies.accountSession;
  const save = dependencies.cloudSave;
  const [user, setUser] = useState<AccountUser | null>();
  const subscribe = useCallback((listener: () => void) => save?.subscribe(listener) ?? (() => {}), [save]);
  const snapshot = useCallback(() => save?.getStatus(projectId) ?? "saved", [projectId, save]);
  const status = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (!account) { setUser(null); return; }
    let active = true;
    let observedAuthChange = false;
    const unsubscribe = account.subscribe((next) => {
      observedAuthChange = true;
      if (active) setUser(next);
    });
    void account.getCurrentUser().then((result) => {
      if (active && !observedAuthChange) setUser(result.ok ? result.value : null);
    });
    return () => { active = false; unsubscribe(); };
  }, [account]);

  if (!user || !save) return null;
  return <span role="status" className={`cloud-save-status is-${status}`}>{t(`cloud.save.${status}`)}</span>;
}
