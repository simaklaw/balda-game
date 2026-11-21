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
  if (await page.evaluate(() => !!window.__scene)) { console.log('started at', y); break; }
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/${P}game-dark.png` });
const flow = async (tag) => {
  const call = (code) => page.evaluate(code);
  await call(() => { const s = window.__scene; s.selection.tapCell(2, 3); s.keyboard.visible = s.selection.snapshot.phase === 'choosingLetter'; s.refresh(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${P}${tag}-keyboard.png` });
  await call(() => { const s = window.__scene; s.onLetter('к'); });
  await page.waitForTimeout(400);
  await call(() => { const s = window.__scene; s.selection.extendPath(3, 3); s.selection.extendPath(3, 2); s.refresh(); });
  await page.waitForTimeout(500);
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
  if (await page.evaluate(() => !!window.__scene)) { break; }
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/${P}game-light.png` });
await page.evaluate(() => { const s = window.__scene; try { const g = s.controller.game; g.players[0].score = 7; g.winner = 0; } catch (e) {} s.showGameOver(); });
await page.waitForTimeout(350);
await page.screenshot({ path: `shots/${P}over-scramble.png` });
await page.waitForTimeout(2500);
await page.screenshot({ path: `shots/${P}over-final.png` });
await ctx.close();
{
  const lctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const lp = await lctx.newPage();
  lp.on('pageerror', (e) => console.log('LPAGEERROR', e.message));
  await lp.goto(url);
  await lp.waitForTimeout(12000);
  await lp.screenshot({ path: `shots/${P}land-menu.png` });
  for (let y = 370; y > 60; y -= 10) {
    await lp.mouse.click(640, y);
    await lp.waitForTimeout(500);
    if (await lp.evaluate(() => !!window.__scene)) break;
  }
  await lp.waitForTimeout(1500);
  await lp.screenshot({ path: `shots/${P}land-game.png` });
  await lp.evaluate(() => { const s = window.__scene; s.selection.tapCell(1, 2); s.keyboard.visible = s.selection.snapshot.phase === 'choosingLetter'; s.refresh(); });
  await lp.waitForTimeout(600);
  await lp.screenshot({ path: `shots/${P}land-keyboard.png` });
}
await browser.close();
