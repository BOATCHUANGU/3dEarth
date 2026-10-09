import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { CameraController } from './CameraController';
import { WGS84 } from '../geo/CoordinateSystem';

/** A minimal event surface; tests use the real Three.js OrbitControls. */
class CameraSurface extends EventTarget {
  readonly style = { touchAction: '', cursor: '' };
  readonly ownerDocument = new EventTarget();
  readonly clientHeight = 900;
  readonly clientWidth = 1200;
  getRootNode(): EventTarget {
    return this.ownerDocument;
  }
  setPointerCapture(): void {}
  releasePointerCapture(): void {}
}

const controllers: CameraController[] = [];

function setup() {
  const camera = new PerspectiveCamera(42, 4 / 3, 0.03, 50);
  const surface = new CameraSurface();
  const controller = new CameraController(camera, surface as unknown as HTMLElement);
  controller.setAutoRotate(false);
  controllers.push(controller);
  return { camera, surface, controller };
}

function advance(controller: CameraController, seconds = 2) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame += 1) controller.update(1 / 60);
}

function input(target: EventTarget, type: string, properties: Record<string, unknown>): void {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
}

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.unstubAllGlobals();
});

describe('city altitude camera', () => {
  it.each([0, 31.2304, 80, -89.99])('can focus at 150 m at latitude %s', (latitude) => {
    const { camera, controller } = setup();
    controller.focusOn(latitude, 121.4737, 150, 0);
    expect(controller.altitudeMeters).toBeCloseTo(150, 5);
    expect(controller.centerCoordinates.latitude).toBeCloseTo(latitude, 7);
    expect(controller.centerCoordinates.longitude).toBeCloseTo(121.4737, 7);
    expect(camera.near * WGS84.a).toBeLessThan(15);
    expect(camera.far).toBeGreaterThanOrEqual(64);
  });

  it('scales altitude instead of Earth-centre distance for repeated zooms', () => {
    const { controller } = setup();
    controller.focusOn(31.2304, 121.4737, 1_000, 0);
    controller.zoom(0.5);
    advance(controller, 0.5);
    expect(controller.altitudeMeters).toBeCloseTo(500, 5);
    controller.zoom(0.1);
    advance(controller, 0.5);
    expect(controller.altitudeMeters).toBeCloseTo(150, 5);
    controller.zoom(2);
    advance(controller, 0.5);
    expect(controller.altitudeMeters).toBeCloseTo(300, 5);
    expect(controller.centerCoordinates.longitude).toBeCloseTo(121.4737, 7);
  });

  it('flies logarithmically through city LODs and never enters Earth', () => {
    const { controller } = setup();
    controller.focusOn(0, 170, 12_000_000, 0);
    controller.focusOn(0, 170, 150, 2);
    advance(controller, 1);
    expect(controller.altitudeMeters).toBeCloseTo(Math.sqrt(12_000_000 * 150), 4);
    for (let frame = 0; frame < 61; frame += 1) {
      controller.update(1 / 60);
      expect(controller.altitudeMeters).toBeGreaterThan(149.9999);
    }
    expect(controller.isFlying).toBe(false);
    expect(controller.altitudeMeters).toBeCloseTo(150, 5);
  });

  it('crosses the antimeridian along the short arc and lands at WGS84 height', () => {
    const { controller } = setup();
    controller.focusOn(35, 179, 150, 0);
    controller.focusOn(35, -179, 150, 2);
    advance(controller, 1);
    expect(Math.abs(controller.centerCoordinates.longitude)).toBeGreaterThan(179);
    expect(controller.altitudeMeters).toBeGreaterThan(10_000);
    advance(controller, 1.1);
    expect(controller.centerCoordinates.latitude).toBeCloseTo(35, 7);
    expect(controller.centerCoordinates.longitude).toBeCloseTo(-179, 7);
    expect(controller.altitudeMeters).toBeCloseTo(150, 5);
  });

  it('wheel travel is proportional at city height and remains above the ground', () => {
    const { surface, controller } = setup();
    controller.focusOn(45, 10, 1_000, 0);
    input(surface, 'wheel', { deltaY: -120, deltaMode: 0 });
    advance(controller, 0.5);
    expect(controller.altitudeMeters).toBeCloseTo(1_000 * Math.exp(-0.3), 5);
    for (let tick = 0; tick < 20; tick += 1) {
      input(surface, 'wheel', { deltaY: -120, deltaMode: 0 });
    }
    advance(controller, 0.5);
    expect(controller.altitudeMeters).toBeCloseTo(150, 5);
  });

  it('pinch doubles detail by halving altitude without a surface collision', () => {
    const { surface, controller } = setup();
    controller.focusOn(45, 10, 1_000, 0);
    input(surface, 'pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
      pageX: 100,
      pageY: 100,
    });
    input(surface, 'pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 100,
      pageX: 200,
      pageY: 100,
    });
    input(surface, 'pointermove', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 300,
      clientY: 100,
      pageX: 300,
      pageY: 100,
    });
    expect(controller.altitudeMeters).toBeCloseTo(500, 5);
    input(surface, 'pointermove', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 10_100,
      clientY: 100,
      pageX: 10_100,
      pageY: 100,
    });
    expect(controller.altitudeMeters).toBeCloseTo(150, 5);
  });

  it('keeps a city drag to metres and reports changes below OrbitControls epsilon', () => {
    const { camera, surface, controller } = setup();
    controller.focusOn(45, 10, 150, 0);
    const start = camera.position.clone();
    const changed = vi.fn();
    controller.onChange = changed;
    input(surface, 'pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    input(surface.ownerDocument, 'pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 200,
      clientY: 200,
    });
    input(surface.ownerDocument, 'pointerup', { pointerId: 1, pointerType: 'mouse' });
    advance(controller, 2);
    const travelledMeters = camera.position.distanceTo(start) * WGS84.a;
    expect(travelledMeters).toBeGreaterThan(5);
    expect(travelledMeters).toBeLessThan(100);
    expect(controller.altitudeMeters).toBeCloseTo(150, 3);
    expect(changed).toHaveBeenCalled();
  });

  it('holds the city view steady while preserving the auto-rotate preference', () => {
    const { camera, controller } = setup();
    controller.focusOn(45, 10, 1_000, 0);
    controller.setAutoRotate(true);
    const start = camera.position.clone();
    advance(controller, 3);
    expect(controller.autoRotate).toBe(true);
    expect(camera.position.distanceTo(start) * WGS84.a).toBeLessThan(0.001);
  });

  it('respects reduced motion and clamps invalid requested altitude ranges', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const { controller } = setup();
    controller.focusOn(45, 10, -100);
    expect(controller.isFlying).toBe(false);
    expect(controller.altitudeMeters).toBeCloseTo(150, 5);
    controller.focusOn(-45, -10, 1e12);
    expect(controller.altitudeMeters).toBeCloseTo(WGS84.a * 4.5, 5);
  });
});
