import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spikeRoot } from "./environment.ts";

export interface FixturePhoto {
  photoId: string;
  relativePath: string;
  proxyPath: string;
  width: number;
  height: number;
  orientation: number;
  colorSpace: "sRGB" | "Display-P3" | "Adobe-RGB";
}

function proxySvg(index: number): string {
  const hue = (index * 47) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="hsl(${hue} 42% 28%)"/><circle cx="${60 + index % 180}" cy="90" r="52" fill="hsl(${(hue + 70) % 360} 68% 62%)"/><path d="M0 220L100 110l55 55 45-35 120 90" fill="hsl(${(hue + 150) % 360} 35% 45%)"/><text x="16" y="28" fill="white" font-family="monospace" font-size="15">PF-${String(index).padStart(4, "0")}</text></svg>`;
}

export async function generateFixtures(root = spikeRoot(), photoCount = 10_000): Promise<{ manifestPath: string; fixtureHash: string }> {
  const generated = join(root, "fixtures", "generated");
  const proxies = join(generated, "proxies");
  await mkdir(proxies, { recursive: true });
  for (let index = 0; index < 64; index += 1) {
    await writeFile(join(proxies, `proxy-${String(index).padStart(2, "0")}.svg`), proxySvg(index), "utf8");
  }
  const photos: FixturePhoto[] = Array.from({ length: photoCount }, (_, index) => ({
    photoId: `photo-${String(index).padStart(5, "0")}`,
    relativePath: `source/album-${Math.floor(index / 250)}/photo-${String(index).padStart(5, "0")}.jpg`,
    proxyPath: `proxies/proxy-${String(index % 64).padStart(2, "0")}.svg`,
    width: index % 3 === 0 ? 4000 : 6000,
    height: index % 3 === 0 ? 3000 : 4000,
    orientation: (index % 8) + 1,
    colorSpace: index % 17 === 0 ? "Adobe-RGB" : index % 11 === 0 ? "Display-P3" : "sRGB"
  }));
  const manifest = {
    schemaVersion: 1,
    seed: "photoflex-spike-v1",
    photoCount,
    generatedAt: "deterministic",
    photos,
    edgeCases: [
      { id: "unicode-path", path: "source/婚礼 📷/été.jpg" },
      { id: "very-long-path", pathSegments: 18 },
      { id: "broken-metadata", expected: "partial" },
      { id: "symlink-escape", expected: "denied" },
      { id: "icc-srgb", expectedDeltaE00: { mean: 3, max: 6 } },
      { id: "icc-wide-gamut", expectedDeltaE00: { mean: 5, max: 10 } }
    ]
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = join(generated, "manifest.json");
  await writeFile(manifestPath, serialized, "utf8");
  return { manifestPath, fixtureHash: createHash("sha256").update(serialized).digest("hex") };
}
