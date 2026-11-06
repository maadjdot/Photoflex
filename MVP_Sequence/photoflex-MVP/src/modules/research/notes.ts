import type { ProjectId } from "../../contracts";
import type { ResearchNode, ResearchStore } from "../../contracts/research";

export function newResearchNote(projectId: ProjectId, title = "", content: ResearchNode = {
  type: "doc", content: [{ type: "paragraph", attrs: { blockId: crypto.randomUUID() } }],
}) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), projectId, title, content, version: 0, createdAt: now, updatedAt: now, deletedAt: null };
}

export function createResearchNote(store: ResearchStore, projectId: ProjectId, title?: string, content?: ResearchNode) {
  return store.saveNote(newResearchNote(projectId, title, content));
}
