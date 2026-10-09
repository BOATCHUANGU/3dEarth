import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.goto('http://127.0.0.1:5173');
await page.waitForFunction(() => window.earth?.getState().ready, { timeout: 60000 });
await page.locator('#rotation-toggle').click();
await page.waitForTimeout(1800);
await page.screenshot({ path: 'artifacts/desktop.png' });
console.log(JSON.stringify({ errors, state: await page.evaluate(() => window.earth.getState()) }));
await page.getByRole('button', { name: '光照与时间', exact: true }).click();
await page.screenshot({ path: 'artifacts/lighting.png' });
await page.getByRole('button', { name: '关闭光照设置' }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'artifacts/mobile.png' });
await writeFile('artifacts/visual-errors.json', JSON.stringify(errors, null, 2));
await browser.close();
