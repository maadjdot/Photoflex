const { chromium } = require('C:/Users/Jeff Wu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

async function main() {
  const root = __dirname.replace(/\\/g, '/');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
  const variants = [
    ['contact', '01-contact-sheet-analog-workbench.png'],
    ['sequence', '02-sequence-edit-strip.png'],
    ['map', '03-sequence-map-pin.png'],
  ];

  for (const [variant, output] of variants) {
    await page.goto(`file:///${root}/index.html?variant=${variant}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => Promise.all(Array.from(document.images).map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = img.onerror = resolve; }))));
    await page.screenshot({ path: path.join(__dirname, output), fullPage: true });
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
