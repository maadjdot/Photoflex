import { expect, test } from "@playwright/test";

test("M1 Home 可以启动并提供新建项目入口", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New project" }).first()).toBeVisible();
});
