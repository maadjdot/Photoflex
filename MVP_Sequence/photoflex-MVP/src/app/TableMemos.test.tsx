// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectId } from "../contracts";
import { createEmptyWorktable } from "../modules/worktable";
import { TableMemos } from "./TableMemos";

afterEach(cleanup);

it("resizes width and height independently in world coordinates and commits only on release", () => {
  if (!("PointerEvent" in window)) Object.defineProperty(window, "PointerEvent", { value: MouseEvent });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  const memo = { id: "memo-1", text: "Notes", x: 10, y: 20, width: 260, height: 180, fontSize: 16, photoIds: [] };
  const onExecute = vi.fn();
  render(<TableMemos draft={{ ...createEmptyWorktable("memo-project" as ProjectId), memos: [memo] }} zoom={0.5} selectedId={memo.id} onSelect={() => {}} onExecute={onExecute} disabled={false} />);
  const resize = screen.getByRole("button", { name: "Resize memo" });
  fireEvent.pointerDown(resize, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(resize, { clientX: 150, clientY: 80 });
  expect(onExecute).not.toHaveBeenCalled();
  fireEvent.pointerUp(resize, { clientX: 150, clientY: 80 });
  expect(onExecute).toHaveBeenCalledExactlyOnceWith({ type: "update-memo", memoId: memo.id, changes: { x: 10, y: 20, width: 360, height: 140 } });
  onExecute.mockClear();
  fireEvent.pointerDown(resize, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(resize, { clientX: 200, clientY: 200 });
  fireEvent.pointerCancel(resize);
  expect(onExecute).not.toHaveBeenCalled();
});
