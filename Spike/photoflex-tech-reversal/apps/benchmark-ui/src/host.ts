import type { HostDiagnostics, SourceEntry, SourceGrant } from "@photoflex/host-contract";

interface NativeSourceEntry extends SourceEntry {
  bytes?: number;
}

interface NativeHostBridge {
  diagnostics(): Promise<HostDiagnostics>;
  sources?: {
    requestFolderGrant(): Promise<SourceGrant>;
    bootstrapGrant?(): Promise<SourceGrant | null>;
    restoreGrant(sourceId: string): Promise<SourceGrant>;
    query(sourceId: string, offset: number, limit: number): Promise<NativeSourceEntry[]>;
    proxyUrl(sourceId: string, photoId: string): Promise<string>;
  };
  exports?: {
    startPdf(request: { projectId: string; pageIds: string[] }): Promise<{ jobId: string }>;
    status(jobId: string): Promise<NativeJobEvent>;
    cancel(jobId: string): Promise<NativeJobEvent>;
    retry(jobId: string): Promise<{ jobId: string }>;
    savePdf?(jobId: string): Promise<string | null>;
    saveJson?(content: string, suggestedName: string): Promise<string | null>;
  };
}

export interface NativeJobEvent {
  jobId: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  completed: number;
  total: number;
  errors: unknown[];
  emittedAt: string;
  workerStopped?: boolean;
}

declare global {
  interface Window {
    photoFlexHost?: NativeHostBridge;
    __TAURI_INTERNALS__?: unknown;
  }
}

export function hasNativeSourceLibrary(): boolean {
  return Boolean(window.photoFlexHost?.sources) || isTauri();
}

function isTauri(): boolean {
  return Boolean(window.__TAURI_INTERNALS__);
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export function hasNativeExportQueue(): boolean {
  return Boolean(window.photoFlexHost?.exports) || isTauri();
}

export function hasNativeFileSave(): boolean {
  return isTauri() || Boolean(window.photoFlexHost?.exports?.savePdf || window.photoFlexHost?.exports?.saveJson);
}

export async function nativePdfStart(pageIds: string[]): Promise<{ jobId: string }> {
  const request = { projectId: "benchmark-project", pageIds };
  if (window.photoFlexHost?.exports) return window.photoFlexHost.exports.startPdf(request);
  if (isTauri()) return tauriInvoke("export_start_pdf", { request });
  throw new Error("当前运行环境没有原生 ExportQueue adapter");
}

export async function nativePdfStatus(jobId: string): Promise<NativeJobEvent> {
  if (window.photoFlexHost?.exports) return window.photoFlexHost.exports.status(jobId);
  if (isTauri()) return tauriInvoke("export_status", { jobId });
  throw new Error("当前运行环境没有原生 ExportQueue adapter");
}

export async function nativePdfCancel(jobId: string): Promise<NativeJobEvent> {
  if (window.photoFlexHost?.exports) return window.photoFlexHost.exports.cancel(jobId);
  if (isTauri()) return tauriInvoke("export_cancel", { jobId });
  throw new Error("当前运行环境没有原生 ExportQueue adapter");
}

export async function nativePdfRetry(jobId: string): Promise<{ jobId: string }> {
  if (window.photoFlexHost?.exports) return window.photoFlexHost.exports.retry(jobId);
  if (isTauri()) return tauriInvoke("export_retry", { jobId });
  throw new Error("当前运行环境没有原生 ExportQueue adapter");
}

export async function nativePdfSave(jobId: string): Promise<string | null> {
  if (window.photoFlexHost?.exports?.savePdf) return window.photoFlexHost.exports.savePdf(jobId);
  if (isTauri()) return tauriInvoke<string | null>("export_save_pdf", { jobId });
  throw new Error("当前运行环境没有原生 PDF 保存 adapter");
}

export async function nativeJsonSave(content: string, suggestedName: string): Promise<string | null> {
  if (window.photoFlexHost?.exports?.saveJson) return window.photoFlexHost.exports.saveJson(content, suggestedName);
  if (isTauri()) return tauriInvoke<string | null>("export_save_json", { content, suggestedName });
  throw new Error("当前运行环境没有原生 JSON 保存 adapter");
}

export async function loadNativeSource(sourceId?: string): Promise<{ grant: SourceGrant; entries: NativeSourceEntry[] }> {
  const sources = window.photoFlexHost?.sources;
  if (!sources && !isTauri()) throw new Error("当前运行环境没有原生 SourceLibrary adapter");
  const grant = sources
    ? (sourceId ? await sources.restoreGrant(sourceId) : await sources.requestFolderGrant())
    : sourceId
      ? await tauriInvoke<SourceGrant>("source_restore_grant", { sourceId })
      : await tauriInvoke<SourceGrant>("source_request_folder_grant");
  const entries: NativeSourceEntry[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = sources
      ? await sources.query(grant.sourceId, offset, 500)
      : await tauriInvoke<NativeSourceEntry[]>("source_query", { sourceId: grant.sourceId, offset, limit: 500 });
    entries.push(...page);
    if (page.length < 500) break;
  }
  return { grant, entries };
}

export async function loadNativeBootstrapSource(): Promise<{ grant: SourceGrant; entries: NativeSourceEntry[] } | null> {
  const sources = window.photoFlexHost?.sources;
  if (!sources?.bootstrapGrant) return null;
  const grant = await sources.bootstrapGrant();
  return grant ? loadNativeSource(grant.sourceId) : null;
}

export async function hostDiagnostics(): Promise<HostDiagnostics> {
  if (window.photoFlexHost) return window.photoFlexHost.diagnostics();
  if (isTauri()) return tauriInvoke<HostDiagnostics>("diagnostics");
  return {
    framework: window.__TAURI_INTERNALS__ ? "tauri" : "browser",
    environmentId: "browser-unlocked",
    versions: { userAgent: navigator.userAgent }
  };
}
