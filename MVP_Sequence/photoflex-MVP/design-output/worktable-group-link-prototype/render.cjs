const { chromium } = require('C:/Users/Jeff Wu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

async function main() {
  const root = __dirname.replace(/\\/g, '/');
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
  for (const [variant, output] of [['group','01-worktable-group.png'],['link','02-worktable-link.png']]) {
    await page.goto(`file:///${root}/index.html?variant=${variant}&capture=1`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(__dirname, output), fullPage: false });
  }
  await browser.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
