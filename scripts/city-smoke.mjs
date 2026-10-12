import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { installTileFixtures, tileRequest } from './tile-fixtures.mjs';

// Deterministic network fixtures; these tests never call public tile services.
const baseURL = process.env.EARTH_TEST_URL || 'http://127.0.0.1:5173';
const artifactDirectory = resolve(process.env.EARTH_ARTIFACT_DIR || 'artifacts');
const results = { baseURL, startedAt: new Date().toISOString(), checks: [], pageErrors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await mkdir(artifactDirectory, { recursive: true });
let policy = () => 'ok';
let fixtures;
let page;

async function check(name, operation) {
  try {
    const details = await operation();
    results.checks.push({ name, passed: true, details });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.checks.push({ name, passed: false, error: error.stack || error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}

const state = () => page.evaluate(() => window.earth.getState());
async function focus(latitude, longitude, altitude) {
  await page.evaluate(
    ({ latitude, longitude, altitude }) => window.earth.focusOn(latitude, longitude, altitude),
    { latitude, longitude, altitude },
  );
  await page.waitForFunction(
    ({ latitude, longitude, altitude }) => {
      const s = window.earth.getState();
      return (
        !s.isFlying &&
        Math.abs(s.latitude - latitude) < 1e-6 &&
        Math.abs(s.longitude - longitude) < 1e-6 &&
        Math.abs(s.altitude - altitude) < 0.1
      );
    },
    { latitude, longitude, altitude },
  );
}

async function ready(source) {
  await page.waitForFunction(
    (source) => {
      const t = window.earth.getState().tiles;
      return (
        t?.active &&
        t.source === source &&
        t.total > 0 &&
        t.loaded === t.total &&
        t.pending === 0 &&
        t.failed === 0
      );
    },
    source,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(400); // Complete the tile fade before sampling rendered pixels.
  return (await state()).tiles;
}

async function sample() {
  const viewport = page.viewportSize();
  const png = await page.screenshot({
    clip: {
      x: Math.round(viewport.width * 0.38),
      y: Math.round(viewport.height * 0.33),
      width: Math.round(viewport.width * 0.24),
      height: Math.round(viewport.height * 0.25),
    },
  });
  return page.evaluate(
    async (dataURL) => {
      const image = new Image();
      image.src = dataURL;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const bytes = ctx.getImageData(0, 0, image.width, image.height).data;
      let bright = 0;
      let edges = 0;
      const values = [];
      for (let i = 0; i < bytes.length; i += 4) {
        if (Math.max(bytes[i], bytes[i + 1], bytes[i + 2]) > 90) bright++;
        if (
          i >= 4 &&
          Math.abs(bytes[i] - bytes[i - 4]) +
            Math.abs(bytes[i + 1] - bytes[i - 3]) +
            Math.abs(bytes[i + 2] - bytes[i - 2]) >
            30
        )
          edges++;
        if (i % 64 === 0) values.push(bytes[i], bytes[i + 1], bytes[i + 2]);
      }
      return { bright: bright / (bytes.length / 4), edges: edges / (bytes.length / 4), values };
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
}

function difference(a, b) {
  assert.equal(a.values.length, b.values.length);
  return (
    a.values.reduce((sum, value, index) => sum + Math.abs(value - b.values[index]), 0) /
    a.values.length
  );
}

async function createPage(options) {
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    locale: 'zh-CN',
    ...options,
  });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => results.pageErrors.push(error.message));
  fixtures = await installTileFixtures(page, (request) => policy(tileRequest(request.url())));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.earth?.getState().ready, null, { timeout: 45_000 });
  await page.locator('#loading').waitFor({ state: 'hidden' });
}

try {
  await createPage();
  let regional;
  let city;
  await check('Regional imagery refines to city streets using native LOD', async () => {
    await focus(31.2304, 121.4737, 450_000);
    regional = await ready('eox-sentinel-2025');
    await page.locator('[data-altitude="12000"]').click();
    city = await ready('osm-standard');
    assert.ok(city.zoom > regional.zoom);
    assert.ok(city.metersPerTexel < regional.metersPerTexel);
    assert.ok(Math.abs((await state()).altitude - 12_000) < 0.1);
    assert.match(await page.locator('#tile-attribution').textContent(), /OpenStreetMap/);
    const pixels = await sample();
    assert.ok(
      pixels.bright > 0.9 && pixels.edges > 0.025,
      `Expected visible sharp city texture: ${JSON.stringify({ bright: pixels.bright, edges: pixels.edges })}`,
    );
    return { regional, city, pixels: { bright: pixels.bright, edges: pixels.edges } };
  });

  await check(
    'Street-block and 150 m views preserve full resolution and camera precision',
    async () => {
      await page.locator('[data-altitude="600"]').click();
      const block = await ready('osm-standard');
      assert.ok(block.zoom > city.zoom && block.zoom <= 19);
      await focus(31.2304, 121.4737, 150);
      const close = await ready('osm-standard');
      assert.equal(close.zoom, 19);
      assert.equal(close.atNativeLimit, true);
      assert.ok((await state()).pixelRatio >= 2);
      await page.screenshot({ path: resolve(artifactDirectory, 'city-fixture-150m.png') });
      const canvas = await page.locator('#viewport canvas').boundingBox();
      await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.5);
      await page.mouse.wheel(0, -1000);
      await page.waitForTimeout(450);
      assert.ok(
        Math.abs((await state()).altitude - 150) < 0.1,
        'Wheel cannot cross the 150 m surface limit',
      );
      const before = await state();
      await page.mouse.down();
      await page.mouse.move(
        canvas.x + canvas.width * 0.6 + 100,
        canvas.y + canvas.height * 0.5 + 20,
        { steps: 10 },
      );
      await page.mouse.up();
      await page.waitForTimeout(500);
      const after = await state();
      assert.ok(
        Math.abs(after.longitude - before.longitude) > 1e-7,
        'City drag must remain responsive',
      );
      assert.ok(Math.abs(after.longitude - before.longitude) < 0.02, 'City drag must remain local');
      assert.ok(Math.abs(after.altitude - 150) < 0.1);
      return { block, close, dragLongitude: after.longitude - before.longitude };
    },
  );

  await check(
    'Visible parents survive failures and manual retry respects provider cooldown',
    async () => {
      policy = (tile) => (tile.source === 'osm-standard' && tile.z >= city.zoom ? 'hold' : 'ok');
      await focus(31.2304, 123.4737, 12_000);
      await page.waitForFunction(() => window.earth.getState().tiles.source === 'osm-standard');
      for (let attempts = 0; fixtures.held.size === 0 && attempts < 100; attempts++)
        await page.waitForTimeout(100);
      assert.ok(fixtures.held.size > 0, 'Leaf requests must be in flight');
      assert.ok(fixtures.held.size <= 8, 'Normal network must respect eight shared slots');
      await page.waitForTimeout(600);
      const loading = await state();
      assert.ok(
        fixtures.requests.some(
          (r) => r.source === 'osm-standard' && r.z < city.zoom && r.action === 'ok',
        ),
      );
      const cover = await sample();
      assert.ok(cover.bright > 0.9, 'Visible parents should fill the centre while leaves load');
      await page.screenshot({ path: resolve(artifactDirectory, 'city-fixture-parent-cover.png') });
      policy = (tile) => (tile.source === 'osm-standard' && tile.z >= city.zoom ? 'fail' : 'ok');
      await fixtures.release('fail');
      await page.waitForFunction(() => window.earth.getState().tiles.failed > 0);
      await page.locator('#retry-tiles').waitFor({ state: 'visible' });
      assert.match(await page.locator('#tile-status').textContent(), /保留已有影像/);
      const failed = await state();
      const failedCover = await sample();
      assert.ok(
        difference(cover, failedCover) < 1,
        'Tile failure must keep the already rendered parent cover',
      );
      const beforeRetry = fixtures.requests.filter((r) => r.source === 'osm-standard').length;
      policy = () => 'ok';
      await page.locator('#retry-tiles').click();
      await page.waitForTimeout(600);
      const afterRetry = fixtures.requests.filter((r) => r.source === 'osm-standard').length;
      assert.equal(afterRetry, beforeRetry, 'Manual retry must not bypass provider cooldown');
      return {
        loading: loading.tiles,
        failed: failed.tiles,
        beforeRetry,
        afterRetry,
      };
    },
  );

  await check(
    'Changing source keeps the previous image and credits until replacement is ready',
    async () => {
      const original = await sample();
      policy = (tile) => (tile.source === 'eox-sentinel-2025' ? 'hold' : 'ok');
      await page.locator('[data-map-mode="satellite"]').click();
      await page.waitForFunction(() => {
        const t = window.earth.getState().tiles;
        return t.source === 'eox-sentinel-2025' && t.pending > 0 && t.loaded === 0;
      });
      await page.waitForTimeout(550);
      const transition = (await state()).tiles;
      assert.ok(transition.credits.some((c) => c.id === 'osm-standard'));
      assert.ok(transition.credits.some((c) => c.id === 'eox-sentinel-2025'));
      assert.ok(
        difference(original, await sample()) < 1,
        'Source replacement cannot expose the base globe',
      );
      policy = () => 'ok';
      await fixtures.release();
      const replacement = await ready('eox-sentinel-2025');
      assert.deepEqual(
        replacement.credits.map((c) => c.id),
        ['eox-sentinel-2025'],
      );
      return { transition, replacement };
    },
  );

  await check(
    'Regional aerial sources and antimeridian city requests use valid XYZ coordinates',
    async () => {
      // The previous scenario intentionally leaves OSM cooling down. Use a new
      // browser page so this independent coverage check starts with fresh health.
      await page.close();
      await createPage();
      await page.evaluate(() => window.earth.setMapMode('auto'));
      await focus(35.6762, 139.6503, 600);
      const japan = await ready('gsi-seamlessphoto');
      await focus(40.7128, -74.006, 600);
      const unitedStates = await ready('usgs-naip');
      await focus(0, 179.9999, 12_000);
      const dateline = await ready('osm-standard');
      const xyz = fixtures.requests.filter((r) => Number.isInteger(r.z));
      assert.ok(xyz.length > 0);
      assert.ok(xyz.every((r) => r.x >= 0 && r.y >= 0 && r.x < 2 ** r.z && r.y < 2 ** r.z));
      const seam = xyz.filter((r) => r.source === 'osm-standard' && r.z === dateline.zoom);
      assert.ok(
        seam.some((r) => r.x === 0) && seam.some((r) => r.x === 2 ** r.z - 1),
        'Both sides of the longitude seam must be covered',
      );
      assert.deepEqual(fixtures.unexpected, []);
      return { japan, unitedStates, dateline };
    },
  );
  await page.close();

  await createPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await check('Mobile city view keeps 3× sampling, city LOD, and accessible controls', async () => {
    await focus(31.2304, 121.4737, 600);
    const tiles = await ready('osm-standard');
    assert.equal((await state()).pixelRatio, 3);
    assert.equal(tiles.zoom, 19);
    for (const selector of [
      '.exploration-bar',
      '#detail-status',
      '#zoom-in',
      '#zoom-out',
      '#tile-attribution',
    ]) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0, `${selector} should be visible`);
      assert.ok(
        box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845,
        `${selector} must fit the mobile viewport: ${JSON.stringify(box)}`,
      );
    }
    await page.screenshot({ path: resolve(artifactDirectory, 'city-fixture-mobile.png') });
    await page.locator('#zoom-in').click();
    await page.waitForFunction(() => window.earth.getState().altitude < 600);
    assert.ok((await state()).altitude >= 150 - 0.1);
    assert.deepEqual(fixtures.unexpected, []);
    return { tiles, pixelRatio: (await state()).pixelRatio };
  });
  await check('No uncaught browser errors in city workflows', async () =>
    assert.deepEqual(results.pageErrors, []),
  );
} catch {
  // The failing check is recorded above. Still save a screenshot and diagnostics.
  if (page && !page.isClosed()) {
    results.lastState = await state().catch(() => null);
    await page
      .screenshot({ path: resolve(artifactDirectory, 'city-fixture-failure.png') })
      .catch(() => undefined);
  }
} finally {
  await browser.close();
  results.finishedAt = new Date().toISOString();
  results.passed = results.checks.length === 7 && results.checks.every((check) => check.passed);
  await writeFile(
    resolve(artifactDirectory, 'city-smoke-results.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(
    `${results.checks.filter((check) => check.passed).length}/${results.checks.length} city checks passed.`,
  );
  if (!results.passed) process.exitCode = 1;
}
