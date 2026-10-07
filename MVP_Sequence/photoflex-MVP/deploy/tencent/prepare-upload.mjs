import { readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Fonts already served under immutable Vite content hashes stay in shared/assets.
export async function prepareUpload({ directory, origin = "https://photoflex.site" }) {
  const assets = join(directory, "assets");
  const fonts = (await readdir(assets, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /-[A-Za-z0-9_-]{8}\.(?:ttf|otf|woff2?)$/.test(entry.name));
  let reusedFonts = 0, reusedBytes = 0;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, fonts.length) }, async () => {
    while (next < fonts.length) {
      const font = fonts[next++];
      const path = join(assets, font.name);
      const { size } = await stat(path);
      let exists = false;
      try {
        const response = await fetch(`${origin}/assets/${encodeURIComponent(font.name)}`, {
          method: "HEAD", redirect: "error", signal: AbortSignal.timeout(10_000),
          headers: { "Accept-Encoding": "identity" },
        });
        exists = response.status === 200
          && Number(response.headers.get("content-length")) === size
          && (response.headers.get("cache-control") ?? "").toLowerCase().split(",").some(value => value.trim() === "immutable");
      } catch {
        // If the current website cannot confirm the font, upload it normally.
      }
      if (exists) {
        await unlink(path);
        reusedFonts++;
        reusedBytes += size;
      }
    }
  }));
  return { reusedFonts, reusedBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await prepareUpload({ directory: process.argv[2] })));
}
