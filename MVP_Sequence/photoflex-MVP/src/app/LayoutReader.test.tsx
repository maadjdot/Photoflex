// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayoutDocument, LayoutId, LayoutPageId, LayoutRevision, ProjectId, SequenceId, PhotoSource } from "../contracts";
import { LayoutReader } from "./LayoutReader";

afterEach(cleanup);

const layout = {
  schemaVersion: 1,
  id: "layout" as LayoutId,
  projectId: "project" as ProjectId,
  sequenceId: "sequence" as SequenceId,
  name: "Reader sample",
  pageSpec: { widthPt: 595, heightPt: 842 },
  pages: Array.from({ length: 5 }, (_, index) => ({ id: `page-${index}` as LayoutPageId, objects: [] })),
  revision: 0 as LayoutRevision,
  createdAt: "now",
  updatedAt: "now",
} as LayoutDocument;

describe("LayoutReader", () => {
  it("omits cover numbers, numbers the first left body page as one, and hides all printed numbers", () => {
    const book: LayoutDocument = { ...layout, pages: layout.pages.map((page, index) => ({ ...page,
      ...(index === 0 ? { kind: "cover" as const } : index === 4 ? { kind: "back-cover" as const } : {}) })) };
    const view = render(<LayoutReader document={book} initialPage={1} photoSource={{} as PhotoSource} onClose={() => {}} />);
    expect(screen.getByLabelText("Front cover").querySelector(".layout-paper-number")).toBeNull();
    expect(screen.getByLabelText("Back cover").querySelector(".layout-paper-number")).toBeNull();
    expect(screen.getByLabelText("Page 1").querySelector(".layout-paper-number.is-left")?.textContent).toBe("01");
    expect(screen.getByLabelText("Page 2").querySelector(".layout-paper-number")?.textContent).toBe("02");
    expect(screen.getByText("1–2 / 3")).toBeTruthy();
    view.rerender(<LayoutReader document={{ ...book, showPageNumbers: false }} initialPage={1} photoSource={{} as PhotoSource} onClose={() => {}} />);
    expect(view.container.querySelectorAll(".layout-paper-number")).toHaveLength(0);
  });
  it("commits responsive page curls, switches to single pages, and closes with Escape", async () => {
    const onClose = vi.fn();
    render(<LayoutReader document={layout} initialPage={0} photoSource={{} as PhotoSource} onClose={onClose} />);
    expect(screen.getByText("1 / 5")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByText("2–3 / 5")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Single" }));
    await waitFor(() => expect(screen.getByText("2 / 5")).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("prevents native selection and dragging while the page is being panned", () => {
    const { container } = render(<LayoutReader document={layout} initialPage={0} photoSource={{} as PhotoSource} onClose={() => {}} />);
    const stage = container.querySelector<HTMLElement>(".layout-reader-stage")!;
    stage.setPointerCapture = vi.fn();

    fireEvent.doubleClick(stage);
    expect(fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 })).toBe(false);
    expect(fireEvent.dragStart(stage)).toBe(false);
  });
});
