import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createTileRelay, upstreamURL } from '../server/tile-relay.mjs';

const tilePath = '/__tiles/osm-standard/19/439052/214226';
const image = (headers = {}) =>
  new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600', ...headers },
  });
async function withRelay(options, action) {
  const relay = createTileRelay(options);
  const server = http.createServer((req, res) => void relay(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await action(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('only bounded, known XYZ sources can reach upstream', async () => {
  for (const args of [
    ['unknown', 0, 0, 0],
    ['constructor', 0, 0, 0],
    ['osm-standard', 20, 0, 0],
    ['osm-standard', 2, 4, 0],
    ['osm-standard', 2, -1, 0],
    ['gsi-seamlessphoto', 13, 0, 0],
  ])
    assert.equal(upstreamURL(...args), null);
  assert.equal(upstreamURL('arcgis-world-imagery', 1, 0, 0), null);
  assert.match(upstreamURL('eox-sentinel-2025', 3, 2, 1), /\/3\/1\/2.jpg$/);
  let called = 0;
  await withRelay(
    {
      fetchImpl: async () => {
        called++;
        return image();
      },
    },
    async (base) => {
      for (const route of [
        '/__tiles/https/0/0/0',
        '/__tiles/osm-standard/19/99999999/0',
        '/__tiles/osm-standard/1/0/0/extra',
      ])
        assert.equal((await fetch(base + route)).status, 400);
      assert.equal((await fetch(base + tilePath, { method: 'POST' })).status, 405);
      assert.equal(called, 0);
    },
  );
});

test('fresh requested tiles are cached; identification and real referer reach provider', async () => {
  let called = 0;
  await withRelay(
    {
      fetchImpl: async (_url, options) => {
        called++;
        assert.match(options.headers['user-agent'], /^EarthObservatory\//);
        assert.equal(options.headers.referer, 'http://127.0.0.1:5173/');
        assert.equal(options.headers.origin, 'http://127.0.0.1:5173');
        assert.equal(options.headers['cache-control'], undefined);
        return image({ etag: '"tile-v1"' });
      },
    },
    async (base) => {
      const first = await fetch(base + tilePath, {
        headers: { referer: 'http://127.0.0.1:5173/' },
      });
      assert.equal(first.status, 200);
      assert.equal((await first.arrayBuffer()).byteLength, 4);
      assert.equal((await fetch(base + tilePath)).status, 200);
      assert.equal(
        (await fetch(base + tilePath, { headers: { 'if-none-match': '"tile-v1"' } })).status,
        304,
      );
      assert.equal(called, 1);
    },
  );
});

test('stale tiles use conditional revalidation and reuse image on 304', async () => {
  let called = 0;
  await withRelay(
    {
      fetchImpl: async (_url, options) => {
        called++;
        if (called === 1) return image({ etag: '"old"', 'cache-control': 'max-age=0' });
        assert.equal(options.headers['if-none-match'], '"old"');
        return new Response(null, {
          status: 304,
          headers: { 'cache-control': 'max-age=3600', date: new Date().toUTCString() },
        });
      },
    },
    async (base) => {
      await fetch(base + tilePath);
      const refreshed = await fetch(base + tilePath);
      assert.equal((await refreshed.arrayBuffer()).byteLength, 4);
      await fetch(base + tilePath);
      assert.equal(called, 2);
    },
  );
});

test('no-store responses are never retained', async () => {
  let called = 0;
  await withRelay(
    {
      fetchImpl: async () => {
        called++;
        return image({ 'cache-control': 'no-store' });
      },
    },
    async (base) => {
      await fetch(base + tilePath);
      await fetch(base + tilePath);
      assert.equal(called, 2);
    },
  );
});

test('browser validators survive a relay restart without redownloading imagery', async () => {
  await withRelay(
    {
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers['if-none-match'], '"browser-cached"');
        return new Response(null, {
          status: 304,
          headers: { etag: '"browser-cached"', 'cache-control': 'max-age=3600' },
        });
      },
    },
    async (base) => {
      const result = await fetch(base + tilePath, {
        headers: { 'if-none-match': '"browser-cached"' },
      });
      assert.equal(result.status, 304);
    },
  );
});

test('304 cache policy changes remove stored images', async () => {
  let called = 0;
  await withRelay(
    {
      fetchImpl: async (_url, options) => {
        called++;
        if (called === 1) return image({ etag: '"old"', 'cache-control': 'max-age=0' });
        if (called === 2)
          return new Response(null, { status: 304, headers: { 'cache-control': 'no-store' } });
        assert.equal(options.headers['if-none-match'], undefined);
        return image();
      },
    },
    async (base) => {
      await fetch(base + tilePath);
      await fetch(base + tilePath);
      await fetch(base + tilePath);
      assert.equal(called, 3);
    },
  );
});

test('HTTP 200 denial images and non-image responses are reported as failures', async () => {
  for (const response of [
    () => image({ 'x-blocked': 'denied' }),
    () => new Response('{"error":true}', { headers: { 'content-type': 'application/json' } }),
    () => new Response('<ExceptionReport/>', { headers: { 'content-type': 'application/xml' } }),
  ]) {
    await withRelay({ fetchImpl: async () => response() }, async (base) => {
      const result = await fetch(base + tilePath);
      assert.equal(result.status, 502);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    });
  }
});

test('upstream timeout releases requests and becomes a retriable failure', async () => {
  await withRelay(
    {
      timeoutMs: 15,
      fetchImpl: (_url, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
        ),
    },
    async (base) => {
      assert.equal((await fetch(base + tilePath)).status, 504);
    },
  );
});

test('provider cache age is respected instead of renewing stale entries', async () => {
  let called = 0;
  await withRelay(
    {
      fetchImpl: async () => {
        called++;
        return image({ age: '7200' });
      },
    },
    async (base) => {
      await fetch(base + tilePath);
      await fetch(base + tilePath);
      assert.equal(called, 2);
    },
  );
});

test('network configuration exposes only availability and region', async () => {
  await withRelay(
    { tiandituToken: 'secret-server-token', networkRegion: 'china' },
    async (base) => {
      const result = await fetch(base + '/__earth/network');
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { chinaAvailable: true, region: 'china' });
      assert.equal((await fetch(base + '/__earth/network', { method: 'POST' })).status, 405);
      const wmts = upstreamURL('tianditu-vec', 18, 1, 2, undefined, 'secret-server-token');
      assert.match(wmts, /^https:\/\/t[0-3]\.tianditu\.gov\.cn\/vec_w\/wmts\?/);
      assert.equal(upstreamURL('tianditu-vec', 19, 1, 2, undefined, 'token'), null);
      assert.equal(upstreamURL('tianditu-vec', 1, 0, 0), null);
    },
  );
});

test('shared cache honors s-maxage, no-cache, private and Last-Modified validators', async () => {
  let called = 0;
  const modified = 'Mon, 01 Jan 2024 00:00:00 GMT';
  await withRelay(
    {
      fetchImpl: async () => {
        called++;
        return image({
          'cache-control': called === 1 ? 'max-age=0, s-maxage=3600' : 'private, max-age=3600',
          'last-modified': modified,
        });
      },
    },
    async (base) => {
      await fetch(base + tilePath);
      assert.equal((await fetch(base + tilePath)).status, 200);
      assert.equal(called, 1);
      assert.equal(
        (await fetch(base + tilePath, { headers: { 'if-modified-since': modified } })).status,
        304,
      );
    },
  );
  await withRelay(
    {
      fetchImpl: async () => {
        called++;
        return image({ 'cache-control': 'private, max-age=3600' });
      },
    },
    async (base) => {
      await fetch(base + tilePath);
      await fetch(base + tilePath);
      assert.equal(called, 3);
    },
  );
  await withRelay(
    {
      fetchImpl: async () => {
        called++;
        return image({ 'cache-control': 'no-cache, max-age=3600' });
      },
    },
    async (base) => {
      await fetch(base + tilePath);
      await fetch(base + tilePath);
      assert.equal(called, 5);
    },
  );
});

test('parallel callers share one download and provider cooldown survives a late success', async () => {
  let called = 0;
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  await withRelay(
    {
      fetchImpl: async (_url, { signal }) => {
        called++;
        if (called === 1) {
          await waiting;
          assert.equal(signal.aborted, false);
          return image({ 'cache-control': 'no-store' });
        }
        return image({ 'cache-control': 'no-store' });
      },
    },
    async (base) => {
      const first = fetch(base + tilePath);
      const second = fetch(base + tilePath);
      await new Promise((resolve) => setTimeout(resolve, 30));
      release();
      const results = await Promise.all([first, second]);
      assert.deepEqual(
        results.map((result) => result.status),
        [200, 200],
      );
      assert.equal(called, 1);
      assert.ok(results.some((result) => result.headers.get('x-earth-cache') === 'COALESCED'));
    },
  );
  let delayedSuccess;
  const waitingSuccess = new Promise((resolve) => {
    delayedSuccess = resolve;
  });
  let started = 0;
  await withRelay(
    {
      fetchImpl: async () => {
        started++;
        if (started === 1) {
          await waitingSuccess;
          return image({ 'cache-control': 'no-store' });
        }
        return new Response('quota', { status: 429, headers: { 'retry-after': '120' } });
      },
    },
    async (base) => {
      const first = fetch(base + tilePath);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const other = '/__tiles/osm-standard/19/439053/214226';
      assert.equal((await fetch(base + other)).status, 429);
      delayedSuccess();
      assert.equal((await first).status, 200);
      assert.equal((await fetch(base + tilePath)).status, 429);
      assert.equal(started, 2);
    },
  );
});

test('one cancelled caller leaves a shared download alive; the last caller aborts it', async () => {
  let called = 0;
  let firstSignal;
  let releaseFirst;
  const waiting = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  await withRelay(
    {
      fetchImpl: async (_url, { signal }) => {
        called++;
        firstSignal = signal;
        await waiting;
        return image({ 'cache-control': 'no-store' });
      },
    },
    async (base) => {
      const a = new AbortController();
      const first = fetch(base + tilePath, { signal: a.signal }).catch(() => undefined);
      const second = fetch(base + tilePath);
      await new Promise((resolve) => setTimeout(resolve, 40));
      a.abort();
      await first;
      assert.equal(firstSignal.aborted, false);
      releaseFirst();
      assert.equal((await second).status, 200);
      assert.equal(called, 1);
    },
  );
  let aborted = 0;
  let calls = 0;
  await withRelay(
    {
      fetchImpl: async (_url, { signal }) => {
        calls++;
        if (calls > 1) return image({ 'cache-control': 'no-store' });
        return new Promise((_, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted++;
              reject(new Error('cancelled'));
            },
            { once: true },
          );
        });
      },
    },
    async (base) => {
      const controller = new AbortController();
      const pending = fetch(base + tilePath, { signal: controller.signal }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 40));
      controller.abort();
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(aborted, 1);
      assert.equal((await fetch(base + tilePath)).status, 200);
      assert.equal(calls, 2);
    },
  );
});

test('Tianditu 429 date cooldown covers all layers and shards', async () => {
  let called = 0;
  await withRelay(
    {
      tiandituToken: 'fixture-secret',
      fetchImpl: async () => {
        called++;
        return new Response('limited', {
          status: 429,
          headers: { 'retry-after': new Date(Date.now() + 120_000).toUTCString() },
        });
      },
    },
    async (base) => {
      const first = await fetch(base + '/__tiles/tianditu-vec/3/2/1');
      assert.equal(first.status, 429);
      assert.ok(Number(first.headers.get('retry-after')) >= 100);
      const second = await fetch(base + '/__tiles/tianditu-img/3/3/1');
      assert.equal(second.status, 429);
      assert.equal(called, 1);
      assert.equal(first.headers.get('x-earth-error'), 'upstream-429');
      assert.equal((first.headers.get('server-timing') ?? '').includes('fixture-secret'), false);
    },
  );
});

test('bounded memory cache evicts old images without changing tile requests', async () => {
  let called = 0;
  await withRelay(
    {
      maxCacheBytes: 4,
      fetchImpl: async () => {
        called++;
        return image();
      },
    },
    async (base) => {
      const neighbor = '/__tiles/osm-standard/19/439053/214226';
      assert.equal((await fetch(base + tilePath)).status, 200);
      assert.equal((await fetch(base + neighbor)).status, 200);
      assert.equal((await fetch(base + neighbor)).headers.get('x-earth-cache'), 'HIT');
      assert.equal((await fetch(base + tilePath)).status, 200);
      assert.equal(called, 3);
    },
  );
});
