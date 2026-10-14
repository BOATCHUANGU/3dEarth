import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { installTileFixtures, isTileURL } from './tile-fixtures.mjs';
const out = 'artifacts/search-label-grand-title';
const stage = process.env.EARTH_VISUAL_STAGE || 'after';
const baseURL = process.env.EARTH_TEST_URL || 'http://127.0.0.1:4295';
const archived = process.env.EARTH_BASELINE_ASSETS === '1';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = {
  stage,
  browser: browser.version(),
  cases: [],
  spatial: [],
  errors: [],
  shaderErrors: [],
};
try {
  for (const [device, width, height, nativeCSS] of [
    ['reference', 1230, 623, false],
    ['desktop', 1440, 1000, false],
    ['phone', 393, 852, true],
    ['landscape', 852, 393, true],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => report.errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && /shader|WebGL|GL_INVALID/i.test(m.text()))
        report.shaderErrors.push(m.text());
    });
    await installTileFixtures(page);
    let sample = await readFile('artifacts/search-label-cinzel/dark-sample.jpg'),
      mime = 'image/jpeg';
    await page.route('**/*', (route) =>
      isTileURL(route.request().url())
        ? route.fulfill({ status: 200, contentType: mime, body: sample })
        : route.fallback(),
    );
    await page.route('**/src/earth/EarthRenderer.ts*', async (route) => {
      const response = await route.fetch(),
        source = await response.text();
      await route.fulfill({
        response,
        body: source.replace(
          'this.searchLabel = new SearchLabelLayer(this.scene);',
          'this.searchLabel = new SearchLabelLayer(this.scene); window.titleEarth=this;',
        ),
      });
    });
    if (archived) {
      await page.route('**/assets/index-*.js', async (route) => {
        const response = await route.fetch(),
          source = await response.text();
        await route.fulfill({
          response,
          body: source.replace(
            'this.searchLabel=new',
            'window.titleEarth=this,this.searchLabel=new',
          ),
        });
      });
      await page.route('**/node_modules/.vite/deps/**', async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({
          url: 'http://127.0.0.1:4295' + url.pathname + url.search,
        });
        await route.fulfill({ response });
      });
    }
    await page.goto(baseURL);
    await page.waitForFunction(() => window.earth?.getState().ready);
    await page.evaluate(() => window.titleEarth.searchLabel.fontPreparation);
    if (nativeCSS) {
      await page.evaluate(() => document.documentElement.classList.add('native-android'));
      await page.waitForTimeout(100);
    }
    const focus = async (text) => {
      await page.evaluate((text) => {
        const e = window.titleEarth;
        e.controls.setSuspended(false);
        e.focusLocation(text, 35.6762, 139.6503, 250000, 0);
        e.searchLabel.expiresAt = Date.now() + 60000;
      }, text);
      await page.waitForFunction(
        () => window.titleEarth.searchLabel.ready && window.titleEarth.searchLabel.text.visible,
      );
      await page.waitForTimeout(80);
      await page.waitForFunction(
        () => document.querySelector('#altitude').textContent.replace(/[,\s]/g, '') === '250',
      );
      await page.evaluate(() => window.titleEarth.controls.setSuspended(true));
    };
    for (const [label, text] of [
      ['tokyo', '东京'],
      ['three', '大阪市'],
      ['four', '圣彼得堡'],
      ['english', 'Paris'],
      ['mixed', '东京 Tokyo · Atlas'],
      ['long', 'San Francisco · 圣弗朗西斯科 Shanghai'],
      ['coordinates', '35.68° N · 139.65° E'],
    ]) {
      await focus(text);
      // Scene on/off pixel difference measures rendered ink, excluding the invisible SDF quad.
      const measurement = await page.evaluate(async () => {
        const { WebGLRenderTarget, Color } = await import('/node_modules/.vite/deps/three.js');
        const e = window.titleEarth,
          r = e.renderer,
          t = e.searchLabel.text,
          c = e.camera;
        const dpr = r.getPixelRatio(),
          w = Math.round(e.width * dpr),
          h = Math.round(e.height * dpr);
        const rt = new WebGLRenderTarget(w, h),
          previous = r.getRenderTarget(),
          color = r.getClearColor(new Color()),
          alpha = r.getClearAlpha();
        const read = () => {
          r.render(e.scene, c);
          const p = new Uint8Array(w * h * 4);
          r.readRenderTargetPixels(rt, 0, 0, w, h, p);
          return p;
        };
        let minX = w,
          minY = h,
          maxX = -1,
          maxY = -1,
          pixels = 0;
        try {
          r.setRenderTarget(rt);
          t.visible = true;
          const on = read();
          t.visible = false;
          const off = read();
          for (let i = 0; i < on.length; i += 4)
            if (
              Math.max(
                Math.abs(on[i] - off[i]),
                Math.abs(on[i + 1] - off[i + 1]),
                Math.abs(on[i + 2] - off[i + 2]),
              ) >= 4
            ) {
              const p = i / 4,
                x = p % w,
                y = Math.floor(p / w);
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
              pixels++;
            }
        } finally {
          t.visible = true;
          r.setRenderTarget(previous);
          r.setClearColor(color, alpha);
          rt.dispose();
        }
        const view = e.container.getBoundingClientRect(),
          bar = document.querySelector('.toolbar').getBoundingClientRect();
        return {
          viewport: [e.width, e.height],
          dpr,
          toolbar: {
            left: bar.left - view.left,
            top: bar.top - view.top,
            right: bar.right - view.left,
            bottom: bar.bottom - view.top,
          },
          ink: {
            x: minX / dpr,
            y: (h - 1 - maxY) / dpr,
            width: (maxX - minX + 1) / dpr,
            height: (maxY - minY + 1) / dpr,
            pixels,
          },
          ratio: (maxX - minX + 1) / dpr / e.width,
          state: e.searchLabel.getState(),
          camera: { position: c.position.toArray(), quaternion: c.quaternion.toArray() },
        };
      });
      assert.ok(measurement.ink.pixels > 0, `${device}/${label} no rendered ink`);
      if (!archived) {
        const { ink, viewport, toolbar, state, ratio } = measurement;
        assert.ok(state.opacity > 0.999, `${device}/${label} should be fully readable at arrival`);
        assert.equal(state.color, 0xf2deae);
        assert.ok(ink.width <= state.maxArrivalWidth + 2);
        assert.ok(
          ink.x >= 0 &&
            ink.y >= 0 &&
            ink.x + ink.width <= viewport[0] &&
            ink.y + ink.height <= viewport[1],
        );
        assert.ok(
          ink.x + ink.width < toolbar.left ||
            ink.x > toolbar.right ||
            ink.y + ink.height < toolbar.top ||
            ink.y > toolbar.bottom,
          `${device}/${label} touches toolbar`,
        );
        if (label === 'tokyo')
          assert.ok(
            device === 'phone'
              ? ratio >= 0.45 && ratio <= 0.6
              : device === 'landscape'
                ? ratio >= 0.25 && ratio <= 0.4
                : ratio >= 0.2 && ratio <= 0.24,
          );
      }
      await page.screenshot({ path: `${out}/${stage}-${device}-dark-${label}.png` });
      report.cases.push({ device, nativeCSS, palette: 'dark', label, text, ...measurement });
    }
    for (const [palette, mode, file, type] of [
      [
        'bright',
        'satellite',
        'artifacts/search-label-atlas/bright-satellite-sample.jpg',
        'image/jpeg',
      ],
      ['street', 'streets', 'artifacts/search-label-atlas/street-sample.png', 'image/png'],
    ]) {
      sample = await readFile(file);
      mime = type;
      // Recreate the layer's texture cache only in this test so the new palette sample replaces it.
      await page.evaluate((mode) => {
        window.titleEarth.setMapMode(mode);
        for (const entry of [...window.titleEarth.tiles.entries.values()])
          window.titleEarth.tiles.free(entry);
      }, mode);
      await focus('东京');
      await page
        .waitForFunction(
          (palette) =>
            palette === 'bright'
              ? window.titleEarth.tiles.searchLabelLuminance(35.6762, 139.6503) !== undefined
              : window.titleEarth.tiles.hasLightMapBackground,
          palette,
        )
        .catch(async (error) => {
          console.log(
            'palette diagnostic',
            device,
            palette,
            await page.evaluate(() => ({
              tiles: window.titleEarth.tiles.getState(),
              luminance: window.titleEarth.tiles.searchLabelLuminance(35.6762, 139.6503),
              light: window.titleEarth.tiles.hasLightMapBackground,
              entries: [...window.titleEarth.tiles.entries.values()]
                .filter((e) => e.mesh?.visible)
                .map((e) => ({ tile: e.tile, fade: e.mesh.material.uniforms.fade.value })),
            })),
          );
          throw error;
        });
      await page.screenshot({ path: `${out}/${stage}-${device}-${palette}-tokyo.png` });
      const tokyoState = await page.evaluate(() => window.titleEarth.searchLabel.getState());
      const paletteHint = await page.evaluate(() => ({
        luminance: window.titleEarth.tiles.searchLabelLuminance(35.6762, 139.6503),
        lightMap: window.titleEarth.tiles.hasLightMapBackground,
        zoom: window.titleEarth.tiles.getState().zoom,
      }));
      if (!archived) {
        if (paletteHint.lightMap || paletteHint.luminance > 0.27)
          assert.equal(tokyoState.color, 0x644a2b);
        if (!paletteHint.lightMap && paletteHint.luminance < 0.19)
          assert.equal(tokyoState.color, 0xf2deae);
        assert.ok(tokyoState.opacity > 0.999);
      }
      report.cases.push({ device, palette, label: 'tokyo', paletteHint, state: tokyoState });
      await focus('San Francisco · 圣弗朗西斯科 Shanghai');
      await page.screenshot({ path: `${out}/${stage}-${device}-${palette}-long.png` });
      const longState = await page.evaluate(() => window.titleEarth.searchLabel.getState());
      if (!archived) {
        assert.equal(longState.color, tokyoState.color);
        assert.ok(longState.opacity > 0.999);
      }
      report.cases.push({ device, palette, label: 'long', state: longState });
    }
    if (!archived) {
      const arrival = await page.evaluate(() => {
        const e = window.titleEarth,
          t = e.searchLabel.text;
        window.titleCamera = { p: e.camera.position.clone(), q: e.camera.quaternion.clone() };
        window.titleSyncs = 0;
        const update = t.geometry.updateGlyphs;
        t.geometry.updateGlyphs = function (...args) {
          window.titleSyncs++;
          return update.apply(this, args);
        };
        return e.searchLabel.getState();
      });
      const zoom = [];
      for (const ratio of [1, 1.05, 1.2, 1.5, 2.25, 3]) {
        const state = await page.evaluate((ratio) => {
          const e = window.titleEarth,
            c = e.camera,
            l = e.searchLabel,
            t = l.text;
          c.position
            .copy(t.position)
            .addScaledVector(
              l.normal,
              (l.worldSize * e.height * c.projectionMatrix.elements[5]) /
                (2 * l.getState().nominalArrivalSize * ratio),
            );
          c.lookAt(t.position);
          c.updateMatrixWorld();
          l.update(c, e.width, e.height);
          return l.getState();
        }, ratio);
        assert.equal(state.scale, arrival.scale);
        assert.deepEqual(state.position, arrival.position);
        assert.deepEqual(state.quaternion, arrival.quaternion);
        assert.equal(state.expiresAt, arrival.expiresAt);
        assert.ok(Math.abs(state.fittedProjectedSize / state.fittedArrivalSize - ratio) < 0.001);
        assert.ok(state.opacity <= (zoom.at(-1)?.state.opacity ?? 1) + 0.001);
        if (ratio === 1) assert.ok(state.opacity > 0.999);
        if (ratio === 1.5 || ratio === 1.05)
          await page.screenshot({ path: `${out}/${stage}-${device}-long-zoom-${ratio}.png` });
        zoom.push({ ratio, state });
      }
      await page.evaluate(() => {
        const e = window.titleEarth;
        e.camera.position.copy(window.titleCamera.p);
        e.camera.quaternion.copy(window.titleCamera.q);
        e.camera.updateMatrixWorld();
      });
      const spatial = { device, zoom };
      if (device === 'phone') {
        await page.setViewportSize({ width: 852, height: 393 });
        await page.waitForTimeout(180);
        const rotated = await page.evaluate(() => ({
          state: window.titleEarth.searchLabel.getState(),
          exclusion: window.titleEarth.searchLabel.screenExclusion,
          syncs: window.titleSyncs,
          viewport: [window.titleEarth.width, window.titleEarth.height],
        }));
        assert.equal(rotated.state.scale, arrival.scale);
        assert.deepEqual(rotated.state.position, arrival.position);
        assert.deepEqual(rotated.state.quaternion, arrival.quaternion);
        assert.equal(rotated.state.expiresAt, arrival.expiresAt);
        assert.equal(rotated.syncs, 0);
        assert.ok(rotated.exclusion.top < 60 && rotated.exclusion.right > 800);
        await page.screenshot({ path: `${out}/${stage}-phone-resized-landscape.png` });
        spatial.rotated = rotated;
      }
      assert.equal(await page.evaluate(() => window.titleSyncs), 0);
      report.spatial.push(spatial);
    }
    await page.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.shaderErrors, []);
} finally {
  await writeFile(`${out}/${stage}-results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ stage, cases: report.cases.length, errors: report.errors }));
