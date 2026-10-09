import { describe, expect, it } from "vitest";
import type { LayoutTextBox } from "../../contracts";
import { layoutText } from "./layoutText";

const box: LayoutTextBox = {
  kind: "text-box", id: "text-1" as LayoutTextBox["id"],
  rect: { x: 0, y: 0, width: 30, height: 24 }, text: "上海街景\nCafé",
  style: { fontFamily: "noto-sans-sc", fontSizePt: 10, lineHeight: 1.2, color: "#171513", align: "left" },
};

describe("Layout text", () => {
  it("uses explicit newlines and wraps by measured width", () => {
    const result = layoutText(box, (text) => [...text].length * 10);
    expect(result.lines.map((line) => line.text)).toEqual(["上海街", "景", "Café"]);
    expect(result.lines.map((line) => line.start)).toEqual([0, 3, 5]);
  });

  it("keeps source positions through CRLF line breaks", () => {
    const result = layoutText({ ...box, text: "上\r\n下" }, () => 10);
    expect(result.lines.map((line) => line.start)).toEqual([0, 3]);
    expect(result.lines.map((line) => line.text)).toEqual(["上", "下"]);
  });

  it("wraps English at spaces without leaving spaces at line edges or splitting words", () => {
    const text = "Hello  world, don't split Café.";
    const result = layoutText({ ...box, text, rect: { ...box.rect, width: 130 } }, (value) => [...value].length * 10);
    expect(result.lines.map((line) => line.text)).toEqual(["Hello  world,", "don't split", "Café."]);
    for (const line of result.lines) expect(text.slice(line.start, line.end)).toBe(line.text);
  });

  it("keeps oversized English words whole and wraps mixed Chinese and English", () => {
    const result = layoutText({ ...box, text: "上海 Photography 街景" }, (value) => [...value].length * 10);
    expect(result.lines.map((line) => line.text)).toEqual(["上海", "Photography", "街景"]);
  });

  it("wraps before the last word when glyph ink would exceed the frame", () => {
    const result = layoutText({ ...box, text: "one two three", rect: { ...box.rect, width: 75 } },
      (value) => [...value].length * 10, (value) => [...value].length * 10 + 10);
    expect(result.lines.map((line) => line.text)).toEqual(["one", "two", "three"]);
  });

  it("justifies between whole English words and leaves paragraph endings unstretched", () => {
    const result = layoutText({ ...box, text: "one two three\nlast\n", rect: { ...box.rect, width: 90 },
      style: { ...box.style, align: "justify" } }, (value) => [...value].length * 10);
    expect(result.lines.map((line) => line.text)).toEqual(["one two", "three", "last", ""]);
    expect(result.lines[0].runs).toEqual([{ text: "one ", x: 0 }, { text: "two", x: 60 }]);
    expect(result.lines.slice(1).map((line) => line.runs)).toEqual([
      [{ text: "three", x: 0 }], [{ text: "last", x: 0 }], [{ text: "", x: 0 }],
    ]);
  });

  it("justifies Chinese between characters while keeping closing punctuation attached", () => {
    const result = layoutText({ ...box, text: "上海，街景", rect: { ...box.rect, width: 45 },
      style: { ...box.style, align: "justify" } }, (value) => [...value].length * 10);
    expect(result.lines.map((line) => line.text)).toEqual(["上海，街", "景"]);
    expect(result.lines[0].runs).toEqual([{ text: "上", x: 0 }, { text: "海，", x: 12.5 }, { text: "街", x: 35 }]);
  });

  it.each([["left", 0], ["center", 10], ["right", 20]] as const)("positions %s-aligned text using measured width", (align, x) => {
    const result = layoutText({ ...box, text: "Hi", rect: { ...box.rect, width: 40 }, style: { ...box.style, align } },
      (value) => [...value].length * 10);
    expect(result.lines[0].runs).toEqual([{ text: "Hi", x }]);
  });
});
