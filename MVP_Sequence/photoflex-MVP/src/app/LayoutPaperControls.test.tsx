// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayoutDocument, LayoutId, LayoutPageId, ProjectId, SequenceId } from "../contracts";
import { createEmptyLayout } from "../modules/layout/layoutDocument";
import { LayoutPaperControls } from "./LayoutPaperControls";

afterEach(cleanup);

describe("LayoutPaperControls", () => {
  it("keeps color and material independent and can target every page", () => {
    const base = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId,
      sequenceId: "sequence" as SequenceId, pageId: "one" as LayoutPageId, name: "Paper", createdAt: "now" });
    const document: LayoutDocument = { ...base, pages: [{ ...base.pages[0], paper: { color: "#F8F7F3", material: "fine-paper" as const } },
      { id: "two" as LayoutPageId, objects: [] }] };
    const command = vi.fn(() => true);
    render(<LayoutPaperControls document={document} page={document.pages[0]} command={command} zh={false} />);
    expect(screen.queryByRole("option", { name: "Ink Blue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Paper color" }));
    fireEvent.click(screen.getByRole("option", { name: "Ink Blue" }));
    expect(command).toHaveBeenLastCalledWith({ type: "set-paper", pageIds: [document.pages[0].id],
      paper: { color: "#1E2B45", material: "fine-paper" } });
    expect(screen.queryByRole("option", { name: "Ink Blue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Paper material" }));
    fireEvent.click(screen.getByRole("option", { name: "Coarse linen" }));
    expect(command).toHaveBeenLastCalledWith({ type: "set-paper", pageIds: [document.pages[0].id],
      paper: { color: "#F8F7F3", material: "coarse-linen" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to all pages" }));
    expect(command).toHaveBeenLastCalledWith({ type: "set-paper", pageIds: document.pages.map((page) => page.id),
      paper: document.pages[0].paper });
  });
});
