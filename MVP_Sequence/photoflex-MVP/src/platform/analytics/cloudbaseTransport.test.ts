import { afterEach, expect, it, vi } from "vitest";
import { cloudbaseAnalyticsApi } from "./cloudbaseTransport";
import type { CloudBaseClient } from "../cloudbase/client";
afterEach(() => vi.unstubAllGlobals());
it("does not send an old account batch using a new account token", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: "b" }, access_token: "token-b" } } }) } } as unknown as CloudBaseClient;
  await cloudbaseAnalyticsApi("https://analytics.example", client).deliver([], "a");
  expect(fetcher).not.toHaveBeenCalled();
});
it("visitors need no token, verified accounts send only their current access token", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ accepted: true }) })); vi.stubGlobal("fetch", fetcher);
  let session: unknown = null;
  const client = { auth: { getSession: async () => ({ data: { session } }) } } as unknown as CloudBaseClient;
  const api = cloudbaseAnalyticsApi("https://analytics.example", client);
  await api.deliver([], null);
  expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ "Content-Type": "application/json" });
  session = { user: { id: "a" }, access_token: "token-a" };
  await api.deliver([], "a");
  expect((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer token-a" });
});
