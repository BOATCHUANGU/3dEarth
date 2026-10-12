import { prefersReducedMotion } from '../app/NativeWindow';
import { PerspectiveCamera, Quaternion, TOUCH, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geodeticToWorld, surfaceNormal, worldToGeodetic, WGS84 } from '../geo/CoordinateSystem';

interface CameraFlight {
  startDirection: Vector3;
  destination: Vector3;
  rotation: Quaternion;
  startAltitude: number;
  endAltitude: number;
  duration: number;
  elapsed: number;
  cruiseAltitude: number | null;
}

const MIN_ALTITUDE = 150;
const MAX_ALTITUDE = WGS84.a * 4.5;
const INITIAL_ALTITUDE = WGS84.a * 2;
const IDENTITY = new Quaternion();
const RAD_TO_DEG = 180 / Math.PI;

function clampAltitude(altitude: number): number {
  return Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, altitude));
}

function smootherStep(progress: number): number {
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

function interpolateAltitude(start: number, end: number, progress: number): number {
  return Math.exp(Math.log(start) * (1 - progress) + Math.log(end) * progress);
}

/** A north-up WGS84 camera with continuous space-to-street altitude controls. */
export class CameraController {
  /** Fired by orbiting, zooming, and each animation step that changes the view. */
  onChange?: () => void;
  onFlightState?: (state: 'started' | 'arrived' | 'cancelled') => void;

  private readonly controls: OrbitControls;
  private readonly initialPosition: Vector3;
  private readonly rotation = new Quaternion();
  private readonly direction = new Vector3();
  private readonly lastNotifiedPosition = new Vector3();
  private readonly touchPointers = new Map<number, Vector2>();
  private flight: CameraFlight | null = null;
  private rotating = true;
  private orbitAltitude = INITIAL_ALTITUDE;
  private pinchDistance = 0;
  private suspended = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly domElement: HTMLElement,
  ) {
    this.initialPosition = geodeticToWorld(22, 115, INITIAL_ALTITUDE);
    camera.up.set(0, 1, 0);
    camera.position.copy(this.initialPosition);
    camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(camera, domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    // OrbitControls dolly multiplies distance from Earth's centre. Near the
    // surface that would turn one wheel/pinch tick into kilometres of travel.
    // Both input paths below instead multiply height above the WGS84 ellipsoid.
    this.controls.enableZoom = false;
    this.controls.touches.TWO = TOUCH.DOLLY_ROTATE;
    this.controls.autoRotate = false;
    this.controls.maxDistance = 1 + MAX_ALTITUDE / WGS84.a;
    this.refreshView();
    this.controls.update(0);
    this.rotating = !prefersReducedMotion();
    this.refreshView();
    this.lastNotifiedPosition.copy(camera.position);
    this.controls.addEventListener('start', this.handleInteraction);
    this.controls.addEventListener('change', this.handleChange);
    domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    domElement.addEventListener('pointerdown', this.handlePointerDown, { capture: true });
    domElement.addEventListener('pointermove', this.handlePointerMove, { capture: true });
    domElement.addEventListener('pointerup', this.handlePointerUp, { capture: true });
    domElement.addEventListener('pointercancel', this.handlePointerUp, { capture: true });
  }

  /** User preference; the actual spin eases to a stop at city scale. */
  get autoRotate(): boolean {
    return this.rotating;
  }

  /** Temporarily freeze all camera input and motion without changing spin preference. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.controls.enabled = !suspended;
    this.touchPointers.clear();
    this.pinchDistance = 0;
  }

  /** Lets tile scheduling distinguish camera travel from a settled close view. */
  get isFlying(): boolean {
    return this.flight !== null;
  }

  /** WGS84 height of the camera, independently of world-unit orbit distance. */
  get altitudeMeters(): number {
    return this.centerCoordinates.altitude;
  }

  get centerCoordinates(): { latitude: number; longitude: number; altitude: number } {
    const { x, y, z } = this.camera.position;
    return worldToGeodetic(x, y, z);
  }

  update(deltaSeconds: number): void {
    if (this.suspended) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0;
    const flight = this.flight;

    if (!flight) {
      this.refreshView();
      this.controls.update(delta);
      this.refreshView();
      this.notifyChange();
      return;
    }

    flight.elapsed += delta;
    const progress = Math.min(1, flight.elapsed / flight.duration);
    const eased = smootherStep(progress);
    const travel =
      flight.cruiseAltitude === null ? eased : smootherStep(Math.min(1, progress / 0.7));
    this.rotation.slerpQuaternions(IDENTITY, flight.rotation, travel);
    this.direction.copy(flight.startDirection).applyQuaternion(this.rotation).normalize();
    // Logarithmic height gives each level of detail time to resolve, instead of
    // spending the entire flight in space and diving at its end.
    let altitude = interpolateAltitude(flight.startAltitude, flight.endAltitude, eased);
    if (flight.cruiseAltitude !== null) {
      // Finish geographic travel before the close approach. An additive arc
      // would collapse to street level in the last frames; each leg here uses
      // logarithmic height so the final city descent has its own visible time.
      altitude =
        progress < 0.35
          ? interpolateAltitude(
              flight.startAltitude,
              flight.cruiseAltitude,
              smootherStep(progress / 0.35),
            )
          : interpolateAltitude(
              flight.cruiseAltitude,
              flight.endAltitude,
              smootherStep((progress - 0.35) / 0.65),
            );
    }
    altitude = clampAltitude(altitude);
    this.orbitAltitude = altitude;
    this.camera.position.copy(
      geodeticToWorld(
        Math.asin(Math.max(-1, Math.min(1, this.direction.y))) * RAD_TO_DEG,
        Math.atan2(-this.direction.z, this.direction.x) * RAD_TO_DEG,
        altitude,
      ),
    );

    if (progress === 1) {
      this.camera.position.copy(flight.destination);
      this.orbitAltitude = flight.endAltitude;
    }
    this.refreshView();
    this.controls.update(0);
    this.refreshView();
    this.notifyChange();

    if (progress === 1) {
      this.flight = null;
      this.refreshView();
      this.onFlightState?.('arrived');
    }
  }

  /** Fly along a great circle to a WGS84 height between 150 m and 28,701 km. */
  focusOn(latitude: number, longitude: number, altitudeMeters = 12_000_000, duration = 1.8): void {
    if (this.suspended) return;
    if (![latitude, longitude, altitudeMeters, duration].every(Number.isFinite)) return;
    const destination = geodeticToWorld(
      Math.max(-90, Math.min(90, latitude)),
      longitude,
      clampAltitude(altitudeMeters),
    );
    this.startFlight(destination, Math.max(0, duration));
  }

  setAutoRotate(enabled: boolean): void {
    if (this.suspended) return;
    this.rotating = enabled;
    this.refreshView();
    this.onChange?.();
  }

  /** Multiply altitude, not centre distance: below 1 zooms in, above 1 zooms out. */
  zoom(factor: number): void {
    if (this.suspended) return;
    if (!Number.isFinite(factor) || factor <= 0) return;
    const position = this.flight?.destination ?? this.camera.position;
    const coordinate = worldToGeodetic(position.x, position.y, position.z);
    const destination = geodeticToWorld(
      coordinate.latitude,
      coordinate.longitude,
      clampAltitude(coordinate.altitude * factor),
    );
    this.startFlight(destination, 0.38, false);
  }

  reset(): void {
    if (this.suspended) return;
    this.startFlight(this.initialPosition.clone(), 1.8);
  }

  dispose(): void {
    this.cancelFlight();
    this.onFlightState = undefined;
    this.touchPointers.clear();
    this.controls.removeEventListener('start', this.handleInteraction);
    this.controls.removeEventListener('change', this.handleChange);
    this.controls.dispose();
    this.domElement.removeEventListener('wheel', this.handleWheel);
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown, { capture: true });
    this.domElement.removeEventListener('pointermove', this.handlePointerMove, { capture: true });
    this.domElement.removeEventListener('pointerup', this.handlePointerUp, { capture: true });
    this.domElement.removeEventListener('pointercancel', this.handlePointerUp, { capture: true });
    this.onChange = undefined;
  }

  private startFlight(destination: Vector3, duration: number, allowLift = true): void {
    this.cancelFlight();
    this.onFlightState?.('started');
    // Consume residual orbit momentum once so it cannot pull against the flight.
    this.controls.autoRotate = false;
    this.controls.enableDamping = false;
    this.controls.update(0);
    this.controls.enableDamping = true;
    this.refreshView();

    const start = this.centerCoordinates;
    const end = worldToGeodetic(destination.x, destination.y, destination.z);
    const endAltitude = clampAltitude(end.altitude);
    destination.copy(geodeticToWorld(end.latitude, end.longitude, endAltitude));

    if (duration === 0 || prefersReducedMotion()) {
      this.flight = null;
      this.orbitAltitude = endAltitude;
      this.camera.position.copy(destination);
      this.refreshView();
      this.controls.update(0);
      this.refreshView();
      this.notifyChange();
      this.onFlightState?.('arrived');
      return;
    }

    const startDirection = surfaceNormal(start.latitude, start.longitude);
    const endDirection = surfaceNormal(end.latitude, end.longitude);
    const angle = startDirection.angleTo(endDirection);
    this.flight = {
      startDirection,
      destination,
      rotation: new Quaternion().setFromUnitVectors(startDirection, endDirection),
      startAltitude: clampAltitude(start.altitude),
      endAltitude,
      duration,
      elapsed: 0,
      // Cross-continent travel pulls back before approaching its destination;
      // a wheel zoom stays on its latitude/longitude without an arc.
      cruiseAltitude:
        allowLift && angle > 0.005
          ? clampAltitude(
              Math.max(start.altitude, endAltitude, Math.min(12_000_000, angle * WGS84.a * 0.6)),
            )
          : null,
    };
    this.refreshView();
  }

  private refreshView(): void {
    const coordinate = this.centerCoordinates;
    const altitude = clampAltitude(this.orbitAltitude);
    // Keep height fixed while orbiting a non-spherical Earth. Otherwise a small
    // latitude change at 150 m can put the camera underneath the ellipsoid.
    if (Math.abs(coordinate.altitude - altitude) > 0.0001) {
      this.camera.position.copy(
        geodeticToWorld(coordinate.latitude, coordinate.longitude, altitude),
      );
      this.camera.lookAt(0, 0, 0);
    }
    this.controls.minDistance = geodeticToWorld(
      coordinate.latitude,
      coordinate.longitude,
      MIN_ALTITUDE,
    ).length();
    this.controls.rotateSpeed = Math.min(0.42, (altitude / WGS84.a) * 0.22);
    const spin = Math.max(0, Math.min(1, (altitude - 80_000) / 2_500_000));
    this.controls.autoRotateSpeed = 0.06 * spin * spin;
    this.controls.autoRotate = this.rotating && !this.flight && spin > 0;

    const near = Math.max(0.1 / WGS84.a, Math.min(0.03, (altitude / WGS84.a) * 0.08));
    const far = Math.max(this.camera.far, 64);
    if (Math.abs(this.camera.near - near) > 1e-12 || this.camera.far !== far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  private notifyChange(): void {
    // OrbitControls' kilometre-scale epsilon is too large for city interactions.
    // Detect movement ourselves so labels and tile requests stay responsive.
    if (this.camera.position.distanceToSquared(this.lastNotifiedPosition) > 1e-24) {
      this.lastNotifiedPosition.copy(this.camera.position);
      this.onChange?.();
    }
  }

  private cancelFlight(): void {
    if (!this.flight) return;
    this.flight = null;
    this.onFlightState?.('cancelled');
  }

  private readonly handleInteraction = (): void => {
    this.cancelFlight();
    this.orbitAltitude = clampAltitude(this.altitudeMeters);
    this.refreshView();
  };

  private readonly handleChange = (): void => {
    this.refreshView();
    this.notifyChange();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.suspended) return;
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.domElement.clientHeight : 1;
    const delta = Math.max(-600, Math.min(600, event.deltaY * unit));
    this.zoom(Math.exp(delta * 0.0025));
  };

  private getPinchDistance(): number {
    if (this.touchPointers.size !== 2) return 0;
    const [first, second] = [...this.touchPointers.values()];
    return first.distanceTo(second);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.suspended) return;
    if (event.pointerType !== 'touch') return;
    this.touchPointers.set(event.pointerId, new Vector2(event.clientX, event.clientY));
    this.pinchDistance = this.getPinchDistance();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.suspended) return;
    const pointer = this.touchPointers.get(event.pointerId);
    if (!pointer) return;
    pointer.set(event.clientX, event.clientY);
    const distance = this.getPinchDistance();
    if (distance > 4 && this.pinchDistance > 4) {
      this.cancelFlight();
      const coordinate = this.centerCoordinates;
      this.orbitAltitude = clampAltitude(coordinate.altitude * (this.pinchDistance / distance));
      this.camera.position.copy(
        geodeticToWorld(coordinate.latitude, coordinate.longitude, this.orbitAltitude),
      );
      this.refreshView();
      this.notifyChange();
    }
    this.pinchDistance = distance;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.touchPointers.delete(event.pointerId);
    this.pinchDistance = this.getPinchDistance();
  };
}
