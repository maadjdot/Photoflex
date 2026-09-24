import type { LayoutTextBox } from "../../contracts";

export interface LaidOutTextLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface LayoutTextResult {
  readonly lines: readonly LaidOutTextLine[];
  readonly lineHeightPt: number;
}

/** All coordinates and measurements are in physical page points. */
export function layoutText(box: LayoutTextBox, measure: (text: string, fontSizePt: number) => number): LayoutTextResult {
  const lines: LaidOutTextLine[] = [];
  const lineHeightPt = box.style.fontSizePt * box.style.lineHeight;
  const text = box.text;
  let line = "", start = 0;
  const push = (end: number) => { lines.push({ text: line, start, end }); line = ""; start = end; };
  for (let index = 0; index < text.length;) {
    const character = String.fromCodePoint(text.codePointAt(index)!);
    if (character === "\n" || character === "\r") {
      push(index);
      index += character === "\r" && text[index + 1] === "\n" ? 2 : 1;
      start = index;
      continue;
    }
    const candidate = line + character;
    if (line && measure(candidate, box.style.fontSizePt) > box.rect.width) {
      push(index);
    }
    line += character;
    index += character.length;
  }
  if (text.length) push(text.length);
  return { lines, lineHeightPt };
}
