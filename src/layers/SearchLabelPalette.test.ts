import { afterEach, expect, it, vi } from 'vitest';
import { Mesh, PlaneGeometry, ShaderMaterial, Texture, Vector3 } from 'three';
import { ImageryTileLayer } from './ImageryTileLayer';
vi.mock('../network/NetworkProfile', () => ({
  networkProfile: { getState: () => ({}), subscribe: () => () => {} },
}));
afterEach(() => vi.unstubAllGlobals());

it('samples only visible cover at the label anchor, caches pixels, and accounts for flipped images', () => {
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  // North is at the bottom of the flipped ImageBitmap.
  for (let y = 4; y < 8; y++)
    for (let x = 0; x < 8; x++) pixels.fill(255, (y * 8 + x) * 4, (y * 8 + x + 1) * 4);
  const draw = vi.fn(),
    read = vi.fn(() => ({ data: pixels }));
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => ({ drawImage: draw, getImageData: read }) }),
  });
  const layer = new ImageryTileLayer(new Vector3(1, 0, 0), new Texture(), 1);
  const mesh = new Mesh(
    new PlaneGeometry(),
    new ShaderMaterial({ uniforms: { fade: { value: 1 } } }),
  );
  const image = { close: vi.fn() } as unknown as ImageBitmap;
  const entry = {
    key: 'test',
    tile: { z: 0, x: 0, y: 0 },
    source: { kind: 'imagery' },
    mesh,
    image,
  };
  Object.assign(layer, { entries: new Map([['test', entry]]), opacity: { value: 1 } });
  expect(layer.searchLabelLuminance(80, 0)).toBeCloseTo(1);
  expect(layer.searchLabelLuminance(-80, 0)).toBe(0);
  expect(draw).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
  mesh.visible = false;
  expect(layer.searchLabelLuminance(80, 0)).toBeUndefined();
  layer.dispose();
  expect(image.close).toHaveBeenCalledTimes(1);
});
it('returns no hint when canvas readback is unavailable', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
  const layer = new ImageryTileLayer(new Vector3(1, 0, 0), new Texture(), 1);
  const mesh = new Mesh(
    new PlaneGeometry(),
    new ShaderMaterial({ uniforms: { fade: { value: 1 } } }),
  );
  const entry = {
    key: 'test',
    tile: { z: 0, x: 0, y: 0 },
    source: { kind: 'imagery' },
    mesh,
    image: { close() {} },
  };
  Object.assign(layer, { entries: new Map([['test', entry]]), opacity: { value: 1 } });
  expect(layer.searchLabelLuminance(0, 0)).toBeUndefined();
  layer.dispose();
});
