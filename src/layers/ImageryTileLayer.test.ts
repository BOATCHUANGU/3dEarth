import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, ShaderMaterial, Texture, Vector3 } from 'three';
import { geodeticToWorld, WGS84 } from '../geo/CoordinateSystem';
import { ImageryTileLayer } from './ImageryTileLayer';
import { iterateMercatorTiles, selectMercatorTiles } from './MercatorTiles';

const selection = vi.hoisted(() => ({
  bounds: { west: 0.0001, east: 0.0002, south: 0.0001, north: 0.0002 } as {
    west: number;
    east: number;
    south: number;
    north: number;
  } | null,
  source: 'first',
  maxZoom: 3,
}));

vi.mock('./ViewFootprint', () => ({ viewBounds: () => selection.bounds }));
vi.mock('./TileSources', () => ({
  chooseTileSource: () => ({
    id: selection.source,
    name: selection.source,
    minZoom: 3,
    maxZoom: selection.maxZoom,
    tileSize: 256,
    kind: 'map',
    attribution: selection.source,
    attributionUrl: 'https://example.test/copyright',
    url: ({ z, x, y }: { z: number; x: number; y: number }) =>
      `https://example.test/${selection.source}/${z}/${x}/${y}`,
  }),
}));

const layers: ImageryTileLayer[] = [];
const bitmaps: Array<{ close: ReturnType<typeof vi.fn> }> = [];

function cameraAt(altitude = 10_000) {
  const camera = new PerspectiveCamera(43, 1.6, (altitude / WGS84.a) * 0.08, 64);
  camera.position.copy(geodeticToWorld(0, 0, altitude));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

function makeLayer() {
  const layer = new ImageryTileLayer(new Vector3(1, 0, 0), new Texture(), 16);
  layers.push(layer);
  return layer;
}

function imageResponse(headers: Record<string, string> = {}) {
  return new Response(new Uint8Array([1]), {
    headers: { 'content-type': 'image/png', ...headers },
  });
}

async function settle(layer: ImageryTileLayer) {
  await vi.waitFor(() => {
    expect(layer.getState().pending).toBe(0);
    expect(layer.getState().loaded).toBe(layer.getState().total);
    expect(layer.getState().total).toBeGreaterThan(0);
  });
}

beforeEach(() => {
  selection.bounds = { west: 0.0001, east: 0.0002, south: 0.0001, north: 0.0002 };
  selection.source = 'first';
  selection.maxZoom = 3;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => imageResponse()),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      const bitmap = { width: 256, height: 256, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }),
  );
});

afterEach(() => {
  layers.splice(0).forEach((layer) => layer.dispose());
  bitmaps.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('visible tile cover lifecycle', () => {
  it.each([
    { width: 2560, height: 1440, altitude: 1_500_000, zoom: 10 },
    { width: 3840, height: 2160, altitude: 150_000, zoom: 14 },
  ])(
    'retains full-detail coverage beyond the old allocation cap at $width × $height / DPR 3',
    async ({ width, height, altitude, zoom }) => {
      const { viewBounds } =
        await vi.importActual<typeof import('./ViewFootprint')>('./ViewFootprint');
      const camera = cameraAt(altitude);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      selection.bounds = viewBounds(camera);
      selection.maxZoom = 19;
      expect(selection.bounds).not.toBeNull();
      expect(() => selectMercatorTiles(selection.bounds!, zoom)).toThrow(/4096/);
      vi.mocked(fetch).mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
              once: true,
            });
          }),
      );
      const layer = makeLayer();
      expect(() => layer.update(camera, height * 3, 0.2)).not.toThrow();
      const state = layer.getState();
      expect(state).toMatchObject({ active: true, zoom, pending: 8 });
      expect(state.total).toBeGreaterThan(0);
      // Every selected same-zoom leaf survives, including the last candidate: no
      // truncation masquerading as a successful high-resolution view.
      const internals = layer as unknown as {
        isVisible(tile: { z: number; x: number; y: number }, camera: PerspectiveCamera): boolean;
      };
      const visible = [...iterateMercatorTiles(selection.bounds!, zoom)].filter((tile) =>
        internals.isVisible(tile, camera),
      );
      expect(state.total).toBe(visible.length);
      if (width === 3840) expect(state.total).toBeGreaterThan(4096);
    },
  );

  it.each([null, { west: -180, east: 180, south: 86, north: 85.0511287798066 }])(
    'reports the global base layer for an uncovered polar footprint %j',
    async (bounds) => {
      const layer = makeLayer();
      const camera = cameraAt();
      layer.update(camera, 1000, 0.2);
      await settle(layer);
      layer.update(camera, 1000, 0.3);
      expect(layer.getState().active).toBe(true);
      selection.bounds = bounds;
      layer.update(camera, 1000, 0.2);
      expect(layer.getState()).toMatchObject({ active: false, total: 0, loaded: 0 });
      expect(layer.group.visible).toBe(false);
      expect(layer.group.children.every((mesh) => !mesh.visible)).toBe(true);
    },
  );

  it('keeps the old source cover until new imagery has finished fading in', async () => {
    const layer = makeLayer();
    const camera = cameraAt();
    layer.update(camera, 1000, 0.2);
    await settle(layer);
    layer.update(camera, 1000, 0.3);
    const previous = layer.group.children.filter((mesh) => mesh.visible);
    expect(previous).toHaveLength(1);

    selection.source = 'second';
    layer.setMode('satellite');
    layer.update(camera, 1000, 0.01);
    await settle(layer);
    layer.update(camera, 1000, 0.01);
    expect(previous.every((mesh) => mesh.visible)).toBe(true);
    expect(
      layer
        .getState()
        .credits.map((credit) => credit.id)
        .sort(),
    ).toEqual(['first', 'second']);
    const newMesh = layer.group.children.find((mesh) => !previous.includes(mesh)) as Mesh;
    expect((newMesh.material as ShaderMaterial).uniforms.fade.value).toBeLessThan(1);

    layer.update(camera, 1000, 0.3);
    expect(previous.every((mesh) => !mesh.visible)).toBe(true);
    expect(newMesh.visible).toBe(true);
    expect((newMesh.material as ShaderMaterial).uniforms.fade.value).toBe(1);
    expect(layer.getState().credits.map((credit) => credit.id)).toEqual(['second']);
  });

  it('keeps an existing sharp cover during an uncached zoom-out transition', async () => {
    selection.maxZoom = 19;
    const layer = makeLayer();
    layer.update(cameraAt(), 1000, 0.2);
    await settle(layer);
    layer.update(cameraAt(), 1000, 0.3);
    const oldZoom = layer.getState().zoom;
    const previous = layer.group.children.filter((mesh) => mesh.visible);

    layer.update(cameraAt(200_000), 1000, 0.2);
    expect(layer.getState().zoom).toBeLessThan(oldZoom - 3);
    await settle(layer);
    layer.update(cameraAt(200_000), 1000, 0.01);
    expect(previous.every((mesh) => mesh.visible)).toBe(true);
    layer.update(cameraAt(200_000), 1000, 0.3);
    expect(previous.every((mesh) => !mesh.visible)).toBe(true);
  });

  it('rejects a provider denial image returned with HTTP 200', async () => {
    vi.mocked(fetch).mockImplementation(async () => imageResponse({ 'x-blocked': 'policy' }));
    const layer = makeLayer();
    layer.update(cameraAt(), 1000, 0.2);
    await vi.waitFor(() => expect(layer.getState().pending).toBe(0));
    expect(layer.getState()).toMatchObject({ loaded: 0, total: 1, failed: 1 });
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(layer.group.children).toHaveLength(0);
  });

  it('limits simultaneous requests without reducing selected image resolution', () => {
    selection.maxZoom = 19;
    selection.bounds = { west: -0.03, east: 0.03, south: -0.03, north: 0.03 };
    vi.mocked(fetch).mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          });
        }),
    );
    const layer = makeLayer();
    const camera = cameraAt();
    layer.update(camera, 1000, 0.2);
    const initial = layer.getState();
    expect(initial.total).toBeGreaterThan(8);
    expect(initial.pending).toBe(8);
    expect(initial.zoom).toBe(15);
    for (let frame = 0; frame < 20; frame++) layer.update(camera, 1000, 0.2);
    expect(layer.getState()).toMatchObject({
      zoom: initial.zoom,
      total: initial.total,
      pending: 8,
    });
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it('closes a bitmap that finishes decoding after the view is cancelled', async () => {
    let finishDecode!: (bitmap: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDecode = resolve;
        }),
    );
    const layer = makeLayer();
    const camera = cameraAt();
    layer.update(camera, 1000, 0.2);
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());
    selection.bounds = null;
    layer.update(camera, 1000, 0.2);
    const close = vi.fn();
    finishDecode({ width: 256, height: 256, close } as unknown as ImageBitmap);
    await vi.waitFor(() => expect(layer.getState().pending).toBe(0));
    expect(close).toHaveBeenCalledOnce();
    expect(layer.getState()).toMatchObject({ active: false, cached: 0 });
    expect(layer.group.children).toHaveLength(0);
  });

  it('releases every decoded image and GPU resource exactly once on disposal', async () => {
    const layer = makeLayer();
    layer.update(cameraAt(), 1000, 0.2);
    await settle(layer);
    const mesh = layer.group.children[0] as Mesh;
    const material = mesh.material as ShaderMaterial;
    const texture = material.uniforms.tileMap.value as Texture;
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    layer.dispose();
    layer.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(bitmaps[0].close).toHaveBeenCalledOnce();
    expect(layer.group.children).toHaveLength(0);
  });
});
