import { useEffect, useState, type FormEvent } from "react";
import type { AccountError, AccountUser, ProjectBackupV1, ProjectId } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { useLocale } from "./locale";

const authErrorKey = (error: AccountError): string => {
  if (error.kind === "invalid-credentials") return "cloud.invalidCredentials";
  if (error.kind === "email-not-confirmed") return "cloud.emailNotConfirmed";
  if (error.kind === "already-registered") return "cloud.alreadyRegistered";
  if (error.kind === "weak-password") return "cloud.weakPassword";
  return "cloud.authFailed";
};

export function CloudControls({ dependencies, projectId }: { readonly dependencies: AppDependencies; readonly projectId?: ProjectId }) {
  const { t } = useLocale();
  const account = dependencies.accountSession;
  const projectCloud = dependencies.projectCloud;
  const [user, setUser] = useState<AccountUser | null>();
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "failed">("idle");

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

  const authenticate = async (mode: "sign-in" | "sign-up", event?: FormEvent) => {
    event?.preventDefault();
    if (!account || busy) return;
    setBusy(true);
    setMessage(undefined);
    if (mode === "sign-in") {
      const result = await account.signIn(email.trim(), password);
      if (!result.ok) setMessage(t(authErrorKey(result.error)));
      else { setUser(result.value); setShowAuth(false); setPassword(""); }
    } else {
      const result = await account.signUp(email.trim(), password);
      if (!result.ok) setMessage(t(authErrorKey(result.error)));
      else if (result.value.confirmationRequired) setMessage(t("cloud.checkEmail"));
      else { setUser(result.value.user); setShowAuth(false); setPassword(""); }
    }
    setBusy(false);
  };

  const signOut = async () => {
    if (!account || busy) return;
    setBusy(true);
    const result = await account.signOut();
    if (result.ok) { setUser(null); setSyncState("idle"); }
    else setMessage(t(authErrorKey(result.error)));
    setBusy(false);
  };

  const sync = async () => {
    if (!projectCloud || !projectId || syncState === "syncing") return;
    setSyncState("syncing");
    const exported = await dependencies.projectStore.exportBackup(projectId);
    if (!exported.ok) { setSyncState("failed"); return; }
    try {
      const document = JSON.parse(new TextDecoder().decode(exported.value)) as ProjectBackupV1;
      const remote = await projectCloud.pull(projectId);
      const expectedCloudRevision = remote.ok ? remote.value.cloudRevision : remote.error.kind === "not-found" ? null : undefined;
      if (expectedCloudRevision === undefined) { setSyncState("failed"); return; }
      const pushed = await projectCloud.push({
        projectId,
        name: document.project.name,
        schemaVersion: document.project.schemaVersion,
        document,
        expectedCloudRevision,
      });
      setSyncState(pushed.ok ? "synced" : "failed");
    } catch { setSyncState("failed"); }
  };

  if (!account) return <button className="login-button" type="button" disabled title={t("cloud.notConfigured")}>{t("nav.login")}</button>;

  return <>
    {user && projectId && projectCloud && <button className={`cloud-sync-button is-${syncState}`} type="button" disabled={syncState === "syncing"} onClick={() => void sync()}>{t(`cloud.sync.${syncState}`)}</button>}
    {user ? <button className="login-button" type="button" disabled={busy} title={user.email} onClick={() => void signOut()}>{t("cloud.signOut")}</button>
      : <button className="login-button" type="button" onClick={() => setShowAuth(true)}>{t("nav.login")}</button>}
    {showAuth && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAuth(false); }}>
      <form className="modal auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onSubmit={(event) => void authenticate("sign-in", event)}>
        <h2 id="auth-title">{t("cloud.account")}</h2>
        <label>{t("cloud.email")}<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>{t("cloud.password")}<input type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={() => setShowAuth(false)}>{t("common.cancel")}</button>
          <button type="button" className="button button-secondary" disabled={busy || !email.trim() || password.length < 6} onClick={() => void authenticate("sign-up")}>{t("cloud.signUp")}</button>
          <button type="submit" className="button button-primary" disabled={busy || !email.trim() || password.length < 6}>{busy ? t("common.loading") : t("cloud.signIn")}</button>
        </div>
      </form>
    </div>}
  </>;
}
