// @vitest-environment jsdom

import { expect, it } from "vitest";
import { applyFontSizeToRange, sequenceTextHtml } from "./sequenceTextFormatting";

it("keeps only text, line breaks, and bounded font sizes", () => {
  const html = sequenceTextHtml("fallback", 32, '<img src=x onerror=alert(1)><span style="font-size: 999px; color:red">Title</span><script>bad()</script>');
  expect(html).toBe('<span style="font-size: 120px;">Title</span>');
});

it("applies a font size only to the selected text", () => {
  const editor = document.createElement("div");
  editor.textContent = "Small Large";
  const range = document.createRange();
  range.setStart(editor.firstChild!, 6);
  range.setEnd(editor.firstChild!, 11);
  applyFontSizeToRange(editor, range, 48);
  expect(editor.innerHTML).toBe('Small <span style="font-size: 48px;">Large</span>');
});
