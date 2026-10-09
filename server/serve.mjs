import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTileRelay } from './tile-relay.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// loadEnvFile preserves existing values: highest priority first, as in Vite.
for (const name of ['.env.production.local', '.env.production', '.env.local', '.env']) {
  const file = path.join(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}
const dist = path.join(root, 'dist');
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('Run npm run build first');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const relay = createTileRelay({
  arcgisKey: process.env.VITE_ARCGIS_API_KEY,
  tiandituToken: process.env.TIANDITU_TOKEN,
  networkRegion: process.env.EARTH_NETWORK_REGION || process.env.VITE_NETWORK_REGION,
  userAgent: process.env.TILE_USER_AGENT,
  allowedOrigins: process.env.EARTH_ALLOWED_ORIGINS,
});
const server = http.createServer(
  (req, res) =>
    void relay(req, res, async () => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405);
          res.end();
          return;
        }
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const filename = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!filename.startsWith(dist + path.sep)) {
          res.writeHead(403);
          res.end();
          return;
        }
        const info = await stat(filename);
        if (!info.isFile()) throw new Error('Not a file');
        const etag = `W/"${info.size}-${info.mtimeMs}"`;
        const headers = {
          'content-type': types[path.extname(filename)] ?? 'application/octet-stream',
          'cache-control': pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate',
          etag,
          'x-content-type-options': 'nosniff',
        };
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, headers);
          res.end();
          return;
        }
        res.writeHead(200, { ...headers, 'content-length': info.size });
        if (req.method === 'HEAD') res.end();
        else
          createReadStream(filename)
            .on('error', () => res.destroy())
            .pipe(res);
      } catch {
        if (!res.headersSent) res.writeHead(404);
        res.end('Not found');
      }
    }),
);
server.listen(Number(process.env.PORT ?? 4173), process.env.HOST ?? '127.0.0.1', () =>
  console.log(
    `Earth Observatory: http://${process.env.HOST ?? '127.0.0.1'}:${server.address().port}`,
  ),
);
