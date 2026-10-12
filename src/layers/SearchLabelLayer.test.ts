import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { SearchLabelLayer } from './SearchLabelLayer';
import { geodeticToWorld } from '../geo/CoordinateSystem';

let elements: any[];
let layer: SearchLabelLayer;
let camera: PerspectiveCamera;
beforeEach(() => {
  elements = [];
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  vi.stubGlobal('window', {
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: () => ({ matches: false }),
  });
  vi.stubGlobal('document', {
    hidden: false,
    createElement: () => {
      const el = {
        hidden: false,
        textContent: '',
        style: {},
        offsetWidth: 100,
        offsetHeight: 20,
        remove: () => {
          elements = elements.filter((e) => e !== el);
        },
      };
      return el;
    },
  });
  layer = new SearchLabelLayer({
    append: (e: any) => elements.push(e),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    closest: () => null,
  } as unknown as HTMLElement);
  camera = new PerspectiveCamera(43, 1000 / 800, 0.001, 64);
  camera.position.copy(geodeticToWorld(0, 0, 12_000_000));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
});
afterEach(() => {
  layer.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('waits for real arrival even on a long flight, then holds for three seconds and fades', () => {
  layer.show('目的地', 0, 0, true);
  vi.setSystemTime(20000);
  layer.update(camera, 1000, 800);
  expect(elements).toHaveLength(1);
  layer.arrive();
  vi.setSystemTime(22999);
  layer.update(camera, 1000, 800);
  expect(elements[0].style.opacity).toBe('1');
  vi.setSystemTime(23110);
  layer.update(camera, 1000, 800);
  expect(Number(elements[0].style.opacity)).toBeCloseTo(0.5);
  vi.setSystemTime(23221);
  layer.update(camera, 1000, 800);
  expect(elements).toHaveLength(0);
});

it('replaces the previous destination, safely writes text and clears all expiry state', () => {
  layer.show('旧地点', 0, 0, false);
  vi.setSystemTime(12500);
  layer.show('<img onerror=alert(1)>', 0, 0, true);
  expect(elements).toHaveLength(1);
  expect(elements[0].textContent).toBe('<img onerror=alert(1)>');
  vi.setSystemTime(20000);
  layer.update(camera, 1000, 800);
  expect(elements).toHaveLength(1);
  layer.clear();
  layer.arrive();
  layer.update(camera, 1000, 800);
  expect(elements).toHaveLength(0);
});

it('hides destinations behind Earth and outside the view', () => {
  layer.show('背面', 0, 180, true);
  layer.update(camera, 1000, 800);
  expect(elements[0].hidden).toBe(true);
  camera.lookAt(20, 20, 20);
  camera.updateMatrixWorld();
  layer.show('视口外', 0, 0, true);
  layer.update(camera, 1000, 800);
  expect(elements[0].hidden).toBe(true);
});

it('drops expired background labels before they can reappear', () => {
  layer.show('目的地', 0, 0, false);
  layer.update(camera, 1000, 800);
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  layer.hide();
  expect(elements[0].hidden).toBe(true);
  vi.setSystemTime(15000);
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  layer.update(camera, 1000, 800);
  expect(elements).toHaveLength(0);
});

it('uses a static label and immediate expiry for reduced motion; disposal removes it', () => {
  vi.stubGlobal('window', {
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: () => ({ matches: true }),
  });
  layer.show('目的地', 0, 0, false);
  layer.update(camera, 1000, 800);
  expect(elements[0].style.opacity).toBe('1');
  vi.setSystemTime(13000);
  layer.update(camera, 1000, 800);
  expect(elements).toHaveLength(0);
  layer.show('新地点', 0, 0, true);
  layer.dispose();
  expect(elements).toHaveLength(0);
});
