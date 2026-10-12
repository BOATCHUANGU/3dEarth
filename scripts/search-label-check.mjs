import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { installTileFixtures } from './tile-fixtures.mjs';

const out = 'artifacts/search-labels';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = {
  browser: browser.version(),
  scope: 'Web browser, fixture tiles; no Android execution',
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
      reducedMotion,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => report.errors.push(`${name}: ${e.message}`));
    await installTileFixtures(page);
    await page.goto(process.env.EARTH_TEST_URL || 'http://127.0.0.1:4281');
    await page.waitForFunction(() => window.earth?.getState().ready);
    if (await page.evaluate(() => window.earth.getState().autoRotate))
      await page.locator('#rotation-toggle').click();
    await page.evaluate(() => scrollTo(0, 0));
    assert.equal(
      await page.locator('.map-marker, .search-place-label, [data-layer="markers"]').count(),
      0,
    );
    assert.equal(await page.evaluate(() => 'markers' in window.earth.getState().layers), false);
    await page.screenshot({ path: `${out}/${name}-initial.png` });

    const label = page.locator('.search-place-label');
    const selectSuggestion = async (text) => {
      await page.locator('#open-search').click();
      assert.equal(await page.locator('#search-results button').count(), 5);
      await page.locator('#search-results button').filter({ hasText: text }).click();
    };
    const centerViewport = async () =>
      page.evaluate(() => {
        const b = document.querySelector('#viewport').getBoundingClientRect();
        scrollTo(0, scrollY + b.top + b.height / 2 - innerHeight / 2);
      });
    await selectSuggestion('上海');
    await centerViewport();
    await page.waitForFunction(() => !window.earth.getState().isFlying);
    const arrival = Date.now();
    await label.waitFor({ state: 'visible' });
    assert.equal(await label.textContent(), '上海');
    assert.equal(await label.evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${name}-arrival.png` });
    await page.waitForTimeout(Math.max(0, 2650 - (Date.now() - arrival)));
    assert.equal(await label.count(), 1, 'Label expired before its arrival hold');
    assert.ok(Number(await label.evaluate((el) => getComputedStyle(el).opacity)) > 0.95);
    await label.waitFor({ state: 'detached', timeout: 2000 });
    const lifetime = Date.now() - arrival;
    assert.ok(lifetime >= 2800 && lifetime < 4300, `Arrival lifetime ${lifetime}`);
    await page.screenshot({ path: `${out}/${name}-expired.png` });

    await selectSuggestion('纽约');
    await selectSuggestion('东京');
    assert.equal(await label.count(), 1);
    assert.equal(await label.textContent(), '东京');
    await centerViewport();
    await page.waitForFunction(() => !window.earth.getState().isFlying);
    await label.waitFor({ state: 'visible' });
    await page.locator('#home').click();
    assert.equal(await label.count(), 0, 'Reset retained label');
    await page.waitForFunction(() => !window.earth.getState().isFlying);

    await page.locator('#open-search').click();
    await page.locator('#search-input').fill('Paris');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#search-results button small')].some((el) =>
        el.textContent.includes('(FR)'),
      ),
    );
    await page.locator('#search-results button').filter({ hasText: '(FR)' }).first().click();
    await page.waitForFunction(() => !window.earth.getState().isFlying);
    assert.match(await label.textContent(), /Paris/i);

    await page.locator('#open-search').click();
    await page.locator('#search-input').fill('31.23, 121.47');
    await page.locator('#search-results button').click();
    assert.equal(await label.textContent(), '31.23° N · 121.47° E');
    await centerViewport();
    await page.waitForFunction(() => !window.earth.getState().isFlying);
    await label.waitFor({ state: 'visible' });
    if (reducedMotion === 'reduce')
      assert.equal(await label.evaluate((el) => el.style.opacity), '1');

    // Suspend the actual renderer through its visibility event while wall-clock time passes.
    // Synthetic visibility is explicit: it does not claim a native OS background test.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.ok(await label.isHidden());
    await page.waitForTimeout(3400);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await label.count(), 0, 'Expired label flashed on resume');

    if (reducedMotion !== 'reduce') {
      await selectSuggestion('纽约');
      await centerViewport();
      await page.waitForFunction(() => window.earth.getState().isFlying);
      assert.ok(await label.isHidden(), 'Far-side destination must be hidden early in flight');
      const b = await page.locator('#viewport').boundingBox();
      const y = Math.min(height - 90, Math.max(100, b.y + b.height / 2));
      await page.mouse.move(width / 2, y);
      await page.mouse.down();
      await page.mouse.move(width / 2 + 30, y + 10, { steps: 4 });
      await page.mouse.up();
      assert.equal(await label.count(), 0, 'Cancelled flight retained label');
      assert.equal(await page.evaluate(() => window.earth.getState().isFlying), false);
      await page.waitForTimeout(3400);
      assert.equal(await label.count(), 0, 'Cancelled label returned later');
    }
    report.checks.push({
      name,
      width,
      height,
      reducedMotion,
      arrivalHoldAndFadeMs: lifetime,
      passed: true,
    });
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
