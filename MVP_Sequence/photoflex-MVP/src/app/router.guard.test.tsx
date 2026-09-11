// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAppRoute } from "./router";

afterEach(() => { cleanup(); window.history.replaceState(null, "", "#/"); });
it("applies the save barrier to both buttons and browser hash navigation", async () => {
  window.history.replaceState(null, "", "#/projects/p/table");
  const allow = vi.fn(async () => false);
  function Harness() { const [route, navigate] = useAppRoute(allow); return <><p>{route.name}</p><button onClick={() => navigate({ name: "home" })}>Leave</button></>; }
  render(<Harness />);
  fireEvent.click(screen.getByText("Leave"));
  await waitFor(() => expect(allow).toHaveBeenCalledTimes(1));
  expect(screen.getByText("table")).toBeTruthy();
  await act(async () => { window.location.hash = "#/"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(window.location.hash).toBe("#/projects/p/table");
  expect(screen.getByText("table")).toBeTruthy();
  allow.mockResolvedValue(true);
  fireEvent.click(screen.getByText("Leave"));
  await screen.findByText("home");
  expect(window.location.hash).toBe("#/");
});
