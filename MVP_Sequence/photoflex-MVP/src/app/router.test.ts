import { describe, expect, it } from "vitest";
import type { ProjectId, SourceId } from "../contracts";
import { readRoute, routeToHash } from "./router";

describe("readRoute", () => {
  it("畸形百分号编码不会让应用启动崩溃", () => {
    expect(readRoute("#/projects/%")).toEqual({ name: "home" });
    expect(readRoute("#/projects/project-1/sources/%E0%A4%A")).toEqual({ name: "home" });
  });

  it("读写 Table 路由", () => {
    const projectId = "project-1" as ProjectId;
    expect(routeToHash({ name: "table", projectId })).toBe("#/projects/project-1/table");
    expect(readRoute("#/projects/project-1/table")).toEqual({ name: "table", projectId });
  });

  it("保持 Contact Sheet 路由兼容", () => {
    const projectId = "project-1" as ProjectId;
    const sourceId = "source-1" as SourceId;
    expect(routeToHash({ name: "contact-sheet", projectId, sourceId })).toBe(
      "#/projects/project-1/sources/source-1",
    );
  });
});
