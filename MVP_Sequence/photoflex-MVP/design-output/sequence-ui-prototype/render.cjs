// THROWAWAY renderer for still-image delivery (CommonJS by file extension).
const { chromium } = require('C:/Users/Jeff Wu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--allow-file-access-from-files'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
  const fileUrl = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
  const outputs = [
    ['read', '01-sequence-read.png'],
    ['map', '02-sequence-map.png'],
    ['compare', '03-sequence-version-compare.png'],
    ['pair', '04-sequence-pair-compare.png'],
    ['contact', '06-contact-sheet-web.png'],
  ];
  for (const [variant, filename] of outputs) {
    await page.goto(`${fileUrl}?variant=${variant}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.resolve(__dirname, '..', filename), fullPage: false });
  }
  await browser.close();
})();
