import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { installTileFixtures, isTileURL } from './tile-fixtures.mjs';

const out = process.env.EARTH_ARTIFACT_DIR || 'artifacts/search-label-cinzel';
const stage = process.env.EARTH_VISUAL_STAGE || 'after';
const baseURL = process.env.EARTH_TEST_URL || 'http://127.0.0.1:4295';
const baseline = process.env.EARTH_BASELINE_ASSETS === '1';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { browser: browser.version(), stage, cases: [], errors: [] };
try {
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['phone', 393, 852],
  ]) {
    for (const [palette, mode, sample, type] of [
      ['dark', 'satellite', `${out}/dark-sample.jpg`, 'image/jpeg'],
      [
        'bright',
        'satellite',
        'artifacts/search-label-atlas/bright-satellite-sample.jpg',
        'image/jpeg',
      ],
      ['street', 'streets', 'artifacts/search-label-atlas/street-sample.png', 'image/png'],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 2,
        reducedMotion: 'reduce',
      });
      page.on('pageerror', (e) => report.errors.push(e.message));
      await installTileFixtures(page);
      const body = await readFile(sample);
      await page.route('**/*', (route) =>
        isTileURL(route.request().url())
          ? route.fulfill({ status: 200, contentType: type, body })
          : route.fallback(),
      );
      await page.route('**/src/earth/EarthRenderer.ts*', async (route) => {
        const response = await route.fetch(),
          source = await response.text();
        await route.fulfill({
          response,
          body: source.replace(
            'this.searchLabel = new SearchLabelLayer(this.scene);',
            'this.searchLabel = new SearchLabelLayer(this.scene); window.visualEarth=this;',
          ),
        });
      });
      if (baseline)
        await page.route('**/assets/index-*.js', async (route) => {
          const response = await route.fetch(),
            source = await response.text();
          assert.ok(source.includes('this.searchLabel=new'));
          await route.fulfill({
            response,
            body: source.replace(
              'this.searchLabel=new',
              'window.visualEarth=this,this.searchLabel=new',
            ),
          });
        });
      await page.goto(baseURL);
      await page.waitForFunction(() => window.earth?.getState().ready);
      await page.evaluate(() => window.visualEarth.searchLabel.fontPreparation);
      await page.evaluate((mode) => {
        window.visualEarth.setMapMode(mode);
        window.visualEarth.focusLocation('上海', 31.23, 121.47, 250000, 0);
        window.visualEarth.searchLabel.expiresAt = Date.now() + 60000;
      }, mode);
      await page.waitForFunction(
        () =>
          window.visualEarth.searchLabel.ready && window.visualEarth.tiles.getState().loaded > 0,
      );
      await page.waitForTimeout(400);
      for (const [label, text] of [
        ['chinese', '上海'],
        ['english', 'Paris'],
        ['mixed', '上海 Shanghai · Atlas'],
        ['long', 'San Francisco · 圣弗朗西斯科 Shanghai'],
      ]) {
        await page.evaluate((text) => {
          const e = window.visualEarth;
          e.focusLocation(text, 31.23, 121.47, 250000, 0);
          e.searchLabel.expiresAt = Date.now() + 60000;
        }, text);
        await page.waitForFunction(
          () => window.visualEarth.searchLabel.ready && window.visualEarth.searchLabel.text.visible,
        );
        await page.screenshot({ path: `${out}/${stage}-${device}-${palette}-${label}.png` });
        const view = await page.locator('#viewport').boundingBox();
        const clipWidth = Math.min(width, 640);
        await page.screenshot({
          path: `${out}/${stage}-${device}-${palette}-${label}-detail.png`,
          clip: {
            x: view.x + (view.width - clipWidth) / 2,
            y: view.y + view.height / 2 - 35,
            width: clipWidth,
            height: 70,
          },
        });
        report.cases.push({
          device,
          palette,
          label,
          text,
          state: await page.evaluate(() => window.visualEarth.searchLabel.getState()),
        });
      }
      await page.close();
    }
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${out}/${stage}-visual.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ stage, cases: report.cases.length, errors: report.errors }));
