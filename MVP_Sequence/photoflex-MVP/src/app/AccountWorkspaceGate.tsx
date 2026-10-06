import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AccountError, AccountUser } from "../contracts";
import type { AccountWorkspace, AppDependencies } from "./dependencies";
import { useLocale } from "./locale";

const authErrorKey = (error: AccountError): string => {
  if (error.kind === "invalid-credentials") return "cloud.invalidCredentials";
  if (error.kind === "email-not-confirmed") return "cloud.emailNotConfirmed";
  if (error.kind === "already-registered") return "cloud.alreadyRegistered";
  if (error.kind === "weak-password") return "cloud.weakPassword";
  return "cloud.authFailed";
};

export function AccountWorkspaceGate({ dependencies, children }: {
  readonly dependencies: AppDependencies;
  readonly children: (scoped: AppDependencies) => ReactNode;
}) {
  const { t } = useLocale();
  const account = dependencies.accountSession;
  const factory = dependencies.accountWorkspaces;
  const [user, setUser] = useState<AccountUser | null>();
  const [workspace, setWorkspace] = useState<AccountWorkspace>();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!account || !factory) return;
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
  }, [account, factory]);

  useEffect(() => {
    if (!factory || !user) { setWorkspace(undefined); return; }
    const opened = factory.open(user.id);
    setWorkspace(opened);
    return () => { void opened.close(); };
  }, [factory, user?.id]);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    if (!account || busy) return;
    setBusy(true);
    setMessage(undefined);
    if (mode === "sign-in") {
      const result = await account.signIn(email.trim(), password);
      if (!result.ok) setMessage(t(authErrorKey(result.error)));
      else setUser(result.value);
    } else {
      const result = await account.signUp(email.trim(), password, { fullName: fullName.trim() });
      if (!result.ok) setMessage(t(authErrorKey(result.error)));
      else if (result.value.confirmationRequired) {
        setAwaitingVerification(Boolean(account.verifySignUp));
        setMessage(t("cloud.checkEmail"));
      } else if (result.value.user) setUser(result.value.user);
      else setMessage(t("cloud.authFailed"));
    }
    setBusy(false);
  };

  const verifyEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!account?.verifySignUp || busy) return;
    setBusy(true);
    setMessage(undefined);
    const result = await account.verifySignUp(verificationCode);
    if (result.ok) { setAwaitingVerification(false); setUser(result.value); }
    else setMessage(t(authErrorKey(result.error)));
    setBusy(false);
  };

  const switchMode = () => {
    setMode((current) => current === "sign-in" ? "sign-up" : "sign-in");
    setMessage(undefined);
    setPassword("");
    setVerificationCode("");
    setAwaitingVerification(false);
  };

  if (!account || !factory) return <>{children(dependencies)}</>;
  if (user === undefined || (user && !workspace)) return <main className="page centered-state"><div className="loading-mark" /><p>{t("cloud.openingWorkspace")}</p></main>;
  if (user && workspace) return <>{children(workspace.dependencies)}</>;

  const signingUp = mode === "sign-up";
  return <div className="account-gate">
    <header className="account-gate-header">
      <span className="account-gate-brand">Photoflex</span>
    </header>
    <main className="account-gate-main">
      <div className="account-gate-panel">
        <section className="account-auth-card" aria-labelledby="account-auth-title">
          <h1 id="account-auth-title">{t(awaitingVerification ? "cloud.verifyEmail" : signingUp ? "cloud.createAccountTitle" : "cloud.signInTitle")}</h1>
          <p className="account-auth-subtitle">{t(awaitingVerification ? "cloud.checkEmail" : signingUp ? "cloud.createAccountDetail" : "cloud.signInDetail")}</p>
          {awaitingVerification ? <form className="account-auth-form" onSubmit={(event) => void verifyEmail(event)}>
            <label className="account-auth-field"><span>{t("cloud.verificationCode")}</span>
              <input type="text" required inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} />
            </label>
            {message && <p className="account-auth-message" role="status">{message}</p>}
            <button type="submit" className="account-auth-primary" disabled={busy}>{busy ? t("common.loading") : t("cloud.verifyEmail")}</button>
          </form> : <form className="account-auth-form" onSubmit={(event) => void authenticate(event)}>
            {signingUp && <label className="account-auth-field">
              <span>{t("cloud.fullName")}</span>
              <input type="text" required minLength={2} autoComplete="name" placeholder={t("cloud.fullNamePlaceholder")} value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>}
            <label className="account-auth-field">
              <span>{t("cloud.email")}</span>
              <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="account-auth-field">
              <span className="account-auth-label-row">
                <span>{t("cloud.password")}</span>
                {!signingUp && <button type="button" className="account-forgot-password" disabled title={t("cloud.passwordResetUnavailable")}>{t("cloud.forgotPassword")}</button>}
              </span>
              <input type="password" required minLength={signingUp ? 8 : 6} autoComplete={signingUp ? "new-password" : "current-password"} placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {message && <p className="account-auth-message" role="status">{message}</p>}
            <button type="submit" className="account-auth-primary" disabled={busy}>{busy ? t("common.loading") : t(signingUp ? "cloud.signUp" : "cloud.signIn")}</button>
          </form>}
        </section>
        <p className="account-auth-switch">
          {t(signingUp ? "cloud.haveAccount" : "cloud.noAccount")} {" "}
          <button type="button" onClick={switchMode}>{t(signingUp ? "cloud.signIn" : "cloud.signUpShort")}</button>
        </p>
      </div>
    </main>
  </div>;
}
