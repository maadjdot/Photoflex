import { describe, expect, it } from "vitest";
import { DEVELOPMENT_CLOUDBASE_ENV_ID, readBetaReleaseConfiguration } from "../../config/betaRelease";
import { resolveConfig } from "vite";

const valid = { VITE_BETA_CLOUDBASE_ENV_ID: "photoflex-beta-test", VITE_BETA_ORIGIN: "https://beta.example.com/" };

describe("Beta release configuration", () => {
  it("requires an explicit Beta environment rather than a generic or production ID", () => {
    expect(() => readBetaReleaseConfiguration({ VITE_CLOUDBASE_ENV_ID: DEVELOPMENT_CLOUDBASE_ENV_ID })).toThrow("VITE_BETA_CLOUDBASE_ENV_ID");
  });
  it("rejects the documented development environment", () => {
    expect(() => readBetaReleaseConfiguration({ ...valid, VITE_BETA_CLOUDBASE_ENV_ID: DEVELOPMENT_CLOUDBASE_ENV_ID })).toThrow("development");
  });
  it("rejects the current configured development environment as well", () => {
    expect(() => readBetaReleaseConfiguration(valid, valid.VITE_BETA_CLOUDBASE_ENV_ID)).toThrow("development");
  });
  it("rejects placeholders and missing deployment origins", () => {
    expect(() => readBetaReleaseConfiguration({ ...valid, VITE_BETA_CLOUDBASE_ENV_ID: "your-beta-env" })).toThrow("explicit");
    expect(() => readBetaReleaseConfiguration({ VITE_BETA_CLOUDBASE_ENV_ID: valid.VITE_BETA_CLOUDBASE_ENV_ID })).toThrow("VITE_BETA_ORIGIN");
  });
  it.each(["http://beta.example.com", "https://user:secret@beta.example.com", "https://beta.example.com/path", "https://beta.example.com/?env=dev", "https://localhost"])("rejects an invalid deployment origin: %s", (origin) => {
    expect(() => readBetaReleaseConfiguration({ ...valid, VITE_BETA_ORIGIN: origin })).toThrow("HTTPS origin");
  });
  it("normalizes the public Beta target", () => {
    expect(readBetaReleaseConfiguration(valid)).toEqual({ envId: "photoflex-beta-test", origin: "https://beta.example.com" });
  });
  it("leaves ordinary and E2E builds usable without Beta configuration", async () => {
    const config = await resolveConfig({ mode: "e2e" }, "serve");
    expect(config.define?.["import.meta.env.VITE_CLOUDBASE_ENV_ID"]).toBeUndefined();
    expect(config.plugins.some((plugin) => plugin.name === "photoflex-beta-release-record")).toBe(false);
  });
});
