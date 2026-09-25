// Records the README demo: captures frames of the real docs UI while driving
// the "login → token captured → protected request → WebSocket ack" flow.
// Frames go to docs/marketing/frames/*.png; assemble with make-gif.py.
//
//   node docs/marketing/record-demo.js http://localhost:3034/docs
const fs = require('fs');
const path = require('path');
// Playwright is not a dependency of this package — resolve it from the cwd
// (a project that has it installed, e.g. the demo app).
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd()] }));

const DOCS = process.argv[2] || 'http://localhost:3034/docs';
const OUT = path.join(__dirname, 'frames');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
const frames = [];
async function shot(page, hold = 1) {
  const file = path.join(OUT, `f${String(n++).padStart(3, '0')}.png`);
  await page.screenshot({ path: file });
  frames.push({ file, hold });
}

async function typeSlowly(page, selector, text) {
  await page.fill(selector, '');
  for (const ch of text) {
    await page.type(selector, ch, { delay: 0 });
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
  await page.goto(DOCS, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.removeItem('scramble-auth'); localStorage.removeItem('scramble-history'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.group-name');

  // 1. Overview
  await shot(page, 6);

  // 2. Open the Auth group and the login endpoint
  await page.click('text=Auth');
  await shot(page, 2);
  await page.click('text=login');
  await page.waitForSelector('#send-btn:visible');
  await shot(page, 5);

  // 3. Send login → toast
  await page.click('#send-btn');
  await page.waitForSelector('.toast.show', { timeout: 10000 });
  await page.waitForTimeout(350); // let the toast transition finish
  await shot(page, 8);
  await page.waitForFunction(() => /\d{3}/.test(document.querySelector('#resp-meta').textContent));
  await shot(page, 4);
  // Headless runs fast — let the toast finish its 3s life before moving on.
  await page.waitForSelector('.toast', { state: 'detached', timeout: 10000 }).catch(() => {});

  // 4. Protected request with the captured token — straight to 201
  await page.click('text=Users');
  await page.waitForTimeout(150);
  await page.click('text=Create a new user');
  await page.waitForSelector('#send-btn:visible');
  await shot(page, 4);
  // Show the Auth tab inheriting the captured token
  const authTab = await page.$('.tab[data-tab="auth"]');
  if (authTab) { await authTab.click(); await shot(page, 5); }
  const bodyTab = await page.$('.tab[data-tab="body"]');
  if (bodyTab) { await bodyTab.click(); await shot(page, 3); }
  await page.click('#send-btn');
  await page.waitForFunction(() => /2\d\d/.test(document.querySelector('#resp-meta').textContent), null, { timeout: 10000 });
  await shot(page, 8);

  // 5. WebSocket: connect + send → ack
  await page.click('text=OrdersGateway');
  await page.waitForTimeout(150);
  await page.click('text=subscribeOrder');
  await page.waitForSelector('#ws-connect:visible');
  await shot(page, 3);
  await page.fill('#ws-payload', '"1001"');
  await page.click('#ws-send');
  await page.waitForFunction(() => /ack/i.test(document.querySelector('#ws-log').innerText), null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await shot(page, 8);

  // 6. GraphQL: run a query (deep link opens the group + operation)
  await page.evaluate(() => { location.hash = '#gql-query-posts'; });
  await page.waitForFunction(() => !document.querySelector('#gql-view').hidden, null, { timeout: 5000 });
  await shot(page, 3);
  await page.click('#gql-run');
  await page.waitForFunction(() => /\d{3}/.test(document.querySelector('#gql-meta').textContent), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, 8);

  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames, null, 2));
  await browser.close();
  console.log(`captured ${frames.length} frames → ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
