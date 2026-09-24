import type { LayoutTextBox } from "../../contracts";
import { NOTO_SANS_SC_RANGES } from "./notoSansScCoverage";

export interface LaidOutTextLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface LayoutTextResult {
  readonly lines: readonly LaidOutTextLine[];
  readonly lineHeightPt: number;
  readonly overflowLine: number | null;
  readonly missing: readonly { readonly character: string; readonly index: number }[];
}

export function notoSansScHasGlyph(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) return false;
  let low = 0, high = NOTO_SANS_SC_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end] = NOTO_SANS_SC_RANGES[middle];
    if (code < start) high = middle - 1;
    else if (code > end) low = middle + 1;
    else return true;
  }
  return false;
}

/** All coordinates and measurements are in physical page points. */
export function layoutText(box: LayoutTextBox, measure: (text: string, fontSizePt: number) => number,
  hasGlyph: (character: string) => boolean = notoSansScHasGlyph): LayoutTextResult {
  const lines: LaidOutTextLine[] = [];
  const missing: { character: string; index: number }[] = [];
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
    if (!hasGlyph(character)) missing.push({ character, index });
    const candidate = line + character;
    if (line && measure(candidate, box.style.fontSizePt) > box.rect.width) {
      push(index);
    }
    line += character;
    index += character.length;
  }
  if (text.length) push(text.length);
  const overflowLine = lines.findIndex((line, index) => (index + 1) * lineHeightPt > box.rect.height + .001
    || measure(line.text, box.style.fontSizePt) > box.rect.width + .001);
  return { lines, lineHeightPt, overflowLine: overflowLine < 0 ? null : overflowLine, missing };
}
