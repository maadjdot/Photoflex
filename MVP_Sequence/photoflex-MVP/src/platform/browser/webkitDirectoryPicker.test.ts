// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { pickWebkitDirectory } from "./webkitDirectoryPicker";

afterEach(() => vi.restoreAllMocks());

describe("webkitdirectory fallback", () => {
  it("opens a folder input and exposes the selected files through the directory interface", async () => {
    const file = new File(["photo"], "one.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "webkitRelativePath", { value: "Photos/Nested/one.jpg" });
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      expect(this.type).toBe("file");
      expect(this.multiple).toBe(true);
      expect(this.hasAttribute("webkitdirectory")).toBe(true);
      Object.defineProperty(this, "files", { configurable: true, value: [file] });
      this.dispatchEvent(new Event("change"));
    });

    const directory = await pickWebkitDirectory();
    const nested = await directory.getDirectoryHandle("Nested");
    expect(await (await nested.getFileHandle("one.jpg")).getFile()).toBe(file);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("treats a cancelled picker as a cancellation", async () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event("cancel"));
    });
    await expect(pickWebkitDirectory()).rejects.toMatchObject({ name: "AbortError" });
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
