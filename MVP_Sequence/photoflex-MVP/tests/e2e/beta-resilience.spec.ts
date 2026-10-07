import { expect, test } from "@playwright/test";

test("a failed font request recovers in the same text box without reloading", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  let failed = true, requests = 0;
  await page.route(/ArchitectsDaughter-Regular\.woff2$/, async (route) => {
    requests++;
    if (failed) await route.abort("internetdisconnected"); else await route.continue();
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const module = "/tests/helpers/betaResilienceBrowserFixture.tsx";
    const fixture = await import(/* @vite-ignore */ module); fixture.mountFontRetryFixture();
  });
  const root = page.locator("#font-retry-fixture");
  await expect(root.getByRole("alert")).toContainText("Text is retained");
  await expect(root.locator(".layout-text-line")).toHaveCount(0);
  failed = false;
  await root.getByRole("button", { name: "Retry" }).click();
  await expect(root.locator(".layout-text-line")).toContainText("Recovered caption 上海");
  await expect(root.getByRole("alert")).toHaveCount(0);
  expect(requests).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("quota failures in both image caches preserve displayed previews and project saves", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(async () => {
    const module = "/tests/helpers/betaResilienceBrowserFixture.tsx";
    return (await import(/* @vite-ignore */ module)).mountCacheQuotaFixture();
  })).toEqual({ saved: true, originalUnchanged: true });
  const images = page.locator("#cache-quota-fixture img");
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth === 96))).toBe(true);
});
