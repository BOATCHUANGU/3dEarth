import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { installTileFixtures } from './tile-fixtures.mjs';

const out = 'artifacts/branding';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = {
  browser: browser.version(),
  scope: 'Web only; no Android execution',
  checks: [],
  errors: [],
};
try {
  for (const [name, width, height, reducedMotion] of [
    ['desktop', 1440, 1000, 'no-preference'],
    ['phone', 393, 852, 'no-preference'],
    ['landscape', 852, 393, 'no-preference'],
    ['reduced', 393, 852, 'reduce'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      reducedMotion,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(`${name}: ${e.message}`));
    await installTileFixtures(page);
    // Hold local textures only long enough to photograph the real loading UI.
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/textures/**', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(process.env.EARTH_TEST_URL || 'http://127.0.0.1:4280', {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('.brand-logo').evaluate((img) => img.decode());
    const home = page.getByRole('button', { name: 'EARTH 返回初始视角', exact: true });
    assert.equal(await home.innerText(), '');
    assert.equal(await home.locator('img').getAttribute('src'), '/branding/earth-logo.png');
    assert.equal(
      await page.locator('.loading-logo').getAttribute('src'),
      '/branding/earth-logo.png',
    );
    for (const selector of ['#home', '.brand-logo', '.loading-logo']) {
      const b = await page.locator(selector).boundingBox();
      assert.ok(
        b && b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height,
        `${name} clipped ${selector}: ${JSON.stringify(b)}`,
      );
    }
    const box = await home.boundingBox();
    assert.ok(box.width >= 48 && box.height >= 48);
    await page.screenshot({ path: `${out}/web-${name}-loading.png` });
    release();
    await page.waitForFunction(() => window.earth?.getState().ready, null, { timeout: 90000 });
    await page.locator('#loading').waitFor({ state: 'hidden' });
    if (reducedMotion === 'reduce')
      assert.equal(await page.evaluate(() => window.earth.getState().autoRotate), false);
    if (await page.evaluate(() => window.earth.getState().autoRotate))
      await page.locator('#rotation-toggle').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${out}/web-${name}-ready.png` });
    await home.screenshot({ path: `${out}/web-${name}-logo.png` });
    await page.evaluate(() => window.earth.focusOn(40, 20, 1000000));
    await page.waitForFunction(() => !window.earth.getState().isFlying);
    // Keyboard activation exercises the same accessible home action as a pointer click.
    await page.keyboard.press('Tab');
    await home.focus();
    assert.ok(await home.evaluate((el) => el.matches(':focus-visible')));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.earth.getState().isFlying);
    const position = await page.evaluate(() => window.earth.getState());
    assert.ok(
      Math.abs(position.latitude - 22) < 0.1 && Math.abs(position.longitude - 115) < 0.1,
      'Home failed to reset camera',
    );
    await page.locator('#open-search').click();
    await page.locator('#search-input').fill('Paris');
    await page.waitForFunction(() => document.querySelector('#search-results button small'));
    await page.locator('#search-dialog .dialog-close').click();
    await page.locator('#layers-toggle').click();
    assert.ok(await page.locator('#layers-panel').isVisible());
    await page.locator('#layers-panel [data-close-panel]').click();
    report.checks.push({ name, width, height, reducedMotion, passed: true, homeTarget: box });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.failure = e.message;
  throw e;
} finally {
  await writeFile(`${out}/web-results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
