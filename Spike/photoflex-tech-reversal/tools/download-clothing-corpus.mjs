import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = "D:/project/Photoflex/Spike/test/stress-3000-clothing-cc0";
const targetCount = 3000;
const baseUrl = "https://raw.githubusercontent.com/alexeygrigorev/clothing-dataset/master";
const headers = { "User-Agent": "PhotoFlex-Tech-Reversal/0.1 (local benchmark corpus)" };

async function fetchBytes(url) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(String(response.status));
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 500) throw new Error("short response");
      return bytes;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function main() {
  fs.mkdirSync(root, { recursive: true });
  const csv = (await fetchBytes(`${baseUrl}/images.csv`)).toString("utf8");
  const ids = csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",")[0].trim())
    .filter(Boolean)
    .slice(0, targetCount + 1000);
  if (ids.length < targetCount) throw new Error(`dataset only contains ${ids.length} image IDs`);

  let next = 0;
  let done = 0;
  const records = [];
  const hashes = new Set();
  const workers = Array.from({ length: 12 }, async () => {
    while (true) {
      const index = next++;
      if (index >= ids.length || done >= targetCount) return;
      const id = ids[index];
      const sourceUrl = `${baseUrl}/images/${id}.jpg`;
      const bytes = await fetchBytes(sourceUrl);
      if (!bytes) continue;
      if (done >= targetCount) return;
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      if (hashes.has(sha256)) throw new Error(`duplicate content hash for ${id}`);
      hashes.add(sha256);
      const recordIndex = done;
      done += 1;
      const file = `${String(recordIndex + 1).padStart(4, "0")}-${id}.jpg`;
      fs.writeFileSync(path.join(root, file), bytes);
      records[recordIndex] = { id: recordIndex + 1, datasetId: id, localFile: file, sourceUrl, bytes: bytes.length, sha256 };
      if (done % 100 === 0) process.stdout.write(`downloaded ${done}\n`);
    }
  });
  await Promise.all(workers);

  const manifest = {
    source: "alexeygrigorev/clothing-dataset",
    repository: "https://github.com/alexeygrigorev/clothing-dataset",
    license: "CC0-1.0 (as declared by the repository)",
    dimensions: "original dataset JPEGs; benchmark may use generated thumbnails",
    count: records.length,
    uniqueContentHashes: hashes.size,
    generatedAt: new Date().toISOString(),
    images: records,
  };
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(root, "README.md"),
    "# PhotoFlex stress-3000 clothing corpus\n\n" +
      "3000 distinct JPG photos from the clothing-dataset repository. The repository declares CC0-1.0. " +
      "See `manifest.json` for source URLs and SHA-256 hashes.\n",
  );
  console.log(`COMPLETE ${records.length} files, ${hashes.size} unique content hashes`);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
