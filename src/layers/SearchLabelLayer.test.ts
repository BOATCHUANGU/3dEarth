import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { SearchLabelLayer } from './SearchLabelLayer';
import { geodeticToWorld, surfaceNormal, WGS84 } from '../geo/CoordinateSystem';
const mocks = vi.hoisted(() => ({ callbacks: [] as (() => void)[], ready: true, emWidth: 2 }));
vi.mock('./SearchFonts', () => ({
  SEARCH_LATIN_FONT: '/fonts/EarthCinzel-Medium.woff',
  localSearchText: (text: string) => text,
  prepareSearchFonts: () => Promise.resolve(mocks.ready),
}));
vi.mock('troika-three-text', () => ({
  Text: class extends Mesh {
    text = '';
    fontSize = 1;
    fillOpacity = 0;
    private info = {
      blockBounds: [-1, -0.5, 1, 0.5],
      glyphBounds: new Float32Array(),
      glyphColors: new Uint8Array(),
      glyphAtlasIndices: new Uint16Array(),
    };
    get textRenderInfo() {
      return this.info;
    }
    constructor() {
      super(undefined, new MeshBasicMaterial());
      Object.assign(this.geometry, { updateGlyphs() {} });
    }
    sync(callback: () => void) {
      this.info.blockBounds = [
        (-this.fontSize * mocks.emWidth) / 2,
        -this.fontSize / 2,
        (this.fontSize * mocks.emWidth) / 2,
        this.fontSize / 2,
      ];
      this.info.glyphBounds = new Float32Array(this.text.length * 4);
      this.info.glyphColors = new Uint8Array(this.text.length * 3);
      this.info.glyphAtlasIndices = new Uint16Array(this.text.length);
      for (let i = 0; i < this.text.length; i++) {
        const x = this.info.blockBounds[0] + (i * this.fontSize * mocks.emWidth) / this.text.length;
        this.info.glyphBounds.set([x, 0, x + this.fontSize / 2, this.fontSize / 2], i * 4);
        this.info.glyphColors.set([0, 0, i + 1], i * 3);
      }
      mocks.callbacks.push(callback);
    }
    dispose() {
      this.geometry.dispose();
    }
  },
}));
let layer: SearchLabelLayer;
let camera: PerspectiveCamera;
let scene: Scene;
const ready = async () => {
  await Promise.resolve();
  mocks.callbacks.splice(0).forEach((fn) => fn());
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  mocks.ready = true;
  mocks.emWidth = 2;
  mocks.callbacks = [];
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('document', { hidden: false });
  scene = new Scene();
  layer = new SearchLabelLayer(scene);
  camera = new PerspectiveCamera(43, 1000 / 800, 0.000001, 64);
  camera.position.copy(geodeticToWorld(0, 0, 250000));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
});
afterEach(() => {
  layer.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('holds until actual arrival then expires after 3000+500ms', async () => {
  layer.show('上海', 0, 0, true);
  await ready();
  vi.setSystemTime(30000);
  layer.update(camera, 1000, 800, Date.now(), 0.5);
  expect(layer.getState().opacity).toBe(0);
  layer.update(camera, 1000, 800, Date.now(), 5 / 6);
  expect(layer.getState().opacity).toBeCloseTo(0.5);
  layer.arrive();
  vi.setSystemTime(32999);
  layer.update(camera, 1000, 800);
  expect(layer.getState().opacity).toBe(1);
  vi.setSystemTime(33250);
  layer.update(camera, 1000, 800);
  expect(layer.getState().opacity).toBeCloseTo(0.5);
  vi.setSystemTime(33500);
  layer.update(camera, 1000, 800);
  expect(scene.children).toHaveLength(0);
});
it('rejects stale asynchronous shaping after replacement and disposal', async () => {
  layer.show('old', 0, 0, true);
  await Promise.resolve();
  const old = mocks.callbacks.shift()!;
  layer.show('new', 0, 0, true);
  await ready();
  old();
  expect(scene.children).toHaveLength(1);
  expect(layer.getState().name).toBe('new');
  layer.show('last', 0, 0, true);
  await Promise.resolve();
  layer.dispose();
  mocks.callbacks.splice(0).forEach((fn) => fn());
  expect(scene.children).toHaveLength(0);
});
it('keeps the geographic frame and world scale fixed while zooming to street altitude', async () => {
  layer.show('上海 Shanghai', 0, 0, false);
  await ready();
  layer.update(camera, 1000, 800);
  const first = layer.getState();
  const mesh = scene.children[0];
  expect(
    new Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).distanceTo(surfaceNormal(0, 0)),
  ).toBeLessThan(1e-12);
  for (const altitude of [500000, 100000, 150]) {
    camera.position.copy(geodeticToWorld(0, 0, altitude));
    camera.updateMatrixWorld();
    layer.update(camera, 1000, 800);
    expect(layer.getState().position).toEqual(first.position);
    expect(layer.getState().quaternion).toEqual(first.quaternion);
    expect(layer.getState().scale).toBe(first.scale);
  }
  expect(layer.getState().projectedSize).toBeGreaterThan(34);
  expect(layer.getState().zoomOpacity).toBe(0);
  expect(layer.getState().visible).toBe(false);
});
it.each([false, true])(
  'fades spatially across 1.5x–3x zoom, reduced motion=%s',
  async (reduced) => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
    layer.show('Shanghai', 0, 0, false);
    await ready();
    const opacities: number[] = [];
    for (const ratio of [1, 1.5, 1.9, 2.25, 2.6, 3, 3.2]) {
      camera.position.copy(geodeticToWorld(0, 0, 2 + 250000 / ratio));
      camera.updateMatrixWorld();
      layer.update(camera, 1000, 800);
      opacities.push(layer.getState().zoomOpacity);
    }
    expect(opacities[0]).toBe(1);
    expect(opacities[3]).toBeCloseTo(0.5);
    expect(opacities.at(-1)).toBe(0);
    expect(opacities.every((v, i) => i === 0 || v <= opacities[i - 1])).toBe(true);
    camera.position.copy(geodeticToWorld(0, 0, 250000));
    camera.updateMatrixWorld();
    layer.update(camera, 1000, 800);
    expect(layer.getState().opacity).toBe(1);
  },
);
it('fits a long name once and preserves the fit and deadline through resize and zoom', async () => {
  mocks.emWidth = 40;
  layer.show('Long mixed city name', 0, 0, false, 250000, 800, 43, 393);
  await ready();
  layer.update(camera, 393, 800);
  const before = layer.getState();
  expect(before.scale).toBeCloseTo(before.maxArrivalWidth / (40 * before.nominalArrivalSize));
  camera.position.copy(geodeticToWorld(0, 0, 150000));
  camera.updateMatrixWorld();
  layer.update(camera, 800, 600);
  expect(layer.getState().scale).toBe(before.scale);
  expect(layer.getState().expiresAt).toBe(before.expiresAt);
});
it('fades at controls and viewport edges without resizing or moving the geographic mesh', async () => {
  layer.show('上海', 0, 0, false);
  await ready();
  layer.update(camera, 1000, 800);
  const arrival = layer.getState();
  expect(arrival.safetyOpacity).toBe(1);
  layer.setScreenExclusion({ left: 400, top: 300, right: 600, bottom: 500 });
  layer.update(camera, 1000, 800);
  expect(layer.getState().safetyOpacity).toBe(0);
  expect(layer.getState().visible).toBe(false);
  layer.setScreenExclusion(undefined);
  layer.update(camera, 1000, 800);
  expect(layer.getState().opacity).toBe(1);
  camera.aspect = 100 / 800;
  camera.updateProjectionMatrix();
  layer.update(camera, 100, 800);
  expect(layer.getState().safetyOpacity).toBe(0);
  expect(layer.getState().scale).toBe(arrival.scale);
  expect(layer.getState().position).toEqual(arrival.position);
  expect(layer.getState().quaternion).toEqual(arrival.quaternion);
  expect(layer.getState().expiresAt).toBe(arrival.expiresAt);
});
it('calibrates spatial fade to the fitted arrival em without resetting the long-name lifetime', async () => {
  mocks.emWidth = 30;
  layer.show('Long city name', 0, 0, false, 250000, 800, 43, 393);
  await ready();
  layer.update(camera, 393, 800);
  const arrival = layer.getState();
  expect(arrival.fittedArrivalSize).toBeLessThan(arrival.nominalArrivalSize);
  expect(arrival.fittedProjectedSize).toBeCloseTo(arrival.fittedArrivalSize, 3);
  expect(arrival.opacity).toBe(1);
  camera.position.copy(geodeticToWorld(0, 0, 2 + 250000 / 2.25));
  camera.updateMatrixWorld();
  layer.update(camera, 393, 800);
  expect(layer.getState().zoomOpacity).toBeCloseTo(0.5);
  expect(layer.getState().fittedProjectedSize).toBeCloseTo(arrival.fittedArrivalSize * 2.25);
  expect(layer.getState().expiresAt).toBe(arrival.expiresAt);
});
it.each([-85, 0, 31.23, 80])(
  'projects glyph extents onto WGS84 at latitude %s',
  async (latitude) => {
    layer.show('上海 Shanghai', latitude, 121.47, true);
    await ready();
    const mesh = scene.children[0];
    const shader = {
      uniforms: {},
      vertexShader: '#include <project_vertex>',
      fragmentShader: '',
    } as Parameters<MeshBasicMaterial['onBeforeCompile']>[0];
    ((mesh as Mesh).material as MeshBasicMaterial).onBeforeCompile(shader, null as never);
    const metric = shader.uniforms.surfaceMetric.value as Vector3;
    const slope = shader.uniforms.surfaceSlope.value as Vector3;
    const a = shader.uniforms.surfaceA.value as number;
    for (const [x, y] of [
      [0, 0],
      [0.025, 0.003],
      [-0.025, -0.003],
    ]) {
      const c = metric.x * x * x + 2 * metric.y * x * y + metric.z * y * y;
      const b = slope.x + slope.y * x + slope.z * y;
      const sag = -c / (b + Math.sqrt(b * b - a * c));
      const world = new Vector3(x, y, sag)
        .applyQuaternion(mesh.quaternion)
        .add(geodeticToWorld(latitude, 121.47));
      const ellipsoid = world.x ** 2 + ((world.y * WGS84.a) / WGS84.b) ** 2 + world.z ** 2;
      expect(ellipsoid).toBeCloseTo(1, 12);
      if (x !== 0) expect(sag).toBeLessThan(0);
    }
  },
);
it('switches the label palette without changing shape, scale or lifetime', async () => {
  layer.show('上海', 0, 0, false);
  await ready();
  const before = layer.getState();
  layer.setLightBackground(true);
  expect(layer.getState().color).toBe(0x644a2b);
  layer.setLightBackground(false);
  expect(layer.getState().color).toBe(0xf2deae);
  expect(layer.getState().position).toEqual(before.position);
  expect(layer.getState().scale).toBe(before.scale);
  expect(layer.getState().expiresAt).toBe(before.expiresAt);
});
it('uses dark ink on bright imagery and hysteresis near the palette boundary', async () => {
  layer.show('Atlas', 0, 0, false);
  await ready();
  layer.setLightBackground(false, 0.5);
  expect(layer.getState().color).toBe(0x644a2b);
  layer.setLightBackground(false, 0.24);
  expect(layer.getState().color).toBe(0x644a2b);
  layer.setLightBackground(false, 0.1);
  expect(layer.getState().color).toBe(0xf2deae);
  layer.setLightBackground(false, 0.24);
  expect(layer.getState().color).toBe(0xf2deae);
});
it('hides far, back-facing and offscreen names', async () => {
  layer.show('背面', 0, 180, true);
  await ready();
  layer.update(camera, 1000, 800);
  expect(layer.getState().visible).toBe(false);
  layer.show('front', 0, 0, true);
  await ready();
  camera.position.copy(geodeticToWorld(0, 0, 28000000));
  camera.updateMatrixWorld();
  layer.update(camera, 1000, 800);
  expect(layer.getState().visible).toBe(false);
  camera.lookAt(20, 20, 20);
  camera.updateMatrixWorld();
  layer.update(camera, 1000, 800);
  expect(layer.getState().visible).toBe(false);
});
it('does not revive a label expired while hidden', async () => {
  layer.show('上海', 0, 0, false);
  await ready();
  layer.hide();
  vi.setSystemTime(13100);
  layer.resume();
  layer.update(camera, 1000, 800);
  expect(layer.getState().present).toBe(false);
});
it('reduced motion waits for arrival and removes without fade', async () => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
  layer.show('上海', 0, 0, true);
  await ready();
  layer.update(camera, 1000, 800, Date.now(), 0.8);
  expect(layer.getState().opacity).toBe(0);
  layer.arrive();
  layer.update(camera, 1000, 800);
  expect(layer.getState().opacity).toBe(1);
  vi.setSystemTime(13000);
  layer.update(camera, 1000, 800);
  expect(layer.getState().present).toBe(false);
});
it('fails closed on local font failure and still clears at the deadline', async () => {
  layer.dispose();
  mocks.ready = false;
  layer = new SearchLabelLayer(scene);
  layer.show('上海', 0, 0, false);
  await ready();
  expect(layer.getState().status).toBe('font-unavailable');
  expect(scene.children).toHaveLength(0);
  vi.setSystemTime(14000);
  layer.update(camera, 1000, 800);
  expect(layer.getState().present).toBe(false);
});
it('cancellation invalidates shaping that has not started', async () => {
  layer.show('上海', 0, 0, true);
  layer.clear();
  await ready();
  layer.arrive();
  expect(scene.children).toHaveLength(0);
  expect(layer.getState().present).toBe(false);
});
