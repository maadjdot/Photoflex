import { spawnSync } from "node:child_process";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const app = join(root, "apps", "electron-shell");
const builder = join(app, "node_modules", "electron-builder", "out", "cli", "cli.js");
const environment = { ...process.env, PATH: `${join(root, "tools")}${delimiter}${process.env.PATH ?? ""}` };
delete environment.ELECTRON_RUN_AS_NODE;
const result = spawnSync(process.execPath, [builder, "--dir"], { cwd: app, env: environment, stdio: "inherit" });
process.exitCode = result.status ?? 1;
