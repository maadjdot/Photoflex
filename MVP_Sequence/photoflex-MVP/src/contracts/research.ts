import type { PhotoId, ProjectId, Result } from "./ids";
import type { WorktableMemo, WorktablePoint } from "./worktable";
import type { ProjectWorkspace } from "./persistence";

export interface ResearchNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: ResearchNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface ResearchNoteSummary {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly updatedAt: string;
  readonly photoIds?: readonly PhotoId[];
  readonly imageCount?: number;
  readonly cover?: Pick<ResearchImage, "kind" | "id">;
}

export interface ResearchNote extends ResearchNoteSummary {
  readonly content: ResearchNode;
  readonly version: number;
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

export type ResearchImage =
  | { kind: "project"; id: PhotoId; caption: string }
  | { kind: "research"; id: string; caption: string };

export interface ResearchMaterialSummary {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly name: string;
}

export interface ResearchMaterial extends ResearchMaterialSummary {
  readonly mime: string;
  readonly base64: string;
}

export interface ResearchAnchor {
  readonly start: { readonly blockId: string; readonly offset: number };
  readonly end: { readonly blockId: string; readonly offset: number };
  readonly quote: { readonly exact: string; readonly prefix: string; readonly suffix: string };
  readonly wholeBlock?: boolean;
}

export interface ResearchExtract {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly noteId: string;
  readonly anchor: ResearchAnchor;
  readonly snapshot: string;
  readonly acceptedVersion: number;
  readonly note: string;
  readonly dismissedVersion?: number;
  readonly deletedAt?: string;
}

export type ResearchRecord =
  | ({ kind: "note" } & ResearchNote)
  | ({ kind: "material" } & ResearchMaterial)
  | ({ kind: "extract" } & ResearchExtract);

export type ResearchError = "unavailable" | "missing" | "conflict" | "invalid-selection";
export type ResearchResult<T> = Promise<Result<T, ResearchError>>;

export interface ResearchNotePlacement {
  readonly note: ResearchNote;
  readonly workspace: ProjectWorkspace;
  readonly cardId: string;
}

export interface ResearchStore {
  listNotes(projectId: ProjectId, query?: string): ResearchResult<readonly ResearchNoteSummary[]>;
  loadNote(projectId: ProjectId, id: string): ResearchResult<ResearchNote>;
  saveNote(note: ResearchNote): ResearchResult<ResearchNote>;
  deleteNote(projectId: ProjectId, id: string): ResearchResult<ProjectWorkspace>;
  placeNote(note: ResearchNote, center: WorktablePoint): ResearchResult<ResearchNotePlacement>;
  listMaterials(projectId: ProjectId): ResearchResult<readonly ResearchMaterialSummary[]>;
  loadMaterial(projectId: ProjectId, id: string): ResearchResult<ResearchMaterial>;
  addMaterials(projectId: ProjectId, materials: readonly ResearchMaterial[]): ResearchResult<void>;
  listExtracts(projectId: ProjectId, noteId?: string): ResearchResult<readonly ResearchExtract[]>;
  saveExtract(note: ResearchNote, extract: ResearchExtract, placement?: WorktableMemo): ResearchResult<void>;
  updateExtract(note: ResearchNote, previous: ResearchExtract, next: ResearchExtract): ResearchResult<void>;
}
