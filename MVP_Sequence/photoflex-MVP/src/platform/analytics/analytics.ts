export type AnalyticsName = "page_view" | "signup_completed" | "project_created" | "photo_import_started" | "photos_imported" | "sequence_saved" | "export_started" | "export_generated" | "operation_failed";
export type AnalyticsFeature = "home" | "project" | "contact_sheet" | "table" | "sequence" | "frame" | "layout" | "compare" | "account" | "photo_import";
export interface AnalyticsProperties { count?: number; failed_count?: number; duration_ms?: number; attempt_id?: string; format?: "pdf" | "jpeg" | "folder"; error_kind?: "cancelled" | "permission" | "storage" | "conflict" | "unavailable" | "empty" | "partial" | "unknown"; }
export interface Analytics { track(name: AnalyticsName, feature: AnalyticsFeature, properties?: AnalyticsProperties): void; setUser(userId: string | null): void; capture?(): Analytics["track"]; }
export interface AnalyticsEvent { event_id: string; visitor_id: string; session_id: string; occurred_at: string; name: AnalyticsName; feature: AnalyticsFeature; version: string; properties: AnalyticsProperties; }
export type AnalyticsDelivery = (events: readonly AnalyticsEvent[], expectedUserId: string | null) => Promise<boolean>;

/** Memory-only bounded retries. No account tokens or content are persisted. */
export function createAnalytics(deliver: AnalyticsDelivery, version: string, storage?: Pick<Storage, "getItem" | "setItem">): Analytics & { flush(): Promise<void> } {
  const id = (): string => crypto.randomUUID();
  let visitorId = id();
  try { visitorId = storage?.getItem("photoflex:analytics-visitor") || visitorId; storage?.setItem("photoflex:analytics-visitor", visitorId); } catch { /* Private browsing can block storage. */ }
  let sessionId = id();
  let userId: string | null = null;
  let identityEpoch = 0;
  let lastActivity = Date.now();
  let queue: Array<{ event: AnalyticsEvent; userId: string | null; retries: number }> = [];
  let sending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sampled = new Map<string, number>();
  const flush = async () => {
    if (sending || !queue.length) return;
    sending = true;
    const batch = queue.splice(0, 20);
    const identity = batch[0].userId;
    const same = batch.filter((entry) => entry.userId === identity);
    queue.unshift(...batch.filter((entry) => entry.userId !== identity));
    try {
      const delivered = await deliver(same.map((entry) => entry.event), identity);
      if (!delivered && identity === userId) queue.unshift(...same.filter((entry) => ++entry.retries < 3));
    } catch { if (identity === userId) queue.unshift(...same.filter((entry) => ++entry.retries < 3)); }
    finally { sending = false; if (queue.length) schedule(5000); }
  };
  const schedule = (delay = 1000) => { if (!timer) timer = setTimeout(() => { timer = undefined; void flush(); }, delay); };
  const analytics: Analytics & { flush(): Promise<void> } = {
    flush,
    capture() {
      const epoch = identityEpoch;
      return (name, feature, properties) => { if (epoch === identityEpoch) analytics.track(name, feature, properties); };
    },
    setUser(next) {
      if (next === userId) return;
      if (userId) {
        identityEpoch++;
        queue = [];
        sessionId = id(); visitorId = id(); sampled.clear();
        try { storage?.setItem("photoflex:analytics-visitor", visitorId); } catch { /* Optional storage. */ }
      } else {
        // Login joins earlier anonymous activity in this session. Send with the verified account.
        queue.forEach((entry) => { entry.userId = next; });
      }
      userId = next;
    },
    track(name, feature, properties = {}) {
      try {
        const now = Date.now();
        if (now - lastActivity > 30 * 60_000) { sessionId = id(); sampled.clear(); }
        lastActivity = now;
        const key = `${name}:${feature}`;
        const interval = name === "sequence_saved" ? 30_000 : name === "page_view" ? 500 : 0;
        if (interval && now - (sampled.get(key) ?? 0) < interval) return;
        sampled.set(key, now);
        if (name === "photos_imported") sampled.delete("sequence_saved:sequence");
        const safe: AnalyticsProperties = {};
        for (const key of ["count", "failed_count", "duration_ms", "attempt_id", "format", "error_kind"] as const) {
          if (properties[key] !== undefined) Object.assign(safe, { [key]: properties[key] });
        }
        if (queue.length >= 100) queue.shift();
        queue.push({ event: { event_id: id(), visitor_id: visitorId, session_id: sessionId, occurred_at: new Date(now).toISOString(), name, feature, version, properties: safe }, userId, retries: 0 });
        schedule();
      } catch { /* Telemetry must never interrupt a user action. */ }
    },
  };
  return analytics;
}

export function failureKind(kind: string | undefined): NonNullable<AnalyticsProperties["error_kind"]> {
  if (kind === "cancelled" || kind === "AbortError") return "cancelled";
  if (kind?.includes("permission") || kind === "NotAllowedError") return "permission";
  if (kind === "conflict") return "conflict";
  if (kind === "quota-exceeded" || kind === "io") return "storage";
  if (kind === "unavailable") return "unavailable";
  return "unknown";
}

export function beginAnalyticsOperation(analytics: Analytics | undefined, name: "export_started" | "photo_import_started", feature: AnalyticsFeature, properties: AnalyticsProperties = {}) {
  const started = Date.now();
  const attempt_id = crypto.randomUUID();
  let finished = false;
  const track = analytics?.capture?.() ?? analytics?.track.bind(analytics);
  track?.(name, feature, { ...properties, attempt_id });
  return {
    finish(success: boolean, values: AnalyticsProperties = {}) {
      if (finished) return;
      finished = true;
      track?.(success ? name === "export_started" ? "export_generated" : "photos_imported" : "operation_failed", feature, { ...properties, ...values, attempt_id, duration_ms: Date.now() - started });
    },
  };
}
