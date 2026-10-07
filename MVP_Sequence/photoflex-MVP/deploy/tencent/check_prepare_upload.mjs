import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareUpload } from "./prepare-upload.mjs";

const bytes = 1024 * 1024;
async function fixture(t, fonts, respond, size = bytes) {
  const directory = await mkdtemp(join(tmpdir(), "photoflex-upload-check-"));
  await mkdir(join(directory, "assets"));
  for (const name of fonts) await writeFile(join(directory, "assets", name), Buffer.alloc(size));
  await writeFile(join(directory, "assets", "index-12345678.js"), "app");
  await writeFile(join(directory, "index.html"), "entry");
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method, encoding: request.headers["accept-encoding"] });
    respond(request, response);
    response.end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, requests, origin: `http://127.0.0.1:${server.address().port}` };
}

test("reuses a published immutable font while keeping the entry and application code", async t => {
  const f = await fixture(t, ["Font-12345678.ttf"], (_, response) => {
    response.setHeader("content-length", bytes);
    response.setHeader("cache-control", "public, max-age=31536000, immutable");
  });
  assert.deepEqual(await prepareUpload(f), { reusedFonts: 1, reusedBytes: bytes });
  assert.deepEqual(await readdir(join(f.directory, "assets")), ["index-12345678.js"]);
  assert.deepEqual(f.requests, [{ url: "/assets/Font-12345678.ttf", method: "HEAD", encoding: "identity" }]);
});

test("uploads missing fonts, different lengths, and fonts without immutable caching", async t => {
  const names = ["Missing-12345678.ttf", "Changed-12345678.woff2", "Uncached-12345678.ttf"];
  const f = await fixture(t, names, (request, response) => {
    response.setHeader("content-length", request.url.includes("Changed") ? bytes + 1 : bytes);
    if (request.url.includes("Missing")) response.statusCode = 404;
    if (!request.url.includes("Uncached")) response.setHeader("cache-control", "immutable");
  });
  assert.deepEqual(await prepareUpload(f), { reusedFonts: 0, reusedBytes: 0 });
  assert.deepEqual((await readdir(join(f.directory, "assets"))).sort(), [...names, "index-12345678.js"].sort());
});

test("keeps fonts after redirects and never reuses names without a content hash", async t => {
  const names = ["Redirect-12345678.ttf", "unhashed.ttf"];
  const f = await fixture(t, names, (_, response) => {
    response.statusCode = 302;
    response.setHeader("location", "/assets/other.ttf");
    response.setHeader("content-length", bytes);
    response.setHeader("cache-control", "immutable");
  });
  assert.deepEqual(await prepareUpload(f), { reusedFonts: 0, reusedBytes: 0 });
  assert.equal(f.requests.length, 1);
  assert.deepEqual((await readdir(join(f.directory, "assets"))).sort(), [...names, "index-12345678.js"].sort());
});

test("also reuses small immutable fonts so they do not accumulate in each upload", async t => {
  const f = await fixture(t, ["Small-12345678.woff2"], (_, response) => {
    response.setHeader("content-length", 512);
    response.setHeader("cache-control", "immutable");
  }, 512);
  assert.deepEqual(await prepareUpload(f), { reusedFonts: 1, reusedBytes: 512 });
});
