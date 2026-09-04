import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { routeToHash } from "./router";
import type { CreateProjectError, PhotoRef, SourceError, SourceId, SourceRuntimeState } from "../contracts";
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
export function sourceCounts(state?: SourceRuntimeState) {
  if (!state) return "正在读取…";
  if (state.status === "loading") return `${state.indexedCount} indexed · ${state.discoveredCount} discovered · ${progressPercent(state)}%`;
  return `${state.indexedCount} indexed${state.failedCount ? ` · ${state.failedCount} failed` : ""}${state.skippedCount ? ` · ${state.skippedCount} skipped` : ""}`;
}
export function statusLabel(status: SourceRuntimeState["status"]) { return status.replace("permission-lost", "permission lost").toUpperCase(); }
export function shortId(id: string) { return id.replace(/-/g, "").slice(0, 4).toUpperCase(); }
export function worktableDisplaySize(width: number, height: number) {
  const longest = Math.max(1, width, height);
  const scale = 235 / longest;
  return { width: Math.max(72, Math.round(width * scale)), height: Math.max(72, Math.round(height * scale)) };
}
export function sourceErrorMessage(kind: SourceError["kind"]) {
  if (kind === "permission-denied") return "文件夹访问被拒绝。";
  if (kind === "permission-lost") return "文件夹授权已失效，请重新连接。";
  return "文件夹暂时无法读取，请重试。";
}
export function createErrorMessage(kind: CreateProjectError["kind"]) {
  if (kind === "project-id-exists") return "项目已存在，请重试。";
  if (kind === "quota-exceeded") return "浏览器存储空间不足。";
  return "项目创建失败，已保留当前输入。";
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
export function formatUpdated(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? `Today, ${time}` : date.toLocaleDateString();
}
export function StatusDot({ status }: { readonly status: SourceRuntimeState["status"] }) { return <span className="status-dot" aria-hidden="true" data-status={status} />; }
export function InlineNotice({ message }: { readonly message: string }) { return <p className="inline-notice" role="status">{message}</p>; }
export function InlineError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) { return <div className="inline-error" role="alert"><span>{message}</span><button className="text-button" onClick={onRetry}>Retry</button></div>; }
export function EmptyPanel({ eyebrow = "NO CONTENT YET", title, detail, children }: { readonly eyebrow?: string; readonly title: string; readonly detail?: string; readonly children?: ReactNode }) { return <section className="empty-panel"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{detail && <p>{detail}</p>}{children && <div className="empty-actions">{children}</div>}</section>; }
export function LoadingPage() { return <main className="page centered-state"><div className="loading-mark" /><p>Loading workspace…</p></main>; }
export function ErrorPage({ message }: { readonly message: string }) { return <main className="page centered-state"><p className="eyebrow">RECOVERY</p><h1>{message}</h1><a href={routeToHash({ name: "home" })}>Return to Home</a></main>; }
export function MemoCard({ value, onChange }: { readonly value: string; readonly onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => setDraft(value), [value]);
  useEffect(() => { const timer = window.setTimeout(() => { if (draft !== value) onChangeRef.current(draft); }, 500); return () => window.clearTimeout(timer); }, [draft, value]);
  return <section className="memo-card"><p className="eyebrow">PROJECT MEMO</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="记录这个项目的方向、问题或下一步。" rows={5} /></section>;
}
export function InlineTitle({ value, onSave }: { readonly value: string; readonly onSave: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing) return <button className="editable-title" onClick={() => setEditing(true)}>{value}<span>✎</span></button>;
  return <input className="title-input" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { void onSave(draft); setEditing(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void onSave(draft); setEditing(false); } if (event.key === "Escape") { setDraft(value); setEditing(false); } }} />;
}
export function useDialogKeyboard(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); opener?.focus(); };
  }, [ref]);
}
