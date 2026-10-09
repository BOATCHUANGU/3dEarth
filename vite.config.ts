import { defineConfig, loadEnv } from 'vite';
import { tileRelayPlugin } from './server/tile-relay.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      tileRelayPlugin({
        arcgisKey: env.VITE_ARCGIS_API_KEY,
        tiandituToken: env.TIANDITU_TOKEN,
        networkRegion: env.EARTH_NETWORK_REGION || env.VITE_NETWORK_REGION,
        userAgent: env.TILE_USER_AGENT || undefined,
        allowedOrigins: env.EARTH_ALLOWED_ORIGINS,
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/three/examples/')) return 'earth-effects';
            if (id.includes('/node_modules/three/')) return 'three';
            if (id.includes('/node_modules/lucide/')) return 'icons';
          },
        },
      },
    },
  };
});
