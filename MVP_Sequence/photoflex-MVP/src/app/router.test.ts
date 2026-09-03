import { describe, expect, it } from "vitest";
import type { ProjectId, SequenceId, SourceId, VersionId } from "../contracts";
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

  it("reads Sequence and Sequence Compare routes", () => {
    const projectId = "project-1" as ProjectId;
    const left = "sequence-a" as SequenceId;
    const right = "sequence-b" as SequenceId;
    expect(routeToHash({ name: "sequence", projectId, sequenceId: left })).toBe("#/projects/project-1/sequences/sequence-a");
    expect(readRoute("#/projects/project-1/sequences/sequence-a")).toEqual({ name: "sequence", projectId, sequenceId: left });
    expect(readRoute("#/projects/project-1/sequences/compare/sequence-a/sequence-b")).toEqual({ name: "sequence-compare", projectId, leftSequenceId: left, rightSequenceId: right });
  });

  it("reads Version Compare and open-as-draft routes", () => {
    const projectId = "project-1" as ProjectId;
    const sequenceId = "sequence-a" as SequenceId;
    const left = "version-a" as VersionId;
    const right = "version-b" as VersionId;
    expect(routeToHash({ name: "version-compare", projectId, leftVersionId: left, rightVersionId: right })).toBe("#/projects/project-1/versions/compare/version-a/version-b");
    expect(readRoute("#/projects/project-1/versions/compare/version-a/version-b")).toEqual({ name: "version-compare", projectId, leftVersionId: left, rightVersionId: right });
    expect(readRoute("#/projects/project-1/sequences/sequence-a?openVersion=version-b")).toEqual({ name: "sequence", projectId, sequenceId, openVersionId: right });
  });
});
