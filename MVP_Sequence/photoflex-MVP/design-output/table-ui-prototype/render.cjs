const { chromium } = require('C:/Users/Jeff Wu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

async function main() {
  const root = __dirname.replace(/\\/g, '/');
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
  for (const [variant, name] of [['A','01-table-free-workbench.png'],['B','02-table-triage-trays.png'],['C','03-table-sequence-lane.png']]) {
    await page.goto(`file:///${root}/index.html?variant=${variant}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => Promise.all(Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = img.onerror = resolve; }))));
    await page.screenshot({ path: path.join(__dirname, name), fullPage: false });
  }
  await browser.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
