// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher, LocaleProvider } from "./locale";
import { UserGuideButton } from "./UserGuide";

// jsdom does not implement the browser's native modal dialog lifecycle.
const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => { cleanup(); localStorage.removeItem("photoflex:locale"); });
afterAll(() => {
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("User guide", () => {
  it("opens only on request, isolates workspace shortcuts and restores focus after dismissal", () => {
    render(<LocaleProvider><UserGuideButton /></LocaleProvider>);
    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = screen.getByRole("button", { name: "User guide" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "User guide" });
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "Overview" }));
    const workspaceKey = vi.fn();
    window.addEventListener("keydown", workspaceKey);
    try {
      fireEvent.keyDown(document.activeElement!, { key: "Delete" });
      fireEvent.keyDown(document.activeElement!, { key: "z", ctrlKey: true });
      expect(workspaceKey).not.toHaveBeenCalled();
    } finally { window.removeEventListener("keydown", workspaceKey); }
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("supports sequential reading, chapter jumps and resuming the current chapter", () => {
    render(<LocaleProvider><UserGuideButton /></LocaleProvider>);
    const trigger = screen.getByRole("button", { name: "User guide" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(screen.getByRole("heading", { name: "1: Import & browse" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close user guide" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("follows the chosen application language", () => {
    render(<LocaleProvider><LanguageSwitcher /><UserGuideButton /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    fireEvent.click(screen.getByRole("button", { name: "使用指南" }));
    expect(screen.getByRole("dialog", { name: "使用指南" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "下一章" }));
    expect(screen.getByRole("heading", { name: "一：导入与浏览照片" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "下一章" })).toBeTruthy();
  });

  it("shows only Layout topics from the Layout entry", () => {
    render(<LocaleProvider><UserGuideButton scope="layout" /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Layout guide" }));
    const guide = within(screen.getByRole("dialog", { name: "Layout guide" }));
    expect(guide.getByRole("heading", { name: "Pages & views" })).toBeTruthy();
    expect(guide.queryByRole("button", { name: "1: Import & browse" })).toBeNull();
    fireEvent.click(guide.getByRole("button", { name: "Photo layout" }));
    expect(guide.getByRole("heading", { name: "Fit and crop" })).toBeTruthy();
    fireEvent.click(guide.getByRole("button", { name: "Read & export" }));
    expect(guide.getByRole("heading", { name: "Export PDF" })).toBeTruthy();
    fireEvent.click(guide.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
