import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { installTileFixtures } from './tile-fixtures.mjs';

const out = 'artifacts/android16';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, locale: 'zh-CN' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await installTileFixtures(page);
await page.goto('http://127.0.0.1:4173');
await page.waitForFunction(() => window.earth?.getState().ready, null, { timeout: 60000 });
await page.evaluate(() => document.documentElement.classList.add('native-android'));
if ((await page.evaluate(() => window.earth.getState())).autoRotate)
  await page.locator('#rotation-toggle').click();
// Let pre-existing orbit damping settle before measuring resize continuity.
await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 90;
      const tick = () => (--frames ? requestAnimationFrame(tick) : resolve());
      requestAnimationFrame(tick);
    }),
);
const original = await page.evaluate(() => window.earth.getState());
const cases = [
  ['phone', 393, 852, 28, 24, 0],
  ['small', 320, 480, 24, 24, 0],
  ['landscape-cutout', 852, 393, 0, 24, 32],
  ['split', 600, 500, 24, 24, 0],
  ['tablet-portrait', 800, 1280, 28, 24, 0],
  ['tablet-landscape', 1280, 800, 28, 24, 0],
  ['free-window', 420, 380, 32, 0, 0],
  ['keyboard', 320, 320, 24, 0, 0],
];
const results = [];
try {
  for (const [name, width, height, top, bottom, left] of cases) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      ({ top, bottom, left }) => {
        for (const [side, value] of Object.entries({ top, bottom, left, right: 0 }))
          document.documentElement.style.setProperty(`--safe-area-inset-${side}`, `${value}px`);
      },
      { top, bottom, left },
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const checkBounds = async (selector) => {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box, `${name}: ${selector} missing`);
      assert.ok(
        box.x >= left - 1 &&
          box.y >= top - 1 &&
          box.x + box.width <= width + 1 &&
          box.y + box.height <= height - bottom + 1,
        `${name}: ${selector} unsafe ${JSON.stringify(box)}`,
      );
    };
    for (const selector of [
      '#home',
      '#open-search',
      '#zoom-in',
      '#zoom-out',
      '#reset-view',
      '#layers-toggle',
      '#sun-toggle',
      '#fullscreen',
      '#rotation-toggle',
      '.footer > button',
    ])
      await checkBounds(selector);
    await page.locator('#layers-toggle').click();
    await checkBounds('#layers-panel');
    await page.locator('#layers-panel [data-close-panel]').click();
    await page.locator('#open-search').click();
    await checkBounds('#search-dialog');
    await checkBounds('#search-input');
    await page.locator('#search-input').fill('北京');
    await page.waitForFunction(() => document.querySelector('#search-results button small'));
    await page.screenshot({ path: `${out}/layout-${name}.png` });
    await page.locator('#search-dialog .dialog-close').click();
    const state = await page.evaluate(() => window.earth.getState());
    assert.ok(
      Math.abs(state.latitude - original.latitude) < 1e-4 &&
        Math.abs(state.longitude - original.longitude) < 1e-4 &&
        Math.abs(state.altitude - original.altitude) < 0.01,
      `${name}: resize moved camera ${JSON.stringify({ before: [original.latitude, original.longitude, original.altitude, original.autoRotate], after: [state.latitude, state.longitude, state.altitude, state.autoRotate] })}`,
    );
    results.push({ name, width, height, passed: true });
    console.log(`PASS ${name}`);
  }
  await page.setViewportSize({ width: 852, height: 150 });
  await page.locator('#open-search').click();
  const shortDialog = await page.locator('#search-dialog').boundingBox();
  const shortInput = await page.locator('#search-input').boundingBox();
  const close = await page.locator('#search-dialog .dialog-close').boundingBox();
  assert.ok(
    shortInput.y >= shortDialog.y &&
      shortInput.y + shortInput.height <= shortDialog.y + shortDialog.height,
  );
  assert.ok(close.y >= shortDialog.y && close.y + close.height <= 150);
  await page.screenshot({ path: `${out}/layout-landscape-ime.png` });
  results.push({ name: 'landscape-ime', width: 852, height: 150, passed: true });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${out}/layout-results.json`,
    JSON.stringify(
      { browser: browser.version(), deviceValidation: false, results, errors },
      null,
      2,
    ),
  );
  await browser.close();
}
