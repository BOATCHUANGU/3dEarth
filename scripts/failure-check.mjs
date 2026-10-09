import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installTileFixtures } from './tile-fixtures.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
const url = process.env.EARTH_TEST_URL || 'http://127.0.0.1:5173';
try {
  for (const scenario of [
    'high-resolution-fallback',
    'missing-optional-layer',
    'missing-day-map',
    'webgl-unavailable',
    'context-lost',
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(45_000);
    await installTileFixtures(page);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    if (scenario === 'high-resolution-fallback')
      await page.route(/\/earth-day(?!-2k)[^/]*\.jpg$/, (route) => route.abort());
    if (scenario === 'missing-optional-layer')
      await page.route('**/earth-night*.jpg', (route) => route.abort());
    if (scenario === 'missing-day-map')
      await page.route('**/earth-day*.jpg', (route) => route.abort());
    if (scenario === 'webgl-unavailable')
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type.startsWith('webgl') ? null : original.call(this, type, ...args);
        };
      });
    await page.goto(url);
    if (scenario === 'missing-day-map' || scenario === 'webgl-unavailable') {
      await page.locator('#error').waitFor({ state: 'visible' });
      assert.match(
        await page.locator('#error-message').textContent(),
        scenario === 'missing-day-map' ? /地表素材加载失败/ : /WebGL 2/,
      );
      assert.equal(await page.locator('#retry').isVisible(), true);
    } else {
      await page.waitForFunction(() => window.earth?.getState().ready);
      if (scenario === 'high-resolution-fallback') {
        assert.ok(requests.some((url) => url.endsWith('/earth-day-2k.jpg')));
        assert.match(await page.locator('#toast').textContent(), /轻量素材/);
        assert.ok(await page.evaluate(() => window.earth.getState().pixelRatio >= 2));
      }
      if (scenario === 'missing-optional-layer')
        assert.match(await page.locator('#toast').textContent(), /图层素材/);
      if (scenario === 'context-lost') {
        await page.evaluate(() =>
          document
            .querySelector('canvas')
            .getContext('webgl2')
            .getExtension('WEBGL_lose_context')
            .loseContext(),
        );
        await page.locator('#error').waitFor({ state: 'visible' });
        assert.match(await page.locator('#error-message').textContent(), /图形连接已中断/);
        assert.equal(await page.evaluate(() => window.earth.getState().ready), false);
      }
    }
    assert.deepEqual(errors, [], `Uncaught errors in ${scenario}`);
    results.push({ scenario, passed: true });
    await page.close();
  }
} finally {
  await browser.close();
  const artifactDirectory = resolve(process.env.EARTH_ARTIFACT_DIR || 'artifacts');
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    resolve(artifactDirectory, 'failure-results.json'),
    JSON.stringify(results, null, 2),
  );
}
console.log(JSON.stringify(results, null, 2));
