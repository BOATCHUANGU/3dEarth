import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { installTileFixtures } from './tile-fixtures.mjs';
const out = process.env.EARTH_ARTIFACT_DIR || 'artifacts/search-label-grand-title/lifecycle';
const baseURL = process.env.EARTH_TEST_URL || 'http://127.0.0.1:4285';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { browser: browser.version(), errors: [], shaderErrors: [], cases: [] };
try {
  for (const [name, width, height, reducedMotion] of [
    ['desktop', 1440, 1000, 'no-preference'],
    ['phone', 393, 852, 'no-preference'],
    ['reduced', 393, 852, 'reduce'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      reducedMotion,
    });
    const page = await context.newPage();
    const fontRequests = [];
    page.on('pageerror', (e) => report.errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && /shader|WebGL|GL_INVALID/i.test(m.text()))
        report.shaderErrors.push(m.text());
      if (m.type() === 'error' || m.type() === 'warn') console.log(m.type(), m.text());
    });
    page.on('response', (r) => {
      if (/fonts\//.test(r.url())) fontRequests.push({ url: r.url(), status: r.status() });
    });
    await installTileFixtures(page);
    // Test-only access to the actual layer, with no application source or API mutation.
    await page.route('**/src/layers/SearchLabelLayer.ts*', async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      assert.ok(source.includes('this.fontPreparation = prepareSearchFonts();'));
      await route.fulfill({
        response,
        body: source.replace(
          'this.fontPreparation = prepareSearchFonts();',
          'this.fontPreparation = prepareSearchFonts(); window.testLabel = this; const originalUpdate = this.update; this.update = function(camera,...args) {window.testCamera = camera; return originalUpdate.call(this,camera,...args)};',
        ),
      });
    });

    await page.route('**/src/earth/EarthRenderer.ts*', async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      await route.fulfill({
        response,
        body: source.replace(
          'this.searchLabel = new SearchLabelLayer(this.scene);',
          'this.searchLabel = new SearchLabelLayer(this.scene); window.testEarth = this;',
        ),
      });
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => window.earth?.getState().ready);
    console.log('fonts ready', await page.evaluate(() => window.testLabel.fontPreparation));
    if (await page.evaluate(() => window.earth.getState().autoRotate))
      await page.locator('#rotation-toggle').click();
    const select = async (text = '上海') => {
      await page.locator('#open-search').click();
      await page.locator('#search-results button').filter({ hasText: text }).click();
    };
    await select();
    await page.evaluate(() => {
      window.frames = [];
      const tick = () => {
        const s = window.earth.getState();
        window.frames.push({
          time: performance.now(),
          progress: s.flightProgress,
          flying: s.isFlying,
          ...s.searchLabel,
        });
        if (s.searchLabel.present) requestAnimationFrame(tick);
      };
      tick();
    });
    const shots = [];
    const shot = async (stage) => {
      const before = await page.evaluate(() => window.earth.getState());
      await page.screenshot({ path: `${out}/${name}-${stage}.png` });
      const after = await page.evaluate(() => window.earth.getState());
      shots.push({ stage, before, after });
    };
    if (reducedMotion !== 'reduce') {
      await page.waitForFunction(() => window.earth.getState().flightProgress >= 0.2);
      await shot('early');
      await page.waitForFunction(() => window.earth.getState().flightProgress >= 0.83);
      await shot('late');
    }
    await page.waitForFunction(
      () => !window.earth.getState().isFlying && window.earth.getState().searchLabel.visible,
    );
    await shot('arrival');
    await page.waitForFunction(() => !window.earth.getState().searchLabel.present);
    const frames = await page.evaluate(() => window.frames);
    const arrival = frames.find((f) => !f.flying && f.present && f.ready && f.visible);
    assert.ok(arrival?.ready && arrival.opacity > 0.999);
    const lifetime = frames.at(-1).time - arrival.time;
    assert.ok(lifetime > (reducedMotion === 'reduce' ? 2750 : 3250) && lifetime < 4000);
    if (reducedMotion !== 'reduce')
      assert.ok(frames.filter((f) => f.progress < 2 / 3).every((f) => f.opacity === 0));
    await select();
    await page.waitForFunction(
      () => !window.earth.getState().isFlying && window.earth.getState().searchLabel.ready,
    );
    await page.evaluate(() => {
      window.zoomFrames = [];
      const tick = () => {
        const s = window.earth.getState().searchLabel;
        window.zoomFrames.push(s);
        if (s.present) requestAnimationFrame(tick);
      };
      tick();
    });
    await shot('zoom-start');
    await page.evaluate(() => {
      window.startZoomSize = window.testLabel.getState().projectedSize;
    });
    await page.locator('#zoom-in').click();
    await page.waitForFunction(
      () => window.testLabel.getState().projectedSize > window.startZoomSize * 1.05,
    );
    await shot('zoom-in');
    await page.waitForTimeout(100);
    await page.locator('#zoom-in').click();
    await page.waitForTimeout(100);
    await shot('zoom');
    await page.locator('#zoom-out').click();
    await page.waitForFunction(
      () =>
        window.testLabel.getState().present &&
        window.testLabel.getState().projectedSize < window.startZoomSize * 1.7,
    );
    await shot('zoom-out');
    await page.waitForTimeout(100);
    const zoomFrames = await page.evaluate(() => window.zoomFrames);
    const first = zoomFrames[0];
    assert.ok(
      zoomFrames
        .filter((f) => f.present)
        .every(
          (f) =>
            f.scale === first.scale &&
            JSON.stringify(f.position) === JSON.stringify(first.position) &&
            JSON.stringify(f.quaternion) === JSON.stringify(first.quaternion),
        ),
    );
    // Exercise mixed/long labels using the actual layer, renderer, camera and fonts.
    const custom = async (text) => {
      await page.evaluate((text) => {
        const s = window.earth.getState();
        window.testEarth.focusLocation(text, s.latitude, s.longitude, s.altitude, 0);
      }, text);
      await page.waitForFunction(() => window.earth.getState().searchLabel.ready);
    };
    await custom('上海 Shanghai');
    await shot('mixed');
    // Hold only this test-created mesh for spatial inspection. Arrival timing above is real.
    await page.evaluate(() => {
      window.testLabel.expiresAt = Date.now() + 60000;
    });
    const spatialZoom = [];
    await page.evaluate(() => {
      window.testEarth.controls.setSuspended(true);
      window.atlasCameraPosition = window.testCamera.position.clone();
      window.atlasScale = window.testLabel.text.scale.x;
    });
    for (const ratio of [1, 1.5, 2.25, 3]) {
      const state = await page.evaluate((ratio) => {
        const c = window.testCamera,
          layer = window.testLabel,
          t = layer.text;
        c.position
          .copy(t.position)
          .addScaledVector(
            layer.normal,
            (layer.worldSize *
              document.querySelector('#viewport').clientHeight *
              c.projectionMatrix.elements[5]) /
              (2 * layer.getState().nominalArrivalSize * ratio),
          );
        c.lookAt(t.position);
        c.updateMatrixWorld();
        layer.update(c, innerWidth, document.querySelector('#viewport').clientHeight);
        return layer.getState();
      }, ratio);
      assert.equal(state.scale, await page.evaluate(() => window.atlasScale));
      assert.ok(Math.abs(state.fittedProjectedSize / state.fittedArrivalSize - ratio) < 0.001);
      const fade = Math.max(0, Math.min(1, (ratio - 1.5) / 1.5));
      assert.ok(Math.abs(state.zoomOpacity - (1 - fade * fade * (3 - 2 * fade))) < 0.001);
      await shot(`fade-${ratio}`);
      spatialZoom.push({ ratio, state });
    }
    await page.evaluate(() => {
      const c = window.testCamera;
      c.position.copy(window.atlasCameraPosition);
      c.lookAt(window.testLabel.text.position);
      c.updateMatrixWorld();
      window.testEarth.controls.setSuspended(false);
    });
    const mesh = await page.evaluate(() => {
      const t = window.testLabel.text;
      const materials = Array.isArray(t.material) ? t.material : [t.material];
      return {
        text: t.text,
        font: t.font,
        bounds: t.textRenderInfo.blockBounds,
        glyphCount: t.textRenderInfo.glyphAtlasIndices.length,
        depthTest: materials.every((m) => m.depthTest),
        depthWrite: materials.some((m) => m.depthWrite),
        outlineBlur: t.outlineBlur,
        outlineWidth: t.outlineWidth,
        detail: t.glyphGeometryDetail,
        letterSpacing: t.letterSpacing,
        metadataColorsDisabled:
          !t.textRenderInfo.glyphColors &&
          !t.geometry.getAttribute('aTroikaGlyphColor') &&
          !t.material.uniforms.uTroikaUseGlyphColors.value,
        quaternion: t.quaternion.toArray(),
      };
    });
    assert.ok(mesh.glyphCount >= 10 && mesh.depthTest && !mesh.depthWrite);
    assert.ok(mesh.detail >= 16 && mesh.outlineWidth === 0 && mesh.outlineBlur === 0);
    assert.ok(mesh.font.endsWith('EarthCinzel-Medium.woff'));
    assert.ok(mesh.metadataColorsDisabled);
    await custom('上海 Shanghai · Atlas');
    const punctuation = await page.evaluate(() => {
      const t = window.testLabel.text,
        b = t.textRenderInfo.glyphBounds;
      return {
        cjkGapEm: (b[8] - b[6]) / t.fontSize,
        dotAfterI: b[10 * 4] > b[9 * 4 + 2],
        aAfterDot: b[11 * 4] > b[10 * 4 + 2],
      };
    });
    assert.ok(punctuation.cjkGapEm > 0 && punctuation.cjkGapEm < 0.7, JSON.stringify(punctuation));
    assert.ok(punctuation.dotAfterI && punctuation.aAfterDot, JSON.stringify(punctuation));
    await shot('mixed-punctuation');
    await page.evaluate(() => {
      window.testLabel.expiresAt = Date.now() + 60000;
    });
    if (name === 'desktop') {
      await page.evaluate(() => {
        const e = window.testEarth,
          c = window.testCamera,
          t = window.testLabel.text;
        window.savedCamera = { p: c.position.clone(), q: c.quaternion.clone() };
        e.controls.setSuspended(true);
        const normal = window.testLabel.normal;
        const east = c.position.clone().set(1, 0, 0).applyQuaternion(t.quaternion);
        c.position.copy(t.position).addScaledVector(normal, 0.018).addScaledVector(east, 0.027);
        c.lookAt(t.position);
        c.updateMatrixWorld();
      });
      await shot('oblique');
      await page.evaluate(() => {
        const c = window.testCamera;
        c.position.copy(window.savedCamera.p);
        c.quaternion.copy(window.savedCamera.q);
        c.updateMatrixWorld();
        window.testEarth.controls.setSuspended(false);
      });
      await page.evaluate(() => {
        const s = window.earth.getState();
        window.testLabel.show(
          '背面',
          -s.latitude,
          s.longitude > 0 ? s.longitude - 180 : s.longitude + 180,
          false,
        );
      });
      await page.waitForFunction(() => window.earth.getState().searchLabel.ready);
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => window.earth.getState().searchLabel.visible), false);
      await shot('back');
    }
    await custom('San Francisco · 圣弗朗西斯科 Shanghai');
    await shot('long');
    const fitted = await page.evaluate(() => {
      const t = window.testLabel.text,
        b = t.textRenderInfo.blockBounds;
      return {
        widthPx:
          ((b[2] - b[0]) / t.fontSize) * window.testLabel.getState().nominalArrivalSize * t.scale.x,
        maxWidthPx: window.testLabel.getState().maxArrivalWidth,
      };
    });
    assert.ok(fitted.widthPx <= fitted.maxWidthPx + 0.01);
    await custom('Unsupported 🦄');
    assert.match(await page.evaluate(() => window.earth.getState().searchLabel.name), /□/);
    await select('纽约');
    await select('东京');
    await page.waitForFunction(
      () => !window.earth.getState().isFlying && window.earth.getState().searchLabel.ready,
    );
    assert.equal(await page.evaluate(() => window.earth.getState().searchLabel.name), '东京');
    await page.locator('#home').click();
    assert.equal(await page.evaluate(() => window.earth.getState().searchLabel.present), false);
    await page.locator('#open-search').click();
    await page.locator('#search-input').fill('Paris');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#search-results button small')].some((el) =>
        el.textContent.includes('(FR)'),
      ),
    );
    await page.locator('#search-results button').filter({ hasText: '(FR)' }).first().click();
    await page.waitForFunction(
      () => !window.earth.getState().isFlying && window.earth.getState().searchLabel.ready,
    );
    await shot('english');
    await page.locator('#open-search').click();
    await page.locator('#search-input').fill('31.23, 121.47');
    await page.locator('#search-results button').click();
    await page.waitForFunction(
      () => !window.earth.getState().isFlying && window.earth.getState().searchLabel.ready,
    );
    await shot('coordinates');
    await custom('后台');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(3150);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => window.earth.getState().searchLabel.present), false);
    if (reducedMotion !== 'reduce') {
      await select('纽约');
      await page.waitForFunction(() => window.earth.getState().isFlying);
      const b = await page.locator('canvas').first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2 + 30, { steps: 4 });
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.earth.getState().searchLabel.present), false);
    }
    assert.ok(
      fontRequests.every(
        (r) => new URL(r.url).origin === new URL(baseURL).origin && r.status === 200,
      ),
    );
    report.cases.push({
      name,
      lifetime,
      fontRequests,
      mesh,
      shots,
      zoomFrameCount: zoomFrames.length,
      spatialZoom,
      punctuation,
      fitted,
    });
    await custom('上下文中断');
    await page.evaluate(() =>
      window.testEarth.renderer.domElement.dispatchEvent(
        new Event('webglcontextlost', { cancelable: true }),
      ),
    );
    assert.equal(await page.evaluate(() => window.testLabel.getState().present), false);
    await page.evaluate(() => {
      window.testLabel.dispose();
      window.testLabel.show('disposed', 0, 0, false);
    });
    assert.equal(await page.evaluate(() => window.testLabel.getState().present), false);
    await writeFile(`${out}/${name}-frames.json`, JSON.stringify({ frames, zoomFrames }, null, 2));
    await context.close();
  }
  // Font failure is a controlled no-label state, with navigation still usable.
  const failed = await browser.newContext({
    viewport: { width: 393, height: 852 },
    reducedMotion: 'reduce',
  });
  const failurePage = await failed.newPage();
  const failureRequests = [];
  await installTileFixtures(failurePage);
  await failurePage.route('**/fonts/EarthCJKSerif-Medium.woff', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' }),
  );
  failurePage.on('request', (r) => {
    if (/fonts|unicode/.test(r.url())) failureRequests.push(r.url());
  });
  await failurePage.goto(baseURL);
  await failurePage.waitForFunction(() => window.earth?.getState().ready);
  await failurePage.locator('#open-search').click();
  await failurePage.locator('#search-results button').filter({ hasText: '上海' }).click();
  await failurePage.waitForFunction(
    () => window.earth.getState().searchLabel.status === 'font-unavailable',
  );
  const failureState = await failurePage.evaluate(() => window.earth.getState());
  assert.ok(!failureState.isFlying && !failureState.searchLabel.visible);
  assert.ok(failureRequests.every((url) => new URL(url).origin === new URL(baseURL).origin));
  report.fontFailure = { state: failureState, requests: failureRequests };
  await failed.close();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.shaderErrors, []);
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ cases: report.cases.map((c) => c.name), errors: report.errors }));
