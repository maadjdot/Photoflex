import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { cpus, freemem, hostname, platform, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type EnvironmentValues = Record<string, string | number | boolean | null>;

export interface DriftReport {
  changedKeys: string[];
  requiredReruns: string[];
  cohortCompatible: boolean;
}

const RERUN_MATRIX: Record<string, string[]> = {
  webview2: ["T-01", "T-02", "T-06", "WB-01", "MIX-01", "SOAK"],
  edge: ["T-01", "T-02", "T-06", "WB-01", "MIX-01", "SOAK"],
  electron: ["Electron:T-01", "Electron:T-02", "Electron:T-06", "Electron:WB-01", "Electron:MIX-01", "Electron:SOAK"],
  chromium: ["Electron:T-01", "Electron:T-02", "Electron:T-06", "Electron:WB-01", "Electron:MIX-01", "Electron:SOAK"],
  gpuDriver: ["T-01", "T-02", "T-06", "WB-01", "MIX-01"],
  display: ["T-01", "T-02", "T-06", "WB-01", "MIX-01"],
  tauriCore: ["Tauri:contracts", "T-03", "T-05", "PKG-01", "Tauri:performance"],
  tauriCli: ["Tauri:contracts", "T-03", "T-05", "PKG-01", "Tauri:performance"],
  node: ["frontend:all", "Electron:all"],
  pnpm: ["frontend:all", "Electron:all"],
  lockfileHash: ["frontend:all", "Electron:all", "Tauri:build"],
  rust: ["Rust:all", "Tauri:build", "DB-01", "T-04", "T-03"],
  cargo: ["Rust:all", "Tauri:build", "DB-01", "T-04", "T-03"],
  exiftoolHash: ["T-03", "file-safety"],
  osVersion: ["platform:all"],
  fixtureHash: ["fixture-dependent:all"],
  sourceHash: ["implementation:all"]
};

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compareEnvironments(previous: EnvironmentValues, current: EnvironmentValues): DriftReport {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const changedKeys = [...keys].filter((key) => !sameValue(previous[key], current[key])).sort();
  const reruns = new Set<string>();
  for (const key of changedKeys) {
    for (const suite of RERUN_MATRIX[key] ?? ["manual-impact-review"]) reruns.add(suite);
  }
  return { changedKeys, requiredReruns: [...reruns].sort(), cohortCompatible: changedKeys.length === 0 };
}

function command(file: string, args: string[], cwd: string, extraEnvironment: Record<string, string> = {}): string | null {
  try {
    return execFileSync(file, args, { cwd, env: { ...process.env, ...extraEnvironment }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function hashFile(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function packageVersion(path: string): string | null {
  if (!existsSync(path)) return null;
  return (JSON.parse(readFileSync(path, "utf8")) as { version?: string }).version ?? null;
}

function hashSourceTree(root: string): string {
  const excludedDirectories = new Set(["node_modules", "dist", "target", ".git"]);
  const excludedRelativePrefixes = ["fixtures/generated/", "results/"];
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const absolute = join(directory, entry);
      const relative = absolute.slice(root.length + 1).replaceAll("\\", "/");
      if (statSync(absolute).isDirectory()) {
        if (!excludedDirectories.has(entry) && !excludedRelativePrefixes.some((prefix) => `${relative}/`.startsWith(prefix))) walk(absolute);
      } else if (entry !== "environment-lock.json" && !excludedRelativePrefixes.some((prefix) => relative.startsWith(prefix))) {
        files.push(relative);
      }
    }
  };
  walk(root);
  const hash = createHash("sha256");
  for (const relative of files.sort()) hash.update(relative).update("\0").update(readFileSync(join(root, relative))).update("\0");
  return hash.digest("hex");
}

export function spikeRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function captureEnvironment(root = spikeRoot()): EnvironmentValues {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const powerShell = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const edgeVersion = command(powerShell, ["-NoProfile", "-Command", "(Get-Item 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe').VersionInfo.ProductVersion"], root);
  const webviewVersion = command(powerShell, ["-NoProfile", "-Command", "$binary = Get-ChildItem 'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application\\*\\msedgewebview2.exe' -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Name } -Descending | Select-Object -First 1; if ($binary) { $binary.VersionInfo.ProductVersion }"], root);
  const gpu = command(powerShell, ["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name + '|' + $_.DriverVersion }"], root);
  const fixtureManifest = join(root, "fixtures", "generated", "manifest.json");
  const lockfile = join(root, "pnpm-lock.yaml");
  const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { packageManager?: string };
  const electronPackage = join(root, "apps", "electron-shell", "node_modules", "electron", "package.json");
  const electronBinary = join(root, "apps", "electron-shell", "node_modules", "electron", "dist", platform() === "win32" ? "electron.exe" : "electron");
  const tauriCliPackage = join(root, "apps", "tauri-shell", "node_modules", "@tauri-apps", "cli", "package.json");
  const localExifTool = join(root, "tools", "exiftool", platform() === "win32" ? "exiftool.exe" : "exiftool");
  const chromiumVersion = existsSync(electronBinary)
    ? command(electronBinary, ["-e", "process.stdout.write(process.versions.chrome ?? '')"], root, { ELECTRON_RUN_AS_NODE: "1" })
    : null;
  const values: EnvironmentValues = {
    osVersion: `${platform()} ${release()} ${process.arch}`,
    hostname: hostname(),
    cpu: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryAtCaptureBytes: freemem(),
    gpuDriver: gpu,
    display: process.env.PHOTOFLEX_DISPLAY_PROFILE ?? "UNRECORDED:set PHOTOFLEX_DISPLAY_PROFILE",
    edge: edgeVersion,
    webview2: webviewVersion,
    electron: packageVersion(electronPackage),
    chromium: process.env.PHOTOFLEX_ELECTRON_CHROMIUM ?? chromiumVersion ?? "CAPTURE_FROM_ELECTRON_DIAGNOSTICS",
    node: process.version,
    pnpm: rootPackage.packageManager?.startsWith("pnpm@") ? rootPackage.packageManager.slice("pnpm@".length) : command(platform() === "win32" ? "corepack.cmd" : "corepack", ["pnpm", "--version"], root),
    rust: command("rustc", ["--version"], root),
    cargo: command("cargo", ["--version"], root),
    tauriCli: packageVersion(tauriCliPackage),
    tauriCore: "2.11.5 (Cargo.toml exact target)",
    exiftoolVersion: command(existsSync(localExifTool) ? localExifTool : "exiftool", ["-ver"], root),
    exiftoolHash: hashFile(process.env.PHOTOFLEX_EXIFTOOL_PATH ?? localExifTool),
    lockfileHash: hashFile(lockfile),
    fixtureHash: hashFile(fixtureManifest),
    sourceHash: hashSourceTree(root),
    gitCommit: command("git", ["rev-parse", "HEAD"], root),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    capturedAt: new Date().toISOString()
  };
  const cohortMaterial = Object.fromEntries(Object.entries(values).filter(([key]) => key !== "capturedAt" && key !== "freeMemoryAtCaptureBytes"));
  values.environmentId = createHash("sha256").update(JSON.stringify(cohortMaterial)).digest("hex").slice(0, 16);
  return values;
}
