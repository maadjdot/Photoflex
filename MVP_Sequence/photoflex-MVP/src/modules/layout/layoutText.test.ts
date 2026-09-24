import { describe, expect, it } from "vitest";
import type { LayoutTextBox } from "../../contracts";
import { layoutText, notoSansScHasGlyph } from "./layoutText";

const box: LayoutTextBox = {
  kind: "text-box", id: "text-1" as LayoutTextBox["id"],
  rect: { x: 0, y: 0, width: 30, height: 24 }, text: "上海街景\nCafé",
  style: { fontFamily: "noto-sans-sc", fontSizePt: 10, lineHeight: 1.2, color: "#171513", align: "left" },
};

describe("Layout text", () => {
  it("uses explicit newlines, wraps by measured width, and locates overflow", () => {
    const result = layoutText(box, (text) => [...text].length * 10);
    expect(result.lines.map((line) => line.text)).toEqual(["上海街", "景", "Caf", "é"]);
    expect(result.lines.map((line) => line.start)).toEqual([0, 3, 5, 8]);
    expect(result.overflowLine).toBe(2);
    expect(result.missing).toEqual([]);
  });

  it("identifies unsupported glyphs from the bundled font and does not silently substitute", () => {
    expect(notoSansScHasGlyph("上")).toBe(true);
    expect(notoSansScHasGlyph("é")).toBe(true);
    expect(notoSansScHasGlyph("🦄")).toBe(false);
    const result = layoutText({ ...box, text: "A🦄" }, () => 10);
    expect(result.missing).toEqual([{ character: "🦄", index: 1 }]);
  });

  it("keeps source positions through CRLF line breaks", () => {
    const result = layoutText({ ...box, text: "上\r\n🦄" }, () => 10);
    expect(result.lines.map((line) => line.start)).toEqual([0, 3]);
    expect(result.missing).toEqual([{ character: "🦄", index: 3 }]);
  });
});
