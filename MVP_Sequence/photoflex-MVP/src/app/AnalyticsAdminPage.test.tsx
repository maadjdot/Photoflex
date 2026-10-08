// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AnalyticsAdminPage } from "./AnalyticsAdminPage";
afterEach(cleanup);
it("shows permission denial without exposing any metrics", async () => {
  render(<AnalyticsAdminPage api={{ stats: vi.fn(async () => { throw new Error("analytics_forbidden"); }) }} />);
  expect((await screen.findByRole("alert")).textContent).toContain("此账号没有统计访问权限。");
  expect(screen.queryByRole("table")).toBeNull();
});
it("displays partial registration coverage and pending/unobserved retention explicitly", async () => {
  render(<AnalyticsAdminPage api={{ stats: vi.fn(async () => ({ registration_source: "observed_auth_profiles", daily: [], activity: [], funnel: [], conversions: [], retention: [{ day: "2026-10-08", accounts: 1, d1: { status: "pending", accounts: null, percent: null }, d7: { status: "unobserved", accounts: null, percent: null } }] })) }} />);
  expect((await screen.findByRole("status")).textContent).toContain("已观察注册人数");
  expect(screen.getByRole("cell", { name: "未到期" })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "未完整观测" })).toBeTruthy();
});
