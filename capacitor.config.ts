import type { CapacitorConfig } from '@capacitor/cli';

// Temporary internal-test identity. Confirm it before the first signed release;
// changing appId later creates a different Android application.
const config: CapacitorConfig = {
  appId: 'com.example.earthobservatory',
  appName: 'Earth Observatory',
  webDir: 'dist',
  backgroundColor: '#080d14',
  plugins: {
    SystemBars: { style: 'DARK', insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
