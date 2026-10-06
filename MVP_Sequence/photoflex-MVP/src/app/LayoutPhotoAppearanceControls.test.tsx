// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import type { LayoutDocument, LayoutId, LayoutPageId, ProjectId, SequenceId } from "../contracts";
import { applyLayoutCommand, createEmptyLayout } from "../modules/layout/layoutDocument";
import { MM_TO_PT } from "../modules/page-layout/pageGeometry";
import { LayoutPhotoAppearanceControls } from "./LayoutPhotoAppearanceControls";

afterEach(cleanup);

it("edits the page's photo edges and elevation, then applies both to the other pages", () => {
  let saved: LayoutDocument;
  function Harness() {
    const [document, setDocument] = useState<LayoutDocument>(() => {
      const base = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId, sequenceId: "sequence" as SequenceId,
        pageId: "page" as LayoutPageId, name: "Book", createdAt: "now" });
      return { ...base, pages: [...base.pages, { id: "other" as LayoutPageId, objects: [] }] };
    });
    saved = document;
    return <LayoutPhotoAppearanceControls document={document} page={document.pages[0]} zh={false} command={(command) => {
      const result = applyLayoutCommand(document, command);
      if (result.ok) setDocument(result.value);
      return result.ok;
    }} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Mat bevel" }));
  fireEvent.change(screen.getByLabelText("Inner edge width mm"), { target: { value: "2.5" } });
  fireEvent.blur(screen.getByLabelText("Inner edge width mm"));
  fireEvent.change(screen.getByLabelText("Inner edge color"), { target: { value: "#333333" } });
  fireEvent.change(screen.getByLabelText("Photo elevation mm"), { target: { value: "4" } });
  fireEvent.blur(screen.getByLabelText("Photo elevation mm"));
  expect(saved!.pages[0].innerEdge).toEqual({ mode: "bevel", widthPt: 2.5 * MM_TO_PT, color: "#333333" });
  expect(saved!.pages[0].photoElevationPt).toBe(4 * MM_TO_PT);
  expect(saved!.pages[1].innerEdge).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Apply photo effects to all pages" }));
  expect(saved!.pages[1].innerEdge).toEqual(saved!.pages[0].innerEdge);
  expect(saved!.pages[1].photoElevationPt).toBe(4 * MM_TO_PT);
});
