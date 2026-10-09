import { Capacitor, registerPlugin } from '@capacitor/core';

const native = Capacitor.getPlatform() === 'android';
const bridge = registerPlugin<{
  preferences(): Promise<{ reducedMotion: boolean }>;
  shellReady(): Promise<void>;
}>('EarthWindow');
let nativeReducedMotion = false;
let resolveLaunch: () => void;
export const nativeLaunchFinished = native
  ? new Promise<void>((resolve) => {
      resolveLaunch = resolve;
    })
  : Promise.resolve();

export function prefersReducedMotion() {
  return (
    nativeReducedMotion ||
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

export async function prepareNativeWindow() {
  if (!native) return () => {};
  document.documentElement.classList.add('native-android');
  try {
    nativeReducedMotion = (await bridge.preferences()).reducedMotion;
  } catch {
    /* Browser preview has no native plugin. */
  }
  const onMotion = (event: Event) => {
    nativeReducedMotion = !!(event as CustomEvent<boolean>).detail;
    window.dispatchEvent(new Event('earth-motion-change'));
  };
  window.addEventListener('earth-native-motion', onMotion);
  return () => window.removeEventListener('earth-native-motion', onMotion);
}

/** DOM/layout frames first; Android then waits for WebView's committed visual state. */
export function releaseNativeLaunch() {
  if (!native) return;
  const timeout = setTimeout(() => resolveLaunch?.(), 4500);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      void bridge
        .shellReady()
        .catch(() => {})
        .finally(() => {
          clearTimeout(timeout);
          resolveLaunch?.();
        });
    }),
  );
}
