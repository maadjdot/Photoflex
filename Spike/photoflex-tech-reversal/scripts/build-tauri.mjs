import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const app = join(root, "apps", "tauri-shell");
const cli = join(app, "node_modules", "@tauri-apps", "cli", "tauri.js");
const bundle = process.platform === "win32" ? "nsis" : process.platform === "darwin" ? "dmg" : "appimage";
const result = spawnSync(process.execPath, [cli, "build", "--bundles", bundle], { cwd: root, stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
