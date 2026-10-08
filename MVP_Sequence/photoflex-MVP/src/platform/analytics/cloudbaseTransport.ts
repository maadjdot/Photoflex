import type { CloudBaseClient } from "../cloudbase/client";
import type { AnalyticsDelivery } from "./analytics";

export function cloudbaseAnalyticsApi(url: string, client: CloudBaseClient) {
  const request = async (path: string, body: unknown, expected?: string | null) => {
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error("analytics_unavailable");
    const session = data.session;
    if (expected !== undefined && (session?.user?.id ?? null) !== expected) return undefined;
    const response = await fetch(`${url.replace(/\/$/, "")}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000), keepalive: path === "events",
    });
    if (!response.ok) throw new Error(response.status === 403 || response.status === 401 ? "analytics_forbidden" : "analytics_unavailable");
    return response.json();
  };
  const deliver: AnalyticsDelivery = async (events, expected) => { await request("events", { events }, expected); return true; };
  return { deliver, stats: (from: string, to: string) => request("stats", { from, to }) };
}
