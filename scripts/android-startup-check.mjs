import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const adb = process.env.EARTH_ADB || 'C:/Users/small/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const run = (...args) => execFileSync(adb, args, { encoding: 'utf8', timeout: 30000 }).trim();
const app = 'com.example.earthobservatory';
const previous = run('shell', 'settings', 'get', 'global', 'animator_duration_scale');
const results = [];
await mkdir('artifacts/android16', { recursive: true });
try {
  for (const [mode, scale] of [['normal', '1'], ['reduced', '0']]) {
    run('shell', 'settings', 'put', 'global', 'animator_duration_scale', scale);
    run('shell', 'am', 'force-stop', app);
    run('shell', 'am', 'start', '-n', `${app}/.MainActivity`);
    const start = performance.now();
    for (const delay of [0, 250, 750, 1500, 3000, 5000]) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, delay - (performance.now() - start))));
      await writeFile(`artifacts/android16/startup-${mode}-${delay}.png`, execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 12e6 }));
    }
    const socket = run('shell', 'cat', '/proc/net/unix').match(/@(webview_devtools_remote_\d+)/)[1];
    run('forward', 'tcp:9223', `localabstract:${socket}`);
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
    const page = browser.contexts()[0].pages()[0];
    await page.waitForFunction(() => window.earth?.getState().ready, null, { timeout: 90000 });
    const state = await page.evaluate(() => ({ ready: window.earth.getState().ready, rotating: window.earth.getState().autoRotate, dialogs: document.querySelectorAll('dialog[open]').length }));
    if (mode === 'reduced') assert.equal(state.rotating, false);
    results.push({ mode, scale, ...state });
    await browser.close();
    console.log('PASS', mode, state);
  }
} finally {
  run('shell', 'settings', 'put', 'global', 'animator_duration_scale', previous);
  await writeFile('artifacts/android16/startup-results.json', JSON.stringify(results, null, 2));
}
