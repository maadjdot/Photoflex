import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = "D:/project/Photoflex/Spike/test/stress-3000-loremflickr";
const targetCount = 3000;
const headers = { "User-Agent": "PhotoFlex-Tech-Reversal/0.1 (local benchmark corpus)" };
const records = [];
const hashes = new Set();
let nextLock = 1;
fs.mkdirSync(root, { recursive: true });

for (const existing of fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.jpg$/i.test(entry.name))) {
  const match = existing.name.match(/^\d{4}-lock-(\d+)\.jpg$/i);
  if (!match) continue;
  const bytes = fs.readFileSync(path.join(root, existing.name));
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (hashes.has(sha256)) continue;
  const lock = Number(match[1]);
  hashes.add(sha256);
  records.push({
    id: records.length + 1,
    lock,
    localFile: existing.name,
    sourceUrl: `https://loremflickr.com/320/240/photo?lock=${lock}`,
    finalUrl: null,
    bytes: bytes.length,
    sha256,
  });
  nextLock = Math.max(nextLock, lock + 1);
}

async function fetchOne(lock) {
  const sourceUrl = `https://loremflickr.com/320/240/photo?lock=${lock}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(sourceUrl, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(String(response.status));
      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("image") || bytes.length < 500) throw new Error("invalid image response");
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      return { lock, sourceUrl, finalUrl: response.url, bytes, sha256 };
    } catch (error) {
      if (attempt === 5) return { lock, error: error.message };
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function main() {
  while (records.length < targetCount && nextLock <= targetCount * 4) {
    const batch = [];
    while (batch.length < 24 && records.length + batch.length < targetCount) {
      batch.push(fetchOne(nextLock));
      nextLock += 1;
    }
    const results = await Promise.all(batch);
    for (const result of results) {
      if (result.error || hashes.has(result.sha256)) continue;
      const file = `${String(records.length + 1).padStart(4, "0")}-lock-${result.lock}.jpg`;
      fs.writeFileSync(path.join(root, file), result.bytes);
      hashes.add(result.sha256);
      records.push({
        id: records.length + 1,
        lock: result.lock,
        localFile: file,
        sourceUrl: result.sourceUrl,
        finalUrl: result.finalUrl,
        bytes: result.bytes.length,
        sha256: result.sha256,
      });
    }
    if (records.length % 100 < 12 || records.length === targetCount) {
      process.stdout.write(`downloaded unique ${records.length}, next lock ${nextLock}\n`);
    }
  }
  if (records.length !== targetCount) {
    throw new Error(`only collected ${records.length} unique images after ${nextLock - 1} locks`);
  }
  const manifest = {
    source: "LoremFlickr",
    endpoint: "https://loremflickr.com/320/240/photo?lock={n}",
    dimensions: "320x240 target",
    count: records.length,
    uniqueContentHashes: hashes.size,
    generatedAt: new Date().toISOString(),
    images: records,
  };
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(root, "README.md"),
    "# PhotoFlex stress-3000 LoremFlickr corpus\n\n" +
      "3000 distinct small photos collected for local benchmark use and verified by SHA-256. " +
      "The images originate from Flickr and retain their original authorship/licensing; this corpus is not for redistribution. " +
      "See `manifest.json` for source and final URLs.\n",
  );
  console.log(`COMPLETE ${records.length} files, ${hashes.size} unique content hashes`);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
