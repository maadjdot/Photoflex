// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("navigates responsive spreads, switches to single pages, and closes with Escape", () => {
    const onClose = vi.fn();
    render(<LayoutReader document={layout} initialPage={0} photoSource={{} as PhotoSource} onClose={onClose} />);
    expect(screen.getByText("1 / 5")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2–3 / 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Single" }));
    expect(screen.getByText("2 / 5")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("prevents native selection and dragging while the page is being panned", () => {
    const { container } = render(<LayoutReader document={layout} initialPage={0} photoSource={{} as PhotoSource} onClose={() => {}} />);
    const stage = container.querySelector<HTMLElement>(".layout-reader-stage")!;
    stage.setPointerCapture = vi.fn();

    expect(fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 })).toBe(false);
    expect(fireEvent.dragStart(stage)).toBe(false);
  });
});
