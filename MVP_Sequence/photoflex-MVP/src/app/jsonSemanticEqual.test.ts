import { expect, it } from "vitest";
import { jsonSemanticEqual } from "./jsonSemanticEqual";

it("treats reordered JSON object keys as the same snapshot without ignoring array order", () => {
  expect(jsonSemanticEqual({ project: { id: "a", name: "Film" }, versions: [1, 2] }, { versions: [1, 2], project: { name: "Film", id: "a" } })).toBe(true);
  expect(jsonSemanticEqual({ versions: [1, 2] }, { versions: [2, 1] })).toBe(false);
});
