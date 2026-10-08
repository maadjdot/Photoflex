import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { readBetaReleaseConfiguration, type BetaReleaseConfiguration } from "./config/betaRelease";
import packageInfo from "./package.json";

function betaReleaseRecord(configuration: BetaReleaseConfiguration): Plugin {
  return {
    name: "photoflex-beta-release-record",
    generateBundle() {
      const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      const sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--", "src", "config", "scripts", "tests", "vite.config.ts", "package.json", "pnpm-lock.yaml"], { encoding: "utf8" }).trim());
      this.emitFile({ type: "asset", fileName: "release.json", source: JSON.stringify({
        appVersion: packageInfo.version, mode: "beta", cloudbaseEnvId: configuration.envId, origin: configuration.origin,
        sourceRevision, sourceDirty, builtAt: new Date().toISOString(),
      }, null, 2) + "\n" });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  let revision = process.env.VITE_SITE_VERSION || packageInfo.version;
  try { revision = process.env.VITE_SITE_VERSION || execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* Local builds may not have Git access. */ }
  const define = { __SITE_VERSION__: JSON.stringify(revision) };
  if (command !== "build" || mode !== "beta") return { plugins: [react()], define };
  const environment = loadEnv("beta", process.cwd(), "VITE_");
  const development = loadEnv("development", process.cwd(), "VITE_");
  const configuration = readBetaReleaseConfiguration(environment, development.VITE_CLOUDBASE_ENV_ID);
  return {
    plugins: [react(), betaReleaseRecord(configuration)],
    define: { ...define, "import.meta.env.VITE_CLOUDBASE_ENV_ID": JSON.stringify(configuration.envId) },
    build: { outDir: "dist-beta" },
  };
});
