import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
const url = 'http://localhost:8080/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(url);
await page.waitForTimeout(6000);
const hash = async () => createHash('md5').update(await page.screenshot()).digest('hex');
await page.screenshot({ path: 'shots/menu-dark.png' });
const before = await hash();
for (let y = 820; y > 450; y -= 10) {
  await page.mouse.click(195, y);
  await page.waitForTimeout(700);
  if ((await hash()) !== before) { console.log('changed at', y); break; }
}
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/game-dark.png' });
// тап по клетке рядом с центральным словом (поле 5×5, пустая клетка над центром)
await page.mouse.click(195, 195 + 60);
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/game-pick.png' });
await browser.close();
