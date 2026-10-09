/** Shared online transport: HTTP cache, in-flight reuse and provider cooldowns. */
export function createTileTransport({
  upstreamURL,
  arcgisKey,
  tiandituToken,
  networkRegion = 'auto',
  userAgent = 'EarthObservatory/2.1 (interactive globe; local development)',
  fetchImpl = fetch,
  timeoutMs = 20_000,
  maxCacheBytes = 64 * 1024 * 1024,
  allowedOrigins = '',
} = {}) {
  // Explicit deployment allowlist. Never reflect arbitrary origins or allow credentials.
  const corsOrigins = new Set(
    String(allowedOrigins)
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => {
        try {
          const url = new URL(origin);
          return url.protocol === 'https:' && url.origin === origin;
        } catch {
          return false;
        }
      }),
  );
  const cache = new Map(),
    flights = new Map(),
    providers = new Map();
  let cacheBytes = 0;
  const token = tiandituToken?.trim();
  const region = ['china', 'global'].includes(networkRegion) ? networkRegion : 'auto';
  const forget = (key) => {
    const old = cache.get(key);
    if (old) cacheBytes -= old.body.length;
    cache.delete(key);
  };
  const policy = (headers) => /\b(no-store|private)\b/i.test(headers['cache-control'] ?? '');
  function freshUntil(headers, now) {
    if (/\b(no-cache|no-store)\b/i.test(headers['cache-control'] ?? '')) return now;
    const maxAge =
      /(?:^|,)\s*s-maxage=(\d+)/i.exec(headers['cache-control'] ?? '') ??
      /(?:^|,)\s*max-age=(\d+)/i.exec(headers['cache-control'] ?? '');
    const date = Date.parse(headers.date ?? '') || now;
    const life = maxAge
      ? Number(maxAge[1]) * 1000
      : Math.max(0, Date.parse(headers.expires ?? '') - date) || 0;
    return now + Math.max(0, life - Math.max(Number(headers.age ?? 0) * 1000, now - date));
  }
  function remember(key, item) {
    forget(key);
    if (policy(item.headers) || item.body.length > maxCacheBytes) return;
    cache.set(key, item);
    cacheBytes += item.body.length;
    while (cacheBytes > maxCacheBytes) forget(cache.keys().next().value);
  }
  function failure(status, code, retryMs = 0) {
    return {
      status,
      code,
      retryMs,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-earth-error': code,
      },
      body: Buffer.from(code),
    };
  }
  function send(req, res, result, cacheStatus = 'MISS') {
    if (res.destroyed || res.writableEnded) return;
    const headers = {
      ...result.headers,
      'x-content-type-options': 'nosniff',
      'x-earth-cache': cacheStatus,
    };
    if (result.storedAt)
      headers.age = String(
        Math.max(0, Number(headers.age ?? 0) + Math.floor((Date.now() - result.storedAt) / 1000)),
      );
    if (result.retryMs > 0) headers['retry-after'] = String(Math.ceil(result.retryMs / 1000));
    if (result.upstreamMs !== undefined)
      headers['server-timing'] = `upstream;dur=${result.upstreamMs.toFixed(1)}`;
    const unchanged =
      result.status === 200 &&
      (req.headers['if-none-match']
        ? req.headers['if-none-match'] === headers.etag
        : req.headers['if-modified-since'] &&
          headers['last-modified'] &&
          Date.parse(headers['last-modified']) <= Date.parse(req.headers['if-modified-since']));
    const status = unchanged ? 304 : result.status;
    if (status !== 304) headers['content-length'] = result.body.length;
    res.writeHead(status, headers);
    res.end(status === 304 || req.method === 'HEAD' ? undefined : result.body);
  }
  function rejectProvider(provider, status, code, retryMs = 0) {
    const health = providers.get(provider) ?? { failures: 0, until: 0 };
    health.failures++;
    if (
      retryMs ||
      [401, 403, 429].includes(status) ||
      code === 'provider-denied' ||
      health.failures >= 4
    ) {
      const delay = Math.max(retryMs, [401, 403].includes(status) ? 300_000 : 30_000);
      health.until = Date.now() + delay;
      health.status = status;
      health.code = code;
      retryMs = delay;
    }
    providers.set(provider, health);
    return failure(status, code, retryMs);
  }
  function recoverProvider(provider) {
    if ((providers.get(provider)?.until ?? 0) <= Date.now()) providers.delete(provider);
  }
  async function download(req, key, source, url, controller) {
    const started = performance.now();
    const provider = source.startsWith('tianditu-') ? 'tianditu' : source;
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      source === 'usgs-naip' ? Math.max(timeoutMs, 35_000) : timeoutMs,
    );
    const cached = cache.get(key);
    try {
      const headers = { 'user-agent': userAgent, accept: 'image/*' };
      if (req.headers.referer) {
        headers.referer = req.headers.referer;
        try {
          headers.origin = new URL(req.headers.referer).origin;
        } catch {
          /* optional Origin */
        }
      }
      if (cached?.headers.etag) headers['if-none-match'] = cached.headers.etag;
      else if (cached?.headers['last-modified'])
        headers['if-modified-since'] = cached.headers['last-modified'];
      else if (req.headers['if-none-match'])
        headers['if-none-match'] = req.headers['if-none-match'];
      else if (req.headers['if-modified-since'])
        headers['if-modified-since'] = req.headers['if-modified-since'];
      const upstream = await fetchImpl(url, {
        headers,
        signal: controller.signal,
        redirect: 'error',
      });
      const upstreamMs = performance.now() - started;
      if (upstream.headers.has('x-blocked')) {
        await upstream.body?.cancel();
        return rejectProvider(provider, 502, 'provider-denied', 60_000);
      }
      const responseHeaders = {};
      for (const name of [
        'content-type',
        'cache-control',
        'expires',
        'etag',
        'last-modified',
        'date',
        'age',
      ]) {
        if (upstream.headers.has(name)) responseHeaders[name] = upstream.headers.get(name);
      }
      if (upstream.status === 304) {
        recoverProvider(provider);
        if (!cached)
          return { status: 304, headers: responseHeaders, body: Buffer.alloc(0), upstreamMs };
        const storedAt = Date.now();
        const merged = {
          ...cached.headers,
          age: '0',
          date: new Date(storedAt).toUTCString(),
          ...responseHeaders,
        };
        const item = {
          ...cached,
          headers: merged,
          storedAt,
          freshUntil: freshUntil(merged, storedAt),
          upstreamMs,
          revalidated: true,
        };
        remember(key, item);
        return item;
      }
      if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/')) {
        const retryHeader = upstream.headers.get('retry-after');
        const retryMs = retryHeader
          ? /^\d+$/.test(retryHeader)
            ? Number(retryHeader) * 1000
            : Date.parse(retryHeader) - Date.now()
          : 0;
        await upstream.body?.cancel();
        const status = [401, 403, 404, 429].includes(upstream.status) ? upstream.status : 502;
        return rejectProvider(
          provider,
          status,
          upstream.ok ? 'invalid-image' : `upstream-${upstream.status}`,
          Number.isFinite(retryMs) ? Math.max(0, retryMs) : 0,
        );
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of upstream.body) {
        length += chunk.length;
        if (length > 8 * 1024 * 1024) throw new Error('Unexpected tile size');
        chunks.push(chunk);
      }
      const storedAt = Date.now();
      const item = {
        status: 200,
        body: Buffer.concat(chunks),
        headers: responseHeaders,
        storedAt,
        freshUntil: freshUntil(responseHeaders, storedAt),
        upstreamMs,
      };
      remember(key, item);
      recoverProvider(provider);
      return item;
    } catch {
      if (controller.signal.aborted && !timedOut) return failure(499, 'cancelled');
      return rejectProvider(
        provider,
        timedOut ? 504 : 502,
        timedOut ? 'upstream-timeout' : 'upstream-network',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return async function relay(req, res, next = () => send(req, res, failure(404, 'not-found'))) {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return send(req, res, failure(400, 'invalid-url'));
    }
    const apiRoute = pathname === '/__earth/network' || pathname.startsWith('/__tiles/');
    if (apiRoute) {
      res.setHeader('Vary', 'Origin');
      if (corsOrigins.has(req.headers.origin)) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Access-Control-Expose-Headers', 'X-Earth-Cache, X-Earth-Error, Retry-After');
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
          res.writeHead(204);
          res.end();
          return;
        }
      }
    }
    if (pathname === '/__earth/network') {
      if (!['GET', 'HEAD'].includes(req.method))
        return send(req, res, failure(405, 'method-not-allowed'));
      return send(req, res, {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: Buffer.from(JSON.stringify({ chinaAvailable: Boolean(token), region })),
      });
    }
    if (!pathname.startsWith('/__tiles/')) return next();
    if (!['GET', 'HEAD'].includes(req.method))
      return send(req, res, failure(405, 'method-not-allowed'));
    const match = /^\/__tiles\/([a-z0-9-]+)\/(\d+)\/(\d+)\/(\d+)$/.exec(pathname);
    const url =
      match &&
      upstreamURL(match[1], Number(match[2]), Number(match[3]), Number(match[4]), arcgisKey, token);
    if (!url) return send(req, res, failure(400, 'invalid-source-or-tile'));
    const source = match[1],
      key = pathname;
    const cached = cache.get(key);
    if (cached && cached.freshUntil > Date.now()) {
      cache.delete(key);
      cache.set(key, cached);
      return send(req, res, cached, 'HIT');
    }
    const provider = source.startsWith('tianditu-') ? 'tianditu' : source;
    const health = providers.get(provider);
    if (health?.until > Date.now())
      return send(req, res, failure(health.status, health.code, health.until - Date.now()));
    // Distinct validators must not share a body-less 304 after a server restart.
    const flightKey = `${key}|${req.headers['if-none-match'] ?? ''}|${req.headers['if-modified-since'] ?? ''}`;
    let flight = flights.get(flightKey);
    const reused = !!flight && !flight.controller.signal.aborted;
    if (!reused) {
      const controller = new AbortController();
      flight = { controller, users: 0, promise: undefined };
      const current = flight;
      flights.set(flightKey, current);
      current.promise = download(req, key, source, url, controller).finally(() => {
        if (flights.get(flightKey) === current) flights.delete(flightKey);
      });
    }
    flight.users++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      flight.users--;
      if (flight.users === 0 && !res.writableEnded) flight.controller.abort();
    };
    res.on('close', release);
    try {
      const item = await flight.promise;
      send(req, res, item, reused ? 'COALESCED' : item.revalidated ? 'REVALIDATED' : 'MISS');
    } finally {
      res.off('close', release);
      release();
    }
  };
}
