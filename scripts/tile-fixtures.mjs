import { deflateSync } from 'node:zlib';

// A locally generated 256 px test tile. Browser checks never contact map services.
// Sharp roads, blocks and a river make missing textures visible in screenshots.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function createTile() {
  const size = 256;
  const pixels = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const river = Math.abs(x - 110 - Math.sin(y / 48) * 24) < 13;
      const road = x % 48 < 6 || y % 48 < 6;
      const roof = x % 24 > 7 && x % 24 < 21 && y % 24 > 8 && y % 24 < 20;
      const color = river
        ? [30, 123, 165]
        : road
          ? [232, 232, 221]
          : roof
            ? [185, 147, 106]
            : [95, 150, 101];
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      pixels.set(color, offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createLabelTile() {
  const size = 256;
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Only this small label has alpha. The rest must reveal the base tile.
      if (x < 76 || x > 180 || y < 120 || y > 135) continue;
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      const border = x < 78 || x > 178 || y < 122 || y > 133;
      pixels.set(border ? [20, 32, 42, 220] : [247, 248, 236, 210], offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const TILE_FIXTURE = createTile();
export const LABEL_FIXTURE = createLabelTile();
export const TILE_HOSTS = new Set([
  'tiles.maps.eox.at',
  'tile.openstreetmap.org',
  'cyberjapandata.gsi.go.jp',
  'imagery.nationalmap.gov',
  'ibasemaps-api.arcgis.com',
  ...[0, 1, 2, 3].map((shard) => `t${shard}.tianditu.gov.cn`),
]);

export function isTileURL(url) {
  const parsed = new URL(url);
  return /^\/__tiles\//.test(parsed.pathname) || TILE_HOSTS.has(parsed.hostname);
}

export function tileRequest(url) {
  const parsed = new URL(url);
  const relay = parsed.pathname.match(/^\/__tiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\/?$/);
  if (relay) return { source: relay[1], z: +relay[2], x: +relay[3], y: +relay[4] };
  if (/^t[0-3]\.tianditu\.gov\.cn$/.test(parsed.hostname)) {
    const layer = /^\/(vec|cva|img)_w\/wmts$/.exec(parsed.pathname)?.[1];
    const query = parsed.searchParams;
    if (layer && query.get('TILEMATRIXSET') === 'w')
      return {
        source: `tianditu-${layer}`,
        z: Number(query.get('TILEMATRIX')),
        x: Number(query.get('TILECOL')),
        y: Number(query.get('TILEROW')),
      };
  }
  const xyz = parsed.pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.(?:png|jpg)$/);
  const sources = {
    'tile.openstreetmap.org': 'osm-standard',
    'tiles.maps.eox.at': 'eox-sentinel-2025',
    'cyberjapandata.gsi.go.jp': 'gsi-seamlessphoto',
    'imagery.nationalmap.gov': 'usgs-naip',
    'ibasemaps-api.arcgis.com': 'arcgis-world-imagery',
  };
  if (xyz) return { source: sources[parsed.hostname], z: +xyz[1], x: +xyz[2], y: +xyz[3] };
  return { source: sources[parsed.hostname] ?? 'unknown', z: null, x: null, y: null };
}

/** policy(request) may return ok, fail or hold. release() completes held routes. */
export async function installTileFixtures(
  page,
  policy = () => 'ok',
  network = { chinaAvailable: true, region: 'global' },
) {
  const requests = [];
  const failures = [];
  const held = new Set();
  const unexpected = [];
  page.on('requestfailed', (request) => {
    if (isTileURL(request.url()))
      failures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  const fulfill = (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      body:
        tileRequest(route.request().url()).source === 'tianditu-cva' ? LABEL_FIXTURE : TILE_FIXTURE,
    });
  const fail = (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'Fixture outage',
      headers: { 'access-control-allow-origin': '*' },
    });
  await page.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/__earth/network') {
      requests.push({ url: url.href, source: 'network-config', action: 'ok' });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify(network),
      });
    }
    if (!isTileURL(url.href)) {
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
      unexpected.push(url.href);
      return route.abort('blockedbyclient');
    }
    const action = policy(request);
    requests.push({ url: url.href, action, ...tileRequest(url.href) });
    if (action === 'hold') {
      held.add(route);
      return;
    }
    if (action === 'fail') return fail(route);
    return fulfill(route);
  });
  return {
    requests,
    failures,
    held,
    unexpected,
    async release(action = 'ok') {
      const routes = [...held];
      held.clear();
      await Promise.all(
        routes.map((route) =>
          (action === 'fail' ? fail(route) : fulfill(route)).catch(() => undefined),
        ),
      );
    },
  };
}
