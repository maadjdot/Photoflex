import { expect, test } from "@playwright/test";

test("serif text keeps its visible glyphs inside justified and right-aligned frames at different zooms", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const reactModule = "/node_modules/.vite/deps/react.js";
    const domModule = "/node_modules/.vite/deps/react-dom_client.js";
    const viewModule = "/src/app/LayoutTextView.tsx";
    const cssModule = "/src/styles/layout-workspace.css";
    const { createElement } = (await import(/* @vite-ignore */ reactModule)).default;
    const { createRoot } = (await import(/* @vite-ignore */ domModule)).default;
    const { LayoutTextView } = await import(/* @vite-ignore */ viewModule);
    await import(/* @vite-ignore */ cssModule);
    const host = document.createElement("div");
    host.id = "text-bounds-fixture";
    host.style.cssText = "position:fixed;inset:0;z-index:999;background:white;padding:24px;overflow:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:20px;align-content:start";
    document.body.append(host);
    const children = [];
    for (const family of ["ancizar-serif", "eb-garamond", "noto-serif"]) {
      for (const scale of [.57, .89, 1.23]) {
        for (const fontStyle of ["normal", "italic"]) {
          for (const align of ["justify", "right"]) {
            const box = { kind: "text-box", id: `${family}-${scale}-${fontStyle}-${align}`, text: "Exploring Hong Kong with work but playing and with all friends.",
              rect: { x: 0, y: 0, width: 160, height: 220 },
              style: { fontFamily: family, fontStyle, fontSizePt: 18, lineHeight: 1.4, color: "#171513", align } };
            children.push(createElement("div", { key: box.id },
              createElement("small", null, `${family} · ${scale} · ${fontStyle} · ${align}`),
              createElement("div", { className: "text-bounds-frame", "data-case": box.id,
                style: { width: 160 * scale - .6, height: 220 * scale, overflow: "hidden", outline: "1px solid #aaa", marginTop: 8 } },
              createElement(LayoutTextView, { box, scale }))));
          }
        }
      }
    }
    createRoot(host).render(createElement("div", { style: { display: "contents" } }, ...children));
  });
  const fixture = page.locator("#text-bounds-fixture");
  await expect(fixture.locator(".text-bounds-frame")).toHaveCount(36);
  await expect(fixture.getByRole("status")).toHaveCount(0);
  const overflows = await fixture.evaluate((host) => {
    const context = document.createElement("canvas").getContext("2d")!;
    const failures: unknown[] = [];
    for (const frame of host.querySelectorAll<HTMLElement>(".text-bounds-frame")) {
      const bounds = frame.getBoundingClientRect();
      for (const line of frame.querySelectorAll<HTMLElement>(".layout-text-line")) {
        for (const span of [line.firstElementChild, line.lastElementChild] as HTMLElement[]) {
          if (!span) continue;
          const style = getComputedStyle(span);
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const ink = context.measureText(span.textContent!);
          const rect = span.getBoundingClientRect();
          const left = bounds.left - (rect.left - ink.actualBoundingBoxLeft);
          const right = rect.left + ink.actualBoundingBoxRight - bounds.right;
          if (left > .1 || right > .1) failures.push({ case: frame.dataset.case, text: line.textContent, left, right });
        }
      }
    }
    return failures;
  });
  expect(overflows).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("serif-text-bounds.png"), fullPage: true });
});
