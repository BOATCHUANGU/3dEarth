import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { installTileFixtures } from './tile-fixtures.mjs';

// Run against a running Vite server: node scripts/smoke-test.mjs
const baseURL = process.env.EARTH_TEST_URL || 'http://127.0.0.1:5173';
const artifactDirectory = resolve(process.env.EARTH_ARTIFACT_DIR || 'artifacts');
const results = {
  startedAt: new Date().toISOString(),
  baseURL,
  checks: [],
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  textureRequests: {},
};
await mkdir(artifactDirectory, { recursive: true });

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
});
results.browser = { channel: 'msedge', version: browser.version(), headless: true };

async function check(name, operation) {
  const started = performance.now();
  try {
    const details = await operation();
    results.checks.push({
      name,
      passed: true,
      durationMs: Math.round(performance.now() - started),
      details,
    });
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    results.checks.push({
      name,
      passed: false,
      durationMs: Math.round(performance.now() - started),
      error: error.message,
    });
    console.error(`FAIL ${name}: ${error.message}`);
    return false;
  }
}

async function createPage(name, options) {
  const context = await browser.newContext({ locale: 'zh-CN', ...options });
  const page = await context.newPage();
  await installTileFixtures(page);
  page.setDefaultTimeout(20_000);
  results.textureRequests[name] = [];
  page.on('console', (message) => {
    if (message.type() === 'error')
      results.consoleErrors.push({ context: name, message: message.text() });
  });
  page.on('pageerror', (error) =>
    results.pageErrors.push({ context: name, message: error.message }),
  );
  page.on('requestfailed', (request) =>
    results.requestFailures.push({
      context: name,
      url: request.url(),
      failure: request.failure()?.errorText,
    }),
  );
  page.on('response', (response) => {
    if (/\/textures\/earth-/.test(response.url())) {
      results.textureRequests[name].push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
    }
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.earth?.getState().ready, null, { timeout: 45_000 });
  await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.equal(
    await page.locator('#error').isVisible(),
    false,
    'Initialization error overlay is visible',
  );
  return { context, page };
}

const getState = (page) => page.evaluate(() => window.earth.getState());

async function focusSettled(page, latitude, longitude, altitude = 12_000_000) {
  await page.waitForFunction(
    ({ latitude, longitude, altitude }) => {
      const actual = window.earth.getState();
      return (
        Math.abs(actual.latitude - latitude) < 0.00001 &&
        Math.abs(actual.longitude - longitude) < 0.00001 &&
        Math.abs(actual.altitude - altitude) < 1
      );
    },
    { latitude, longitude, altitude },
  );
  return getState(page);
}

async function cameraSettled(page) {
  await page.evaluate(() => {
    delete window.__smokeCamera;
  });
  await page.waitForFunction(
    () => {
      const state = window.earth.getState();
      const previous = window.__smokeCamera;
      const values = [state.latitude, state.longitude, state.altitude];
      const stable =
        previous &&
        values.every((value, index) => Math.abs(value - previous.values[index]) < 0.000001);
      const count = stable ? previous.count + 1 : 0;
      window.__smokeCamera = { values, count };
      return count >= 4;
    },
    null,
    { polling: 100 },
  );
  await page.evaluate(() => {
    delete window.__smokeCamera;
  });
  return getState(page);
}

async function withinViewport(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && box.width > 0 && box.height > 0, `${selector} must be visible and nonempty`);
  assert.ok(
    box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1,
    `${selector} extends beyond viewport: ${JSON.stringify(box)}`,
  );
  return box;
}

try {
  const desktop = await createPage('desktop', {
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = desktop.page;

  await check('Desktop initializes with a visible WebGL canvas', async () => {
    const canvas = await withinViewport(page, '#viewport canvas');
    assert.ok(canvas.width > 600 && canvas.height > 300);
    const rendering = await page.locator('#viewport canvas').evaluate((canvas) => {
      const gl = canvas.getContext('webgl2');
      return {
        webgl2: !!gl,
        lost: gl?.isContextLost(),
        width: canvas.width,
        height: canvas.height,
      };
    });
    assert.equal(rendering.webgl2, true);
    assert.equal(rendering.lost, false);
    return { rendering, state: await getState(page) };
  });

  await check('Pause rotation and fly to Tokyo through its destination card', async () => {
    if ((await getState(page)).autoRotate) await page.locator('#rotation-toggle').click();
    assert.equal(await page.locator('#rotation-toggle').getAttribute('aria-pressed'), 'false');
    await page.locator('[data-location="tokyo"]').click();
    const state = await focusSettled(page, 35.6762, 139.6503);
    assert.equal(state.autoRotate, false);
    assert.equal(await page.locator('#location-name').textContent(), '东京');
    assert.equal(
      await page.locator('[data-location="tokyo"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('.map-marker.selected').getAttribute('aria-label'), '飞往东京');
    return state;
  });

  await check('Zoom buttons change camera height in the expected directions', async () => {
    const initial = await getState(page);
    await page.locator('#zoom-in').click();
    await page.waitForFunction(
      (altitude) => window.earth.getState().altitude < altitude - 1_000_000,
      initial.altitude,
    );
    const closer = await cameraSettled(page);
    await page.locator('#zoom-out').click();
    await page.waitForFunction(
      (altitude) => window.earth.getState().altitude > altitude + 1_000_000,
      closer.altitude,
    );
    const farther = await cameraSettled(page);
    assert.ok(closer.altitude < initial.altitude && farther.altitude > closer.altitude);
    return { initial: initial.altitude, closer: closer.altitude, farther: farther.altitude };
  });

  await check('All five layer controls work and maximum quality remains enabled', async () => {
    await page.locator('#layers-toggle').click();
    assert.equal(await page.locator('#layers-toggle').getAttribute('aria-expanded'), 'true');
    for (const name of ['clouds', 'atmosphere', 'night', 'markers', 'grid']) {
      const input = page.locator(`[data-layer="${name}"]`);
      const initial = await input.isChecked();
      await input.setChecked(!initial);
      assert.equal(
        (await getState(page)).layers[name],
        !initial,
        `${name} state must follow checkbox`,
      );
      if (name === 'markers')
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.map-marker')].every((marker) => marker.hidden),
        );
      await input.setChecked(initial);
      assert.equal((await getState(page)).layers[name], initial);
    }
    assert.match(await page.locator('#quality').textContent(), /极致.*超采样/);
    assert.equal(await page.locator('select#quality').count(), 0);
    assert.ok((await getState(page)).pixelRatio >= 2, 'Maximum quality uses at least 2× sampling');
    await page.locator('#layers-panel [data-close-panel]').click();
    assert.equal(await page.locator('#layers-panel').isVisible(), false);
    return (await getState(page)).layers;
  });

  await check('Sun presets, time slider, and realtime mode update the UI', async () => {
    await page.locator('#sun-toggle').click();
    await page.locator('[data-hour="20"]').click();
    assert.equal(await page.locator('#sun-hour').textContent(), '20:00');
    assert.match(await page.locator('#light-mode').textContent(), /模拟光照 · 20:00 UTC/);
    await page.locator('#time-slider').fill('12.5');
    assert.equal(await page.locator('#sun-hour').textContent(), '12:30');
    await page.locator('#realtime').click();
    assert.match(await page.locator('#light-mode').textContent(), /实时太阳/);
    assert.match(await page.locator('#realtime').getAttribute('class'), /active/);
    await page.locator('[data-hour="10.5"]').click();
    assert.equal(await page.locator('#sun-hour').textContent(), '10:30');
    await page.locator('#sun-panel [data-close-panel]').click();
  });

  await check('Search accepts custom coordinates and rejects invalid ones', async () => {
    await page.locator('#open-search').click();
    await page.locator('#search-input').fill('91, 181');
    assert.match(await page.locator('#search-results').textContent(), /纬度范围/);
    assert.equal(await page.locator('#search-results button').count(), 0);
    const invalidAPI = await page.evaluate(() => {
      try {
        window.earth.focusOn(91, 0);
        return null;
      } catch (error) {
        return { name: error.name, message: error.message };
      }
    });
    assert.equal(invalidAPI?.name, 'RangeError');
    await page.locator('#search-input').fill('-33.8688, 151.2093');
    assert.equal(await page.locator('#search-results button').count(), 1);
    await page.locator('#search-input').press('Enter');
    assert.equal(await page.locator('#search-dialog').isVisible(), false);
    const state = await focusSettled(page, -33.8688, 151.2093);
    assert.equal(await page.locator('#location-name').textContent(), '此时，此地');
    return { invalidAPI, customFocus: state };
  });

  await check('Dragging the actual canvas rotates the globe', async () => {
    const start = await getState(page);
    const drag = await page.locator('#viewport canvas').evaluate((canvas) => {
      const box = canvas.getBoundingClientRect();
      for (const [u, v] of [
        [0.5, 0.6],
        [0.45, 0.7],
        [0.6, 0.4],
      ]) {
        const x = box.left + box.width * u;
        const y = box.top + box.height * v;
        if (document.elementFromPoint(x, y) === canvas) return { x, y };
      }
      return null;
    });
    assert.ok(drag, 'No unobstructed canvas drag location');
    await page.mouse.move(drag.x, drag.y);
    await page.mouse.down();
    await page.mouse.move(drag.x + 140, drag.y + 25, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction((previous) => {
      const actual = window.earth.getState();
      return Math.abs(actual.longitude - previous.longitude) > 2;
    }, start);
    const end = await getState(page);
    return { start, end };
  });

  await desktop.context.close();

  const mobile = await createPage('mobile', {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await check(
    'Fresh 390×844 mobile layout retains full-resolution textures and sampling',
    async () => {
      const page = mobile.page;
      const width = await page.evaluate(() => ({
        inner: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(width.scroll <= width.inner + 1, 'Mobile document has horizontal overflow');
      const bounds = {};
      for (const selector of [
        '#home',
        '#open-search',
        '#viewport canvas',
        '#layers-toggle',
        '#sun-toggle',
        '#rotation-toggle',
        '.location-detail',
        '.destination-section',
        '.footer',
      ]) {
        bounds[selector] = await withinViewport(page, selector);
      }
      assert.ok(
        bounds['.location-detail'].y + bounds['.location-detail'].height <=
          bounds['.destination-section'].y + 1,
        'Mobile location information overlaps destinations',
      );
      assert.match(await page.locator('#quality').textContent(), /极致.*超采样/);
      assert.equal(await page.locator('select#quality').count(), 0);
      const maxTextureSize = await page.locator('#viewport canvas').evaluate((canvas) => {
        const gl = canvas.getContext('webgl2');
        return gl.getParameter(gl.MAX_TEXTURE_SIZE);
      });
      const textures = results.textureRequests.mobile;
      assert.ok(textures.length >= 4, 'Expected all four renderer textures');
      const expectedFiles =
        maxTextureSize >= 8192
          ? [
              maxTextureSize >= 12288 ? 'earth-day-ultra.jpg' : 'earth-day.jpg',
              'earth-night.jpg',
              'earth-clouds.jpg',
              'earth-specular.png',
            ]
          : maxTextureSize >= 4096
            ? ['earth-day-4k.jpg', 'earth-night-4k.jpg', 'earth-clouds.jpg', 'earth-specular.png']
            : [
                'earth-day-2k.jpg',
                'earth-night-2k.jpg',
                'earth-clouds-2k.jpg',
                'earth-specular-2k.png',
              ];
      for (const file of expectedFiles) {
        assert.ok(
          textures.some((texture) => texture.path.endsWith(`/${file}`) && texture.status === 200),
          `Missing maximum supported texture ${file} (GPU limit ${maxTextureSize})`,
        );
      }
      const canvas = await page
        .locator('#viewport canvas')
        .evaluate((canvas) => ({ actual: canvas.width, css: canvas.clientWidth }));
      assert.ok(
        canvas.actual >= canvas.css * 2 - 1,
        'Mobile drawing buffer must retain at least 2× sampling',
      );
      assert.ok((await getState(page)).pixelRatio >= 2);
      for (const panel of ['layers', 'sun']) {
        await page.locator(`#${panel}-toggle`).click();
        await withinViewport(page, `#${panel}-panel`);
        await page.locator(`#${panel}-panel [data-close-panel]`).click();
      }
      return { width, bounds, canvas, textures, maxTextureSize };
    },
  );

  await check('Mobile destination remains clickable and geographically correct', async () => {
    const page = mobile.page;
    if ((await getState(page)).autoRotate) await page.locator('#rotation-toggle').click();
    await page.locator('[data-location="tokyo"]').click();
    return focusSettled(page, 35.6762, 139.6503);
  });
  await mobile.context.close();

  const reduced = await createPage('reduced-motion', {
    viewport: { width: 1024, height: 768 },
    reducedMotion: 'reduce',
  });
  await check('Reduced motion disables initial rotation and makes focus immediate', async () => {
    const page = reduced.page;
    assert.equal((await getState(page)).autoRotate, false);
    assert.equal(await page.locator('#rotation-toggle').getAttribute('aria-pressed'), 'false');
    const synchronous = await page.evaluate(() => {
      window.earth.focusOn(-33.8688, 151.2093, 9_000_000);
      return window.earth.getState();
    });
    assert.ok(Math.abs(synchronous.latitude + 33.8688) < 0.00001);
    assert.ok(Math.abs(synchronous.longitude - 151.2093) < 0.00001);
    assert.ok(Math.abs(synchronous.altitude - 9_000_000) < 1);
    const animation = await page
      .locator('.rotation-wave b')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName);
    assert.equal(animation, 'none');
    return synchronous;
  });
  await reduced.context.close();

  await check('No browser console errors, page exceptions, or failed requests', async () => {
    assert.deepEqual(results.consoleErrors, []);
    assert.deepEqual(results.pageErrors, []);
    assert.deepEqual(results.requestFailures, []);
  });
} catch (error) {
  results.checks.push({
    name: 'Browser setup / initialization',
    passed: false,
    error: error.stack || error.message,
  });
  console.error(error);
} finally {
  await browser.close();
  results.finishedAt = new Date().toISOString();
  results.passed = results.checks.every((check) => check.passed);
  await writeFile(
    resolve(artifactDirectory, 'smoke-results.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(
    `${results.checks.filter((check) => check.passed).length}/${results.checks.length} checks passed. Results: ${artifactDirectory}/smoke-results.json`,
  );
  if (!results.passed) process.exitCode = 1;
}
