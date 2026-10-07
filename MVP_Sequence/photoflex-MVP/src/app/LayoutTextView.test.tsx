// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LayoutTextBox, LayoutObjectId } from "../contracts";
import { loadLayoutFont } from "../platform/browser/layoutFontAssets";
import { LayoutTextView } from "./LayoutTextView";

vi.mock("../platform/browser/layoutFontAssets", () => ({ loadLayoutFont: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(loadLayoutFont).mockReset(); });
const box: LayoutTextBox = { kind: "text-box", id: "text" as LayoutObjectId, text: "Retained caption",
  rect: { x: 0, y: 0, width: 400, height: 100 }, style: { fontFamily: "roboto", fontSizePt: 12, lineHeight: 1.2, color: "#171513", align: "left" } };
it("shows the font error, handles the rejection and restores the same caption with Retry", async () => {
  vi.mocked(loadLayoutFont).mockRejectedValueOnce(Error("Offline")).mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (text: string) => ({ width: text.length * 5 }) } as unknown as CanvasRenderingContext2D);
  const selected = vi.fn();
  const view = render(<div onClick={selected}><LayoutTextView box={box} scale={1} /></div>);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Text is retained"));
  expect(view.container.querySelectorAll(".layout-text-line")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(view.container.querySelector(".layout-text-line")?.textContent).toBe(box.text));
  expect(selected).not.toHaveBeenCalled();
  expect(loadLayoutFont).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});
