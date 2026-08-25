import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const app = join(root, "apps", "electron-shell");
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
const electronCli = join(app, "node_modules", "electron", "cli.js");
const developmentUrl = "http://127.0.0.1:5173";
const vite = spawn(corepack, ["pnpm", "--filter", "@photoflex/benchmark-ui", "dev"], { cwd: root, stdio: "inherit", windowsHide: true });

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  else child.kill("SIGTERM");
}

async function waitForVite() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Vite exited before startup with code ${vite.exitCode}`);
    try {
      const response = await fetch(developmentUrl);
      if (response.ok) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("Vite did not become ready within 60 seconds");
}

let electron;
try {
  await waitForVite();
  electron = spawn(process.execPath, [electronCli, "."], {
    cwd: app,
    env: { ...process.env, PHOTOFLEX_BENCH_URL: developmentUrl },
    stdio: "inherit",
    windowsHide: true,
  });
  process.exitCode = await new Promise((resolveExit, reject) => {
    electron.once("error", reject);
    electron.once("exit", (code) => resolveExit(code ?? 1));
  });
} finally {
  stopProcessTree(electron);
  stopProcessTree(vite);
}
