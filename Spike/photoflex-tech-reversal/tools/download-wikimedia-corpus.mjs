import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = "D:/project/Photoflex/Spike/test/stress-3000-wikimedia";
const headers = { "User-Agent": "PhotoFlex-Tech-Reversal/0.1 (local benchmark corpus)" };
const items = [];
const seen = new Set();

async function getBatch(continuation) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: "filetype:bitmap",
    gsrnamespace: "6",
    gsrlimit: "500",
    format: "json",
    formatversion: "2",
  });
  if (continuation) {
    for (const [key, value] of Object.entries(continuation)) params.set(key, value);
  }
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 6) {
      throw new Error(`Wikimedia API returned ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000 * attempt));
  }
}

async function collectItems() {
  let continuation;
  while (items.length < 3000) {
    const batch = await getBatch(continuation);
    for (const page of batch.query?.pages ?? []) {
      if (!/\.(jpe?g|png)$/i.test(page.title ?? "")) continue;
      if (seen.has(page.pageid)) continue;
      seen.add(page.pageid);
      const filename = page.title.replace(/^File:/, "");
      const filenameHash = crypto.createHash("md5").update(filename).digest("hex");
      const thumbFilename = filename.replaceAll(" ", "_");
      const encodedFilename = encodeURIComponent(thumbFilename);
      items.push({
        pageid: page.pageid,
        title: page.title,
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
        downloadUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/${filenameHash[0]}/${filenameHash.slice(0, 2)}/${encodedFilename}/330px-${encodedFilename}`,
        mime: page.title.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      });
      if (items.length === 3000) break;
    }
    process.stdout.write(`listed ${items.length}\n`);
    if (!batch.continue) throw new Error(`not enough eligible images; listed ${items.length}`);
    continuation = batch.continue;
  }
}

async function downloadItems() {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      const extension = item.mime.toLowerCase().includes("png") ? "png" : "jpg";
      const file = `${String(index + 1).padStart(4, "0")}-${item.pageid}.${extension}`;
      const outputPath = path.join(root, file);
      if (fs.existsSync(outputPath)) {
        const existing = fs.readFileSync(outputPath);
        if (existing.length >= 500) {
          item.localFile = file;
          item.bytes = existing.length;
          item.sha256 = crypto.createHash("sha256").update(existing).digest("hex");
          done += 1;
          if (done % 50 === 0) process.stdout.write(`resumed ${done}\n`);
          continue;
        }
      }
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const response = await fetch(item.downloadUrl, { headers });
          if (!response.ok) throw new Error(String(response.status));
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length < 500) throw new Error("short response");
          fs.writeFileSync(outputPath, bytes);
          item.localFile = file;
          item.bytes = bytes.length;
          item.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
          break;
        } catch (error) {
          if (attempt === 5) throw new Error(`${item.pageid}: ${error.message}`);
          await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
        }
      }
      done += 1;
      if (done % 50 === 0) process.stdout.write(`downloaded ${done}\n`);
    }
  });
  await Promise.all(workers);
}

async function main() {
  fs.mkdirSync(root, { recursive: true });
  await collectItems();
  await downloadItems();
  const uniqueHashes = new Set(items.map((item) => item.sha256));
  const manifest = {
    source: "Wikimedia Commons filetype:bitmap search",
    api: "https://commons.wikimedia.org/w/api.php",
    dimensions: "official file redirect with width=320 target",
    count: items.length,
    uniqueSourceFiles: new Set(items.map((item) => item.pageid)).size,
    uniqueContentHashes: uniqueHashes.size,
    generatedAt: new Date().toISOString(),
    images: items,
  };
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(root, "README.md"),
    "# PhotoFlex stress-3000 Wikimedia corpus\n\n" +
      "3000 distinct Wikimedia Commons bitmap files downloaded as small thumbnails for benchmark use. " +
      "See `manifest.json` for source URLs and SHA-256 hashes; per-file license information is available on each source page. " +
      "Original files are not modified.\n",
  );
  console.log(`COMPLETE ${items.length} files, ${uniqueHashes.size} unique content hashes`);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
