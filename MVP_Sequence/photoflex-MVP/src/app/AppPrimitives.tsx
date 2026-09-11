import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { routeToHash } from "./router";
import type { CreateProjectError, PhotoRef, SourceError, SourceId, SourceRuntimeState } from "../contracts";
import { useLocale } from "./locale";
import type { Locale } from "./localeDictionary";
export const now = () => new Date().toISOString();

export function stateNeedsScan(state?: SourceRuntimeState) {
  return !state || state.status === "loading" || (state.status === "ready" && state.indexedCount === 0);
}

export function stateHasPhotos(state?: SourceRuntimeState) { return Boolean(state && state.indexedCount > 0); }
export function initialRuntimeState(sourceId: SourceId): SourceRuntimeState {
  return { sourceId, status: "loading", discoveredCount: 0, indexedCount: 0, skippedCount: 0, failedCount: 0 };
}
export function totalIndexed(states: Record<string, SourceRuntimeState>) { return Object.values(states).reduce((total, state) => total + state.indexedCount, 0); }
export function progressPercent(state?: SourceRuntimeState) {
  if (!state?.discoveredCount) return 0;
  return Math.min(100, Math.round((state.indexedCount / state.discoveredCount) * 100));
}
export function sourceCounts(state?: SourceRuntimeState, locale: Locale = "en") {
  if (!state) return locale === "zh-CN" ? "正在读取…" : "Reading…";
  if (locale === "zh-CN") return state.status === "loading"
    ? `已索引 ${state.indexedCount} · 已发现 ${state.discoveredCount} · ${progressPercent(state)}%`
    : `已索引 ${state.indexedCount}${state.failedCount ? ` · ${state.failedCount} 个失败` : ""}${state.skippedCount ? ` · ${state.skippedCount} 个已跳过` : ""}`;
  if (state.status === "loading") return `${state.indexedCount} indexed · ${state.discoveredCount} discovered · ${progressPercent(state)}%`;
  return `${state.indexedCount} indexed${state.failedCount ? ` · ${state.failedCount} failed` : ""}${state.skippedCount ? ` · ${state.skippedCount} skipped` : ""}`;
}
export function statusLabel(status: SourceRuntimeState["status"], locale: Locale = "en") {
  if (locale === "zh-CN") return ({ loading: "正在加载", ready: "已就绪", partial: "部分可用", empty: "空文件夹", error: "错误", offline: "未连接", "permission-lost": "授权已失效" } as Record<string, string>)[status] ?? status;
  return status.replace("permission-lost", "permission lost").toUpperCase();
}
export function shortId(id: string) { return id.replace(/-/g, "").slice(0, 4).toUpperCase(); }
export function worktableDisplaySize(width: number, height: number) {
  const longest = Math.max(1, width, height);
  const scale = 235 / longest;
  return { width: Math.max(72, Math.round(width * scale)), height: Math.max(72, Math.round(height * scale)) };
}
export function sourceErrorMessage(kind: SourceError["kind"], locale: Locale = "en") {
  if (locale === "zh-CN") {
    if (kind === "folder-mismatch") return "该文件夹与此项目不匹配，请选择原始照片文件夹。";
    if (kind === "permission-denied") return "文件夹访问被拒绝。";
    if (kind === "permission-lost") return "文件夹授权已失效，请重新连接。";
    return "文件夹暂时无法读取，请重试。";
  }
  if (kind === "folder-mismatch") return "This folder does not contain the backed-up photo paths. Choose the original photo folder.";
  if (kind === "permission-denied") return "Folder access was denied.";
  if (kind === "permission-lost") return "Folder access has expired. Reconnect the folder.";
  return "The folder could not be read. Try again.";
}
export function createErrorMessage(kind: CreateProjectError["kind"], locale: Locale = "en") {
  if (locale === "zh-CN") {
    if (kind === "project-id-exists") return "项目已存在，请重试。";
    if (kind === "quota-exceeded") return "浏览器存储空间不足。";
    return "项目创建失败，已保留当前输入。";
  }
  if (kind === "project-id-exists") return "That project already exists. Try again.";
  if (kind === "quota-exceeded") return "Browser storage is full.";
  return "The project could not be created. Your entries have been kept.";
}
export function mergeUniquePhotos(current: readonly PhotoRef[], additions: readonly PhotoRef[]): PhotoRef[] {
  const knownIds = new Set(current.map((photo) => photo.id));
  const uniqueAdditions = additions.filter((photo) => {
    if (knownIds.has(photo.id)) return false;
    knownIds.add(photo.id);
    return true;
  });
  return uniqueAdditions.length ? [...current, ...uniqueAdditions] : [...current];
}
export function formatUpdated(value?: string, locale: Locale = "en") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const localeTag = locale === "zh-CN" ? "zh-CN" : "en";
  const time = date.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? (locale === "zh-CN" ? `今天 ${time}` : `Today, ${time}`) : date.toLocaleDateString(localeTag);
}
export function StatusDot({ status }: { readonly status: SourceRuntimeState["status"] }) { return <span className="status-dot" aria-hidden="true" data-status={status} />; }
export function InlineNotice({ message }: { readonly message: string }) { return <p className="inline-notice" role="status">{message}</p>; }
export function InlineError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) { const { t } = useLocale(); return <div className="inline-error" role="alert"><span>{message}</span><button className="text-button" onClick={onRetry}>{t("common.retry")}</button></div>; }
export function EmptyPanel({ eyebrow, title, detail, children }: { readonly eyebrow?: string; readonly title: string; readonly detail?: string; readonly children?: ReactNode }) { const { locale } = useLocale(); return <section className="empty-panel"><p className="eyebrow">{eyebrow ?? (locale === "zh-CN" ? "暂无内容" : "NO CONTENT YET")}</p><h2>{title}</h2>{detail && <p>{detail}</p>}{children && <div className="empty-actions">{children}</div>}</section>; }
export function LoadingPage() { const { t } = useLocale(); return <main className="page centered-state"><div className="loading-mark" /><p>{t("status.loadingWorkspace")}</p></main>; }
export function ErrorPage({ message }: { readonly message: string }) { const { t } = useLocale(); return <main className="page centered-state"><p className="eyebrow">{t("status.recovery")}</p><h1>{message}</h1><a href={routeToHash({ name: "home" })}>{t("status.returnHome")}</a></main>; }
export function MemoCard({ value, onChange }: { readonly value: string; readonly onChange: (value: string) => void }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => setDraft(value), [value]);
  useEffect(() => { const timer = window.setTimeout(() => { if (draft !== value) onChangeRef.current(draft); }, 500); return () => window.clearTimeout(timer); }, [draft, value]);
  return <section className="memo-card"><p className="eyebrow">{t("project.memo")}</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("project.memoPlaceholder")} rows={5} /></section>;
}
export function InlineTitle({ value, onSave }: { readonly value: string; readonly onSave: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing) return <button className="editable-title" onClick={() => setEditing(true)}>{value}<span>✎</span></button>;
  return <input className="title-input" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { void onSave(draft); setEditing(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void onSave(draft); setEditing(false); } if (event.key === "Escape") { setDraft(value); setEditing(false); } }} />;
}
export function useDialogKeyboard(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const onCloseRef = useRef(onClose);
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  const wasActiveRef = useRef(false);
  if (active && !wasActiveRef.current) openerRef.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  wasActiveRef.current = active;
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const dialog = ref.current;
      if (!dialog) return;
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); openerRef.current?.focus(); };
  }, [active, ref]);
}
