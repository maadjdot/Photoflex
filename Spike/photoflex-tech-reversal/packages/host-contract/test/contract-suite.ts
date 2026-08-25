import { describe, expect, it } from "vitest";

export interface WorkspaceContractSubject {
  open(payload: { projectId: string }): Promise<{ projectId: string; revision: number }>;
  autosave(payload: { projectId: string; expectedRevision: number; bytes: Uint8Array }): Promise<{ revision: number; sha256: string }>;
}

export function workspaceContractSuite(name: string, createSubject: () => Promise<WorkspaceContractSubject>): void {
  describe(`${name} ProjectWorkspace contract`, () => {
    it("opens a stable project identity and advances revisions exactly once", async () => {
      const subject = await createSubject();
      await expect(subject.open({ projectId: "contract-project" })).resolves.toEqual({ projectId: "contract-project", revision: 0 });
      const saved = await subject.autosave({ projectId: "contract-project", expectedRevision: 0, bytes: new TextEncoder().encode("snapshot-one") });
      expect(saved).toMatchObject({ revision: 1 });
      expect(saved.sha256).toMatch(/^[a-f0-9]{64}$/);
      await expect(subject.open({ projectId: "contract-project" })).resolves.toEqual({ projectId: "contract-project", revision: 1 });
    });

    it("rejects stale revisions rather than overwriting newer state", async () => {
      const subject = await createSubject();
      await subject.open({ projectId: "revision-project" });
      await subject.autosave({ projectId: "revision-project", expectedRevision: 0, bytes: new Uint8Array([1]) });
      await expect(subject.autosave({ projectId: "revision-project", expectedRevision: 0, bytes: new Uint8Array([2]) })).rejects.toThrow("Revision conflict");
    });

    it("rejects path-shaped project IDs", async () => {
      const subject = await createSubject();
      await expect(subject.open({ projectId: "../escape" })).rejects.toThrow("Invalid project ID");
    });
  });
}
