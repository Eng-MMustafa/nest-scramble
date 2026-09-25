const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, 'banner-v2.html');
  const outPath = path.resolve(__dirname, 'linkedin-banner-v2.png');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  // Give fonts & gradient a moment to settle
  await page.waitForTimeout(500);
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();
  console.log('saved', outPath);
})();
