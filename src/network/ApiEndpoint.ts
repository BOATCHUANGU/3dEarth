import { Capacitor } from '@capacitor/core';

/** Build-time public API location, never a provider secret or arbitrary URL proxy. */
export function resolveApiBase(value: string | undefined, native: boolean, webBase: string) {
  const configured = value?.trim();
  if (!configured) return native ? null : webBase;
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return null;
    return `${url.href.replace(/\/+$/, '')}/`;
  } catch {
    return null;
  }
}

const apiBase = resolveApiBase(
  import.meta.env.VITE_API_BASE_URL,
  Capacitor.isNativePlatform(),
  import.meta.env.BASE_URL,
);
export const onlineMapsConfigured =
  import.meta.env.VITE_DIRECT_TILES === 'true' || apiBase !== null;

export function buildApiUrl(path: string, base: string | null): string {
  if (!/^__earth\/network$|^__tiles\/[a-z0-9-]+\/\d+\/\d+\/\d+$/.test(path))
    throw new Error('Unknown Earth API route');
  if (base === null) throw new Error('Configure VITE_API_BASE_URL with an HTTPS Earth API');
  return `${base}${path}`;
}

export function apiUrl(path: string): string {
  return buildApiUrl(path, apiBase);
}
