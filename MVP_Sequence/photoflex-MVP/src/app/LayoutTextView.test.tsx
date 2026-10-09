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
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (text: string) => ({ width: text.length * 5,
    actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * 5 }) } as unknown as CanvasRenderingContext2D);
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

it("spaces justified words using their rendered widths and keeps the final line left-aligned", async () => {
  vi.mocked(loadLayoutFont).mockResolvedValue(undefined);
  const context = { font: "", measureText(text: string) {
    const width = text.length * Number(this.font.match(/([\d.]+)px/)![1]) * 5 / 6;
    return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width };
  } };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const view = render(<LayoutTextView box={{ ...box, text: "one two three", rect: { ...box.rect, width: 90 },
    style: { ...box.style, align: "justify" } }} scale={2} />);
  await waitFor(() => expect(view.container.querySelectorAll(".layout-text-line")).toHaveLength(2));
  const lines = view.container.querySelectorAll(".layout-text-line");
  expect(lines[0].textContent).toBe("one two");
  expect((lines[0] as HTMLElement).style.justifyContent).toBe("space-between");
  expect(lines[1].textContent).toBe("three");
  expect((lines[1] as HTMLElement).style.justifyContent).toBe("flex-start");
});

it("reserves the actual glyph overhang at the displayed font size", async () => {
  vi.mocked(loadLayoutFont).mockResolvedValue(undefined);
  const context = { font: "", measureText: (text: string) => ({ width: text.length * 5,
    actualBoundingBoxLeft: .4, actualBoundingBoxRight: text.length * 5 + 1.4 }) };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const view = render(<LayoutTextView box={{ ...box, style: { ...box.style, align: "right" } }} scale={.75} />);
  await waitFor(() => expect(view.container.querySelector(".layout-text-line")).not.toBeNull());
  const line = view.container.querySelector<HTMLElement>(".layout-text-line")!;
  expect(context.font).toContain("9px");
  expect(line.style.paddingLeft).toBe("1px");
  expect(line.style.paddingRight).toBe("2px");
  expect(line.style.justifyContent).toBe("flex-end");
});
