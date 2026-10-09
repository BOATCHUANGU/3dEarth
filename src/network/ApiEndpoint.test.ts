import { describe, expect, it } from 'vitest';
import { buildApiUrl, resolveApiBase } from './ApiEndpoint';

describe('Earth API base URL', () => {
  it('keeps the web build on its own origin when no remote API is configured', () => {
    const base = resolveApiBase(undefined, false, '/earth/');
    expect(base).toBe('/earth/');
    expect(buildApiUrl('__earth/network', base)).toBe('/earth/__earth/network');
  });

  it('leaves online maps unconfigured on native without an HTTPS API', () => {
    expect(resolveApiBase(undefined, true, '/')).toBeNull();
    expect(resolveApiBase('  ', true, '/')).toBeNull();
    expect(() => buildApiUrl('__earth/network', null)).toThrow('Configure VITE_API_BASE_URL');
  });

  it('accepts an HTTPS API with an optional deployment path', () => {
    const base = resolveApiBase(' https://maps.example.com/earth/// ', true, '/');
    expect(base).toBe('https://maps.example.com/earth/');
    expect(buildApiUrl('__tiles/tianditu-img/7/41/88', base)).toBe(
      'https://maps.example.com/earth/__tiles/tianditu-img/7/41/88',
    );
  });

  it.each([
    'http://maps.example.com/earth/',
    'ftp://maps.example.com/',
    '//maps.example.com/earth/',
    'https://user@maps.example.com/',
    'https://user:password@maps.example.com/',
    'https://maps.example.com/?token=secret',
    'https://maps.example.com/#fragment',
    'not a URL',
  ])('rejects unsafe or non-HTTPS API base %s', (value) => {
    expect(resolveApiBase(value, true, '/')).toBeNull();
  });
});

describe('Earth API route allowlist', () => {
  const base = 'https://maps.example.com/earth/';

  it('accepts only the network profile and fixed tile path shape', () => {
    expect(buildApiUrl('__earth/network', base)).toBe(`${base}__earth/network`);
    expect(buildApiUrl('__tiles/sentinel-2/12/2210/1360', base)).toBe(
      `${base}__tiles/sentinel-2/12/2210/1360`,
    );
  });

  it.each([
    'https://other.example.com/__earth/network',
    '/__earth/network',
    '__earth/network?token=secret',
    '__tiles/../admin/1/2/3',
    '__tiles/sentinel-2/1/2/3?x=4',
    '__tiles/sentinel-2/1/2/3/4',
    '__tiles/Sentinel-2/1/2/3',
  ])('rejects a route outside the fixed shape: %s', (path) => {
    expect(() => buildApiUrl(path, base)).toThrow('Unknown Earth API route');
  });
});
