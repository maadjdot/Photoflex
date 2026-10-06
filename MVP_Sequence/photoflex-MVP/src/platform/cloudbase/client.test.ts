import { describe, expect, it } from "vitest";
import { readCloudBaseConfiguration } from "./client";

describe("CloudBase configuration", () => {
  it("requires a nonempty environment ID", () => {
    expect(readCloudBaseConfiguration({})).toBeUndefined();
    expect(readCloudBaseConfiguration({ VITE_CLOUDBASE_ENV_ID: "   " })).toBeUndefined();
    expect(readCloudBaseConfiguration({ VITE_CLOUDBASE_ENV_ID: " photoflex-dev " })).toEqual({ envId: "photoflex-dev" });
  });
});
