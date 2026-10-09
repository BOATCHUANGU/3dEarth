import { createServer } from 'vite';
import { PerspectiveCamera } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const artifactDirectory = resolve(process.env.EARTH_ARTIFACT_DIR || 'artifacts');

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { geodeticToWorld, WGS84 } = await vite.ssrLoadModule('/src/geo/CoordinateSystem.ts');
  const { viewBounds } = await vite.ssrLoadModule('/src/layers/ViewFootprint.ts');
  const { iterateMercatorTiles, targetZoom } = await vite.ssrLoadModule(
    '/src/layers/MercatorTiles.ts',
  );
  const failures = [];
  let checked = 0;
  let polar = 0;
  let maximum = { count: 0 };
  for (const latitude of [0, 30, 60, 70, 80, 84, 85, 85.05, 86, 87, 88, 89, 89.9, 90])
    for (const altitude of [
      150, 600, 12000, 25000, 80000, 150000, 450000, 750000, 990000, 1500000, 2500000, 3490000,
    ])
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [768, 1024],
        [1024, 768],
        [1440, 900],
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
        [320, 2160],
        [3840, 320],
      ])
        for (const dpr of [2, 3]) {
          checked++;
          const aspect = width / height;
          const fov =
            aspect < 1
              ? (2 * Math.atan(Math.tan((43 * Math.PI) / 360) / aspect) * 180) / Math.PI
              : 43;
          const camera = new PerspectiveCamera(
            fov,
            aspect,
            Math.max(0.1 / WGS84.a, Math.min(0.03, (altitude / WGS84.a) * 0.08)),
            64,
          );
          camera.position.copy(geodeticToWorld(latitude, 0, altitude));
          camera.lookAt(0, 0, 0);
          camera.updateMatrixWorld();
          const bounds = viewBounds(camera);
          if (!bounds || bounds.south > bounds.north) {
            polar++;
            continue;
          }
          const zoom = targetZoom(altitude, latitude, fov, height * dpr, 256, 19);
          const sample = { latitude, altitude, width, height, dpr, zoom };
          try {
            let count = 0;
            for (const tile of iterateMercatorTiles(bounds, zoom)) {
              if (tile.z !== zoom) throw new Error('Unexpected quality downgrade');
              count++;
            }
            if (count > maximum.count) maximum = { count, ...sample };
          } catch (error) {
            failures.push({ ...sample, message: error.message, bounds });
          }
        }
  const result = {
    checked,
    polar,
    failures: failures.length,
    maximum,
    examples: failures.slice(0, 12),
  };
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    resolve(artifactDirectory, 'selection-audit.json'),
    JSON.stringify({ ...result, allFailures: failures }, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await vite.close();
}
