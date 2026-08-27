// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { App } from "./App";

describe("M1 app", () => {
  beforeEach(() => {
    window.location.hash = "#/";
  });
  afterEach(() => cleanup());

  it("显示项目首页", async () => {
    render(
      <App
        dependencies={{
          projectStore: new MemoryProjectStore(),
          photoSource: new MemoryPhotoSource(),
        }}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Your Projects" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /New project/i }).length).toBeGreaterThan(0);
  });

  it("创建项目时要求名称与照片文件夹", async () => {
    render(
      <App
        dependencies={{
          projectStore: new MemoryProjectStore(),
          photoSource: new MemoryPhotoSource(),
        }}
      />,
    );
    await screen.findByRole("heading", { name: "Your Projects" });
    screen.getAllByRole("button", { name: /New project/i })[0].click();
    const createButton = await screen.findByRole("button", { name: "Create project" });

    // Figma 交互要求资料齐全前不可提交，因此这里验证禁用状态，而不是提交后的报错。
    expect((createButton as HTMLButtonElement).disabled).toBe(true);
  });
});
