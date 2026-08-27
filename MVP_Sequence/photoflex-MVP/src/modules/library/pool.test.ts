import { describe, expect, it } from "vitest";
import type { PhotoId } from "../../contracts";
import { addToPool, removeFromPool } from "./pool";

const photo = (id: string) => id as PhotoId;

describe("Project Pool", () => {
  it("按请求顺序添加照片并幂等跳过已存在照片", () => {
    const result = addToPool([photo("a")], [photo("b"), photo("a"), photo("c")]);

    expect(result).toEqual({
      ids: [photo("a"), photo("b"), photo("c")],
      added: 2,
      existing: 1,
    });
  });

  it("移除照片时不影响其他照片的顺序", () => {
    expect(removeFromPool([photo("a"), photo("b"), photo("c")], [photo("b")])).toEqual([
      photo("a"),
      photo("c"),
    ]);
  });
});
