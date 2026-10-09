import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// One bounded live view verifies actual imagery; regressions use local fixtures.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const errors = [],
  samples = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.EARTH_TEST_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.earth?.getState().ready);
  await page.evaluate(() => window.earth.focusOn(35.681236, 139.767125, 600));
  await page.waitForFunction(
    () => {
      const t = window.earth?.getState().tiles;
      return (
        !window.earth?.getState().isFlying &&
        t?.source === 'gsi-seamlessphoto' &&
        t.total > 0 &&
        t.loaded === t.total
      );
    },
    null,
    { timeout: 90000 },
  );
  await page.waitForFunction(() =>
    document.querySelector('#tile-status')?.textContent?.includes('高清已就绪'),
  );
  await page.screenshot({ path: 'artifacts/phase2-tokyo-aerial.png' });
  samples.push(await page.evaluate(() => window.earth.getState()));
  console.log('TOKYO', JSON.stringify(samples.at(-1)));
} finally {
  await writeFile(
    'artifacts/aerial-visual-results.json',
    JSON.stringify(
      {
        errors,
        samples,
        finalState: await page.evaluate(() => window.earth?.getState()).catch(() => null),
      },
      null,
      2,
    ),
  );
  await browser.close();
}
