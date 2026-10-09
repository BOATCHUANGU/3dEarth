import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { installTileFixtures, tileRequest } from './tile-fixtures.mjs';

const baseURL = process.env.EARTH_TEST_URL || 'http://127.0.0.1:4173';
const artifactDirectory = resolve(process.env.EARTH_ARTIFACT_DIR || 'artifacts/china-network');
const direct = process.env.EARTH_EXPECT_DIRECT === 'true';
const results = { baseURL, direct, startedAt: new Date().toISOString(), checks: [] };
await mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
results.browser = { channel: 'msedge', version: browser.version(), headless: true };

async function check(name, operation) {
  try {
    const details = await operation();
    results.checks.push({ name, passed: true, details });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.checks.push({ name, passed: false, error: error.stack || error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function pageFor({
  locale = 'zh-CN',
  timezoneId = 'Asia/Shanghai',
  init,
  config = 'auto',
} = {}) {
  const context = await browser.newContext({
    locale,
    timezoneId,
    reducedMotion: 'reduce',
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  if (init) await page.addInitScript(init);
  const fixtures = await installTileFixtures(page, () => 'ok', {
    chinaAvailable: true,
    region: config,
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.earth?.getState().ready);
  await page.waitForFunction(() => window.earth.getState().network.configuration !== 'loading');
  return { page, context, fixtures };
}

const network = (page) => page.evaluate(() => window.earth.getState().network);

try {
  if (!direct) {
    await check('Auto hints require mainland timezone and Chinese language', async () => {
      const cases = [
        ['zh-CN', 'Asia/Shanghai', 'china'],
        ['en-US', 'Asia/Shanghai', 'global'],
        ['zh-CN', 'America/New_York', 'global'],
        ['zh-Hans-CN', 'Asia/Shanghai', 'china'],
      ];
      const actual = [];
      for (const [locale, timezoneId, expected] of cases) {
        const { page, context } = await pageFor({ locale, timezoneId });
        const state = await network(page);
        assert.equal(state.region, expected);
        assert.equal(state.reason.includes('IP'), false);
        actual.push({ locale, timezoneId, region: state.region });
        await context.close();
      }
      return actual;
    });

    await check(
      'Manual choice persists, auto restores hints, invalid storage is ignored',
      async () => {
        const { page, context } = await pageFor();
        await page.evaluate(() => window.earth.setNetworkProfile('global'));
        assert.equal((await network(page)).region, 'global');
        await page.reload();
        await page.waitForFunction(() => window.earth?.getState().ready);
        assert.equal((await network(page)).preference, 'global');
        await page.evaluate(() => window.earth.setNetworkProfile('china'));
        assert.equal((await network(page)).region, 'china');
        await page.evaluate(() => window.earth.setNetworkProfile('auto'));
        assert.equal((await network(page)).region, 'china');
        await context.close();
        const invalid = await pageFor({
          init: () => localStorage.setItem('earth.network.preference.v1', 'invalid'),
        });
        assert.equal((await network(invalid.page)).preference, 'auto');
        await invalid.context.close();
      },
    );

    await check('Unavailable browser APIs and storage do not block startup', async () => {
      const { page, context } = await pageFor({
        init: () => {
          Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
          Storage.prototype.getItem = () => {
            throw new Error('storage disabled');
          };
          Storage.prototype.setItem = () => {
            throw new Error('storage disabled');
          };
        },
      });
      const state = await network(page);
      assert.equal(state.effectiveType, 'unknown');
      assert.equal(state.concurrency, 8);
      await page.evaluate(() => window.earth.setNetworkProfile('global'));
      assert.equal((await network(page)).region, 'global');
      await context.close();
      return state;
    });

    await check(
      'Slow-network hints change slots and timeout without changing quality',
      async () => {
        const { page, context } = await pageFor({
          init: () => {
            const connection = new EventTarget();
            connection.effectiveType = '3g';
            connection.rtt = 700;
            connection.downlink = 1;
            connection.saveData = true;
            Object.defineProperty(navigator, 'connection', {
              configurable: true,
              value: connection,
            });
            window.__fixtureConnection = connection;
          },
        });
        await page.evaluate(() => window.earth.focusOn(31.2304, 121.4737, 600));
        await page.waitForFunction(() => window.earth.getState().tiles.zoom > 0);
        const before = await page.evaluate(() => window.earth.getState());
        assert.equal(before.network.concurrency, 4);
        assert.equal(before.network.timeoutMs, 20_000);
        await page.evaluate(() => {
          const connection = window.__fixtureConnection;
          connection.effectiveType = '4g';
          connection.rtt = 50;
          connection.downlink = 10;
          connection.saveData = false;
          connection.dispatchEvent(new Event('change'));
        });
        await page.waitForFunction(() => window.earth.getState().network.concurrency === 8);
        const after = await page.evaluate(() => window.earth.getState());
        assert.equal(after.network.timeoutMs, 12_000);
        assert.equal(after.pixelRatio, before.pixelRatio);
        assert.equal(after.tiles.zoom, before.tiles.zoom);
        await context.close();
        return { pixelRatio: before.pixelRatio, zoom: before.tiles.zoom };
      },
    );

    await check('Failed configuration is retried after a manual choice', async () => {
      const context = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const fixtures = await installTileFixtures(page);
      let calls = 0;
      await page.route('**/__earth/network', (route) => {
        calls++;
        return calls === 1
          ? route.fulfill({ status: 200, contentType: 'text/plain', body: 'invalid' })
          : route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ chinaAvailable: true, region: 'auto' }),
            });
      });
      await page.goto(baseURL);
      await page.waitForFunction(
        () => window.earth?.getState().network.configuration === 'unavailable',
      );
      await page.evaluate(() => window.earth.setNetworkProfile('china'));
      await page.waitForFunction(() => window.earth.getState().network.configuration === 'ready');
      assert.equal((await network(page)).chinaAvailable, true);
      assert.equal(calls, 2);
      assert.deepEqual(fixtures.unexpected, []);
      await context.close();
      return { calls };
    });

    await check('Network restoration restarts an in-flight configuration request', async () => {
      const context = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__fixtureOnline = false;
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          get: () => window.__fixtureOnline,
        });
      });
      const fixtures = await installTileFixtures(page);
      let calls = 0;
      await page.route('**/__earth/network', (route) => {
        calls++;
        if (calls === 1) return;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ chinaAvailable: true, region: 'auto' }),
        });
      });
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => window.earth?.getState().network.configuration === 'loading',
      );
      await page.evaluate(() => {
        window.__fixtureOnline = true;
        window.dispatchEvent(new Event('online'));
      });
      await page.waitForFunction(() => window.earth.getState().network.configuration === 'ready');
      assert.equal((await network(page)).chinaAvailable, true);
      assert.equal(calls, 2);
      assert.deepEqual(fixtures.unexpected, []);
      await context.close();
      return { calls };
    });

    await check('Configuration timeout does not block globe initialization', async () => {
      const context = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const fixtures = await installTileFixtures(page);
      await page.route('**/__earth/network', () => {});
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.earth?.getState().ready);
      await page.waitForFunction(
        () => window.earth.getState().network.configuration === 'unavailable',
        null,
        { timeout: 7_000 },
      );
      const state = await network(page);
      assert.equal(state.chinaAvailable, false);
      assert.deepEqual(fixtures.unexpected, []);
      await context.close();
      return { configuration: state.configuration };
    });
  }

  await check('China streets and satellite use distinct compatible layers', async () => {
    const { page, context, fixtures } = await pageFor({ config: 'china' });
    if (!direct) await page.evaluate(() => window.earth.setNetworkProfile('china'));
    await page.evaluate(() => {
      window.earth.setMapMode('streets');
      window.earth.focusOn(31.2304, 121.4737, 12_000);
    });
    await page.waitForFunction(() => {
      const state = window.earth.getState();
      return Math.abs(state.altitude - 12_000) < 1 && !state.isFlying;
    });
    await page.waitForFunction(() => window.earth.getState().tiles.source === 'tianditu-vec');
    await page.waitForFunction(() => window.earth.getState().tiles.labelsLoaded > 0);
    await page.waitForFunction(
      () =>
        document.querySelector('.experience')?.classList.contains('is-near') &&
        document.querySelector('#altitude')?.textContent === '12',
    );
    const street = await page.evaluate(() => window.earth.getState().tiles);
    assert.ok(fixtures.requests.some((r) => r.source === 'tianditu-vec'));
    assert.ok(fixtures.requests.some((r) => r.source === 'tianditu-cva'));
    assert.ok(street.pending <= street.network.concurrency);
    await page.screenshot({
      path: resolve(artifactDirectory, direct ? 'direct-streets.png' : 'china-streets-fixture.png'),
    });
    await page.evaluate(() => window.earth.setMapMode('satellite'));
    await page.waitForFunction(() => window.earth.getState().tiles.source === 'tianditu-img');
    await page.waitForFunction(() => window.earth.getState().tiles.loaded > 0);
    await page.waitForFunction(() => {
      const tiles = window.earth.getState().tiles;
      return (
        tiles.loaded === tiles.total &&
        tiles.credits.length === 1 &&
        tiles.credits[0].id === 'tianditu-img'
      );
    });
    await page.waitForFunction(() =>
      document.querySelector('#tile-status')?.textContent?.includes('天地图 · 卫星影像'),
    );
    const satellite = await page.evaluate(() => window.earth.getState().tiles);
    assert.equal(satellite.labelsTotal, 0);
    assert.ok(fixtures.requests.some((r) => r.source === 'tianditu-img'));
    const tiandituRequests = fixtures.requests.filter((r) => r.source?.startsWith('tianditu-'));
    assert.ok(
      tiandituRequests.every(
        (r) =>
          Number.isInteger(r.z) &&
          Number.isInteger(r.x) &&
          Number.isInteger(r.y) &&
          r.z >= 1 &&
          r.z <= 18 &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.x < 2 ** r.z &&
          r.y < 2 ** r.z,
      ),
    );
    if (direct)
      assert.ok(
        tiandituRequests.every((r) => /^t[0-3]\.tianditu\.gov\.cn$/.test(new URL(r.url).hostname)),
      );
    await page.screenshot({
      path: resolve(
        artifactDirectory,
        direct ? 'direct-satellite.png' : 'china-satellite-fixture.png',
      ),
    });
    assert.deepEqual(fixtures.unexpected, []);
    if (direct)
      assert.equal(
        fixtures.requests.some((r) => r.source === 'network-config'),
        false,
      );
    await context.close();
    return {
      street: { source: street.source, zoom: street.zoom, labelsLoaded: street.labelsLoaded },
      satellite: { source: satellite.source, zoom: satellite.zoom },
      requests: fixtures.requests.length,
    };
  });

  if (!direct) {
    await check('Fallback stays selected after cooldown until manual retry', async () => {
      const context = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      let failChina = true;
      const fixtures = await installTileFixtures(
        page,
        (request) =>
          failChina && tileRequest(request.url()).source === 'tianditu-vec' ? 'fail' : 'ok',
        { chinaAvailable: true, region: 'china' },
      );
      await page.goto(baseURL);
      await page.waitForFunction(() => window.earth?.getState().ready);
      await page.waitForFunction(() => window.earth.getState().network.configuration === 'ready');
      await page.evaluate(() => {
        window.earth.setMapMode('streets');
        window.earth.focusOn(31.2304, 121.4737, 12_000);
      });
      await page.waitForFunction(() => {
        const tiles = window.earth.getState().tiles;
        return tiles.source === 'osm-standard' && tiles.fallback && tiles.loaded > 0;
      });
      const before = fixtures.requests.filter((r) => r.source === 'tianditu-vec').length;
      await page.evaluate(() => {
        const original = Date.now;
        Date.now = () => original() + 120_000;
      });
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => window.earth.getState().tiles.source), 'osm-standard');
      assert.equal(fixtures.requests.filter((r) => r.source === 'tianditu-vec').length, before);
      failChina = false;
      await page.evaluate(() => window.earth.retryTiles());
      await page.waitForFunction(() => window.earth.getState().tiles.source === 'tianditu-vec');
      await page.waitForFunction(() => window.earth.getState().tiles.loaded > 0);
      assert.deepEqual(fixtures.unexpected, []);
      await context.close();
      return { failedChinaRequests: before };
    });
  }

  if (!direct) {
    await check('Unavailable configuration keeps the globe on global sources', async () => {
      const context = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const fixtures = await installTileFixtures(page);
      await page.route('**/__earth/network', (route) =>
        route.fulfill({ status: 404, body: 'missing' }),
      );
      await page.goto(baseURL);
      await page.waitForFunction(() => window.earth?.getState().ready);
      await page.waitForFunction(
        () => window.earth.getState().network.configuration === 'unavailable',
      );
      await page.evaluate(() => {
        window.earth.setNetworkProfile('china');
        window.earth.setMapMode('streets');
        window.earth.focusOn(31.2304, 121.4737, 12_000);
      });
      await page.waitForFunction(() => window.earth.getState().tiles.source === 'osm-standard');
      assert.equal((await network(page)).chinaAvailable, false);
      assert.deepEqual(fixtures.unexpected, []);
      await context.close();
    });
  }
} finally {
  await browser.close();
  results.finishedAt = new Date().toISOString();
  results.passed = results.checks.every((check) => check.passed);
  await writeFile(
    resolve(artifactDirectory, direct ? 'direct-results.json' : 'network-results.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
  if (!results.passed) process.exitCode = 1;
}
