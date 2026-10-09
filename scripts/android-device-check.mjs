import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const adb =
  process.env.EARTH_ADB || 'C:/Users/small/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const run = (...args) => execFileSync(adb, args, { encoding: 'utf8', timeout: 30000 }).trim();
const app = 'com.example.earthobservatory';
const socket = run('shell', 'cat', '/proc/net/unix').match(/@(webview_devtools_remote_\d+)/)?.[1];
assert.ok(socket, 'Launch debug APK before checking');
run('forward', 'tcp:9223', `localabstract:${socket}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(30000);
const report = {
  sdk: run('shell', 'getprop', 'ro.build.version.sdk'),
  release: run('shell', 'getprop', 'ro.build.version.release'),
  checks: [],
  errors: [],
};
page.on('pageerror', (e) => report.errors.push(e.message));
const save = async (name) => {
  const state = await page.evaluate(() => ({
    window: [innerWidth, innerHeight],
    visual: [visualViewport.width, visualViewport.height],
    safe: ['top', 'bottom', 'left', 'right'].map((side) =>
      getComputedStyle(document.documentElement).getPropertyValue(`--safe-area-inset-${side}`),
    ),
    ready: window.earth?.getState().ready,
  }));
  await writeFile(
    `artifacts/android16/device-${name}.png`,
    execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 12e6 }),
  );
  report.checks.push({ name, ...state });
  console.log(name, state);
};
await mkdir('artifacts/android16', { recursive: true });
try {
  await page.waitForFunction(() => window.earth?.getState().ready, null, { timeout: 90000 });
  await save('phone-ready');
  if (await page.evaluate(() => window.earth.getState().autoRotate))
    await page.locator('#rotation-toggle').click();
  await page.evaluate(() => window.earth.focusOn(34, 108, 800000));
  await page.waitForFunction(() => !window.earth.getState().isFlying);
  await page.locator('#open-search').click();
  await page.locator('#search-input').fill('Paris');
  await page.waitForFunction(() => document.querySelector('#search-results button small'));
  await save('search-keyboard');
  const input = await page.locator('#search-input').boundingBox();
  assert.ok(input.y + input.height <= (await page.evaluate(() => innerHeight)));
  run('shell', 'cmd', 'window', 'user-rotation', 'lock', '1');
  await page.waitForFunction(() => innerWidth > 600);
  assert.equal(await page.locator('#search-input').inputValue(), 'Paris');
  assert.equal(await page.locator('#search-dialog').evaluate((el) => el.open), true);
  await save('landscape-search');
  await page.locator('#search-dialog .dialog-close').click();
  await page.locator('#layers-toggle').click();
  await save('landscape-layers');
  await page.locator('#layers-panel [data-close-panel]').click();
  const before = await page.evaluate(() => {
    const s = window.earth.getState();
    return [s.latitude, s.longitude, s.altitude];
  });
  run('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  run('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`);
  await page.waitForFunction(() => !document.hidden);
  const after = await page.evaluate(() => {
    const s = window.earth.getState();
    return [s.latitude, s.longitude, s.altitude];
  });
  before.forEach((value, i) =>
    assert.ok(Math.abs(value - after[i]) < (i === 2 ? 0.01 : 1e-4), 'Resume reset camera'),
  );
  await save('warm-resume');
  assert.deepEqual(report.errors, []);
} finally {
  run('shell', 'cmd', 'window', 'user-rotation', 'free');
  await writeFile('artifacts/android16/device-results.json', JSON.stringify(report, null, 2));
  await browser.close();
}
