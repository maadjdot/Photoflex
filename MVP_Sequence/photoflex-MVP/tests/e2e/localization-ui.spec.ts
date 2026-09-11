import { expect, test } from "@playwright/test";

test("Chinese UI persists and the language control fits the app header", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const language = page.getByRole("group", { name: "Language" });
  await language.getByRole("button", { name: "中文" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("group", { name: "语言" }).getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "你的项目" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "开始你的摄影旅程" })).toBeVisible();
  await expect(page.getByRole("button", { name: "创建项目", exact: true })).toBeVisible();

  const headerBox = await page.locator(".topbar").boundingBox();
  const switcherBox = await page.getByRole("group", { name: "语言" }).boundingBox();
  expect(switcherBox!.x + switcherBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width);
  expect(switcherBox!.y).toBeGreaterThanOrEqual(headerBox!.y);
  expect(switcherBox!.y + switcherBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height);

  await page.screenshot({ path: testInfo.outputPath("home-zh-1280x800.png"), fullPage: true });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

  await page.setViewportSize({ width: 1024, height: 800 });
  const compactHeader = await page.locator(".topbar").boundingBox();
  const compactSwitcher = await page.getByRole("group", { name: "语言" }).boundingBox();
  expect(compactSwitcher!.x + compactSwitcher!.width).toBeLessThanOrEqual(compactHeader!.x + compactHeader!.width);
  await page.screenshot({ path: testInfo.outputPath("home-zh-1024x800.png"), fullPage: true });
});
