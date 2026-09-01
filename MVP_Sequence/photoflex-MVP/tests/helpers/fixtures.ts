import type {
  CreateProjectInput,
  ProjectId,
  SequenceId,
  SequenceVersion,
  VersionId,
} from "../../src/contracts";

export const PROJECT_ID = "project-1" as ProjectId;
export const VERSION_ID = "version-1" as VersionId;

export const PROJECT_INPUT: CreateProjectInput = {
  id: PROJECT_ID,
  name: "测试项目",
  createdAt: "2026-08-26T08:00:00.000Z",
};

export const VERSION: SequenceVersion = {
  id: VERSION_ID,
  projectId: PROJECT_ID,
  sequenceId: "sequence-1" as SequenceId,
  name: "初版",
  itemCount: 0,
  items: [],
  segments: [],
  readingUnits: [],
  createdAt: "2026-08-26T08:10:00.000Z",
};
