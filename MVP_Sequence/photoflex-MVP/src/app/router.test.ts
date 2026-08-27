import { describe, expect, it } from "vitest";
import { readRoute } from "./router";

describe("readRoute", () => {
  it("畸形百分号编码不会让应用启动崩溃", () => {
    expect(readRoute("#/projects/%")).toEqual({ name: "home" });
    expect(readRoute("#/projects/project-1/sources/%E0%A4%A")).toEqual({ name: "home" });
  });
});
