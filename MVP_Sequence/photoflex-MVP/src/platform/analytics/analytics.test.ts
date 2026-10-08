import { afterEach, expect, it, vi } from "vitest";
import { beginAnalyticsOperation, createAnalytics, type AnalyticsEvent } from "./analytics";
afterEach(() => vi.useRealTimers());
it("retries with the same event ID and stops after three failures", async () => {
  vi.useFakeTimers();
  const deliver = vi.fn(async () => false);
  const analytics = createAnalytics(deliver,"test");
  analytics.track("project_created","project");
  await vi.advanceTimersByTimeAsync(12_000);
  expect(deliver).toHaveBeenCalledTimes(3);
  expect(new Set(deliver.mock.calls.map(call => (call as unknown as [AnalyticsEvent[]])[0][0].event_id)).size).toBe(1);
});
it("joins login in one session, clears binding and rotates identities on logout/switch", async () => {
  const events: Array<{ batch: readonly AnalyticsEvent[]; user: string | null }> = [];
  const analytics = createAnalytics(async (batch,user) => { events.push({ batch,user }); return true; },"test");
  analytics.track("page_view","home"); analytics.setUser("a"); await analytics.flush();
  analytics.track("project_created","project"); await analytics.flush();
  expect(events[0].user).toBe("a"); expect(events[0].batch[0].session_id).toBe(events[1].batch[0].session_id);
  analytics.track("project_created","project"); analytics.setUser("b"); analytics.track("page_view","table"); await analytics.flush();
  expect(events[2].user).toBe("b"); expect(events[2].batch).toHaveLength(1); expect(events[2].batch[0].visitor_id).not.toBe(events[0].batch[0].visitor_id);
  analytics.setUser(null); analytics.track("page_view","home"); await analytics.flush(); expect(events[3].user).toBeNull(); expect(events[3].batch[0].session_id).not.toBe(events[2].batch[0].session_id);
});
it("storage and network failures do not escape to the editor; properties contain only approved fields", async () => {
  const deliver = vi.fn(async () => { throw new Error("offline"); });
  const analytics = createAnalytics(deliver,"test",{ getItem() { throw new Error(); },setItem() { throw new Error(); } });
  expect(() => analytics.track("project_created","project",{ count: 2, filename: "secret.jpg" } as never)).not.toThrow();
  await expect(analytics.flush()).resolves.toBeUndefined();
  expect((deliver.mock.calls[0] as unknown as [AnalyticsEvent[]])[0][0].properties).toEqual({ count: 2 });
});
it("samples sequence saves and rotates the session after inactivity", async () => {
  vi.useFakeTimers();
  const batches: readonly AnalyticsEvent[][] = [];
  const analytics = createAnalytics(async events => { (batches as AnalyticsEvent[][]).push([...events]); return true; },"test");
  analytics.track("sequence_saved","sequence"); analytics.track("sequence_saved","sequence"); await analytics.flush(); expect(batches[0]).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(31 * 60_000); analytics.track("sequence_saved","sequence"); await analytics.flush(); expect(batches[1][0].session_id).not.toBe(batches[0][0].session_id);
});
it("does not attach a pending operation result to a different account", async () => {
  vi.useFakeTimers();
  const events: AnalyticsEvent[] = [];
  const analytics = createAnalytics(async batch => { events.push(...batch); return true; }, "test");
  analytics.setUser("a");
  const operation = beginAnalyticsOperation(analytics, "export_started", "sequence", { format: "pdf" });
  await analytics.flush(); analytics.setUser("b"); operation.finish(true); await analytics.flush();
  expect(events.map(event => event.name)).toEqual(["export_started"]);
});
it("records the next persisted save after import even inside the save sampling interval", async () => {
  vi.useFakeTimers();
  const events: AnalyticsEvent[] = [];
  const analytics = createAnalytics(async batch => { events.push(...batch); return true; }, "test");
  analytics.track("sequence_saved", "sequence"); analytics.track("photos_imported", "photo_import", { count: 1 }); analytics.track("sequence_saved", "sequence"); await analytics.flush();
  expect(events.map(event => event.name)).toEqual(["sequence_saved", "photos_imported", "sequence_saved"]);
});
