import type { LayoutTextBox } from "../../contracts";

export interface LaidOutTextLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly paragraphEnd: boolean;
  readonly runs: readonly LayoutTextRun[];
}

export interface LayoutTextRun {
  readonly text: string;
  readonly x: number;
}

export interface LayoutTextResult {
  readonly lines: readonly LaidOutTextLine[];
  readonly lineHeightPt: number;
}

// Latin words (including accents and contractions) stay whole; CJK can wrap between characters.
const textTokens = /\r\n|[\r\n]|[ \t]+|(?:[\p{Script=Latin}\p{M}\p{N}_]+(?:['’\-][\p{Script=Latin}\p{M}\p{N}_]+)*|[^\r\n])[,.;:!?%…，。；：！？、）)\]】》」』]*/gu;

export function layoutTextLineRuns(box: LayoutTextBox, line: Pick<LaidOutTextLine, "text" | "paragraphEnd">,
  measure: (text: string, fontSizePt: number) => number): readonly LayoutTextRun[] {
  const { fontSizePt, align } = box.style;
  const width = box.rect.width;
  const lineWidth = measure(line.text, fontSizePt);
  const x = align === "right" ? width - lineWidth : align === "center" ? (width - lineWidth) / 2 : 0;
  if (align !== "justify" || line.paragraphEnd || lineWidth >= width) return [{ text: line.text, x }];
  const parts: string[] = [];
  for (const token of line.text.matchAll(textTokens)) {
    if (/^[ \t]+$/.test(token[0]) && parts.length) parts[parts.length - 1] += token[0];
    else parts.push(token[0]);
  }
  if (parts.length < 2) return [{ text: line.text, x: 0 }];
  const widths = parts.map((part) => measure(part, fontSizePt));
  const gap = Math.max(0, width - widths.reduce((sum, value) => sum + value, 0)) / (parts.length - 1);
  let runX = 0;
  return parts.map((text, index) => {
    const run = { text, x: runX };
    runX += widths[index] + gap;
    return run;
  });
}

/** All coordinates and measurements are in physical page points. */
export function layoutText(box: LayoutTextBox, measure: (text: string, fontSizePt: number) => number,
  measureFit: (text: string, fontSizePt: number) => number = measure): LayoutTextResult {
  const lines: LaidOutTextLine[] = [];
  const lineHeightPt = box.style.fontSizePt * box.style.lineHeight;
  const text = box.text;
  let line = "", start = 0;
  const push = (paragraphEnd: boolean) => {
    const content = line.replace(/[ \t]+$/u, "");
    const source = { text: content, start, end: start + content.length, paragraphEnd };
    lines.push({ ...source, runs: layoutTextLineRuns(box, source, measure) });
    line = "";
  };
  for (const match of text.matchAll(textTokens)) {
    const token = match[0], index = match.index;
    if (token === "\n" || token === "\r" || token === "\r\n") {
      push(true);
      start = index + token.length;
      continue;
    }
    const candidate = line + token;
    if (!/^[ \t]+$/.test(token) && line.trim() && measureFit(candidate, box.style.fontSizePt) > box.rect.width) {
      push(false);
      start = index;
    }
    line += token;
  }
  if (text.length) push(true);
  return { lines, lineHeightPt };
}
