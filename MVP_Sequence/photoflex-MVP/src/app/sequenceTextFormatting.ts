const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 120;

export function sequenceTextHtml(text: string, fontSize: number, html?: string): string {
  if (!html) return wrapText(text, fontSize);
  const template = document.createElement("template");
  template.innerHTML = html;
  const output = document.createElement("div");
  [...template.content.childNodes].forEach((node) => appendSafeNode(node, output));
  return output.innerHTML || wrapText(text, fontSize);
}

export function applyFontSizeToRange(editor: HTMLElement, range: Range | undefined, fontSize: number): Range {
  const size = clampFontSize(fontSize);
  const activeRange = range && editor.contains(range.commonAncestorContainer) ? range.cloneRange() : document.createRange();
  if (!range || !editor.contains(range.commonAncestorContainer) || range.collapsed) activeRange.selectNodeContents(editor);
  const span = document.createElement("span");
  span.style.fontSize = `${size}px`;
  span.append(activeRange.extractContents());
  activeRange.insertNode(span);
  const next = document.createRange();
  next.selectNodeContents(span);
  return next;
}

export function clampFontSize(value: number): number {
  return Math.round(Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Number.isFinite(value) ? value : 32)));
}

function appendSafeNode(node: Node, target: HTMLElement): void {
  if (node.nodeType === Node.TEXT_NODE) { target.append(document.createTextNode(node.textContent ?? "")); return; }
  if (!(node instanceof HTMLElement)) return;
  if (/^(SCRIPT|STYLE|IMG|IFRAME|OBJECT)$/.test(node.tagName)) return;
  if (node.tagName === "BR") { target.append(document.createElement("br")); return; }
  const isBlock = /^(DIV|P)$/.test(node.tagName) && target.childNodes.length > 0;
  if (isBlock) target.append(document.createElement("br"));
  const rawSize = Number.parseFloat(node.style.fontSize);
  const destination = Number.isFinite(rawSize) ? document.createElement("span") : target;
  if (destination !== target) {
    destination.style.fontSize = `${clampFontSize(rawSize)}px`;
    target.append(destination);
  }
  [...node.childNodes].forEach((child) => appendSafeNode(child, destination));
}

function wrapText(text: string, fontSize: number): string {
  const span = document.createElement("span");
  span.style.fontSize = `${clampFontSize(fontSize)}px`;
  text.split(/\r?\n/).forEach((line, index) => {
    if (index) span.append(document.createElement("br"));
    span.append(document.createTextNode(line));
  });
  return span.outerHTML;
}
