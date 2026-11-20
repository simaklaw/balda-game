import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
const url = process.argv[2] ?? 'http://localhost:8080/';
const P = process.argv[3] ?? '';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (true) console.log('CONSOLE', m.text()); });
await page.goto(url);
await page.waitForTimeout(6000);
const hash = async () => createHash('md5').update(await page.screenshot()).digest('hex');
await page.screenshot({ path: `shots/${P}menu-dark.png` });
const before = await hash();
for (let y = 820; y > 450; y -= 10) {
  await page.mouse.click(195, y);
  await page.waitForTimeout(700);
  if ((await hash()) !== before) { console.log('changed at', y); break; }
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/${P}game-dark.png` });
const flow = async (tag) => {
  await page.touchscreen.tap(195, 195); // «+» над центральной буквой
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/${P}${tag}-keyboard.png` });
  await page.touchscreen.tap(110, 640); // клавиша
  await page.waitForTimeout(600);
  await page.touchscreen.tap(195, 268); // буква под новой клеткой
  await page.waitForTimeout(300);
  await page.touchscreen.tap(195, 195);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/${P}${tag}-path.png` });
};
await flow('dark');
await page.evaluate(() => localStorage.setItem('balda.theme', 'light'));
await page.reload();
await page.waitForTimeout(6000);
await page.screenshot({ path: `shots/${P}menu-light.png` });
for (let y = 820; y > 450; y -= 10) {
  await page.mouse.click(195, y);
  await page.waitForTimeout(700);
  if ((await hash()) !== (await (async () => before)())) { break; }
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/${P}game-light.png` });
await browser.close();
