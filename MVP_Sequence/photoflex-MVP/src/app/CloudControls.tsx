import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AccountUser, ProjectId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";

export function CloudControls({ dependencies, projectId, showSaveStatus = true, beforeSignOut, compact = false }: { readonly dependencies: AppDependencies; readonly projectId?: ProjectId; readonly showSaveStatus?: boolean; readonly beforeSignOut?: () => Promise<boolean>; readonly compact?: boolean }) {
  const { t } = useLocale();
  const account = dependencies.accountSession;
  const save = dependencies.cloudSave;
  const [user, setUser] = useState<AccountUser | null>();
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (!accountOpen) return;
    signOutRef.current?.focus();
    const outside = (event: PointerEvent) => { if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setAccountOpen(false);
      accountButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [accountOpen]);

  const signOut = () => {
    setBusy(true);
    void (async () => { if (!beforeSignOut || await beforeSignOut()) await account!.signOut(); })().finally(() => setBusy(false));
  };

  if (!account) return null;
  return <>
    {showSaveStatus && user && projectId && save && <span role="status" className={`cloud-save-status is-${status}`}>{t(`cloud.save.${status}`)}</span>}
    {user && (compact ? <div className="table-account" ref={accountRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false); }}>
      <button ref={accountButtonRef} className="table-account-button" type="button" aria-label={t("cloud.account")} title={user.email} aria-expanded={accountOpen} aria-controls="table-account-popover" onClick={() => setAccountOpen((open) => !open)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20v-2a6.5 6.5 0 0 1 13 0v2" /></svg>
      </button>
      {accountOpen && <div id="table-account-popover" className="table-account-popover"><span>{user.email}</span><button ref={signOutRef} type="button" disabled={busy} onClick={signOut}>{t("cloud.signOut")}</button></div>}
    </div> : <button className="login-button" type="button" disabled={busy} title={user.email} onClick={signOut}>{t("cloud.signOut")}</button>)}
  </>;
}

export function CloudSaveStatus({ dependencies, projectId, compact = false }: { readonly dependencies: AppDependencies; readonly projectId: ProjectId; readonly compact?: boolean }) {
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
  return <span role="status" title={t(`cloud.save.${status}`)} className={`cloud-save-status is-${status}`}>{compact && status === "saved" ? t("status.saved") : t(`cloud.save.${status}`)}</span>;
}
