import { describe, expect, it } from "vitest";
import { assertNarrowHostContract } from "../src/index";

describe("host capability boundary", () => {
  it("rejects generic read/write/invoke/shell surfaces", () => {
    for (const name of ["read", "write", "invoke", "executeShell"]) {
      expect(() => assertNarrowHostContract({ [name]: () => undefined })).toThrow(`Forbidden shallow host capability: ${name}`);
    }
  });
});
