import { PerspectiveCamera, Vector3 } from 'three';
import { prefersReducedMotion } from '../app/NativeWindow';
import { geodeticToWorld, surfaceNormal } from '../geo/CoordinateSystem';

/** One passive search destination, with a wall-clock expiry after actual arrival. */
export class SearchLabelLayer {
  private element?: HTMLSpanElement;
  private position = new Vector3();
  private normal = new Vector3();
  private projected = new Vector3();
  private firstVisible?: number;
  private expiresAt?: number;

  constructor(private readonly container: HTMLElement) {}

  show(name: string, latitude: number, longitude: number, flying: boolean) {
    this.clear();
    this.position.copy(geodeticToWorld(latitude, longitude, 1));
    this.normal.copy(surfaceNormal(latitude, longitude));
    this.element = document.createElement('span');
    this.element.className = 'search-place-label';
    this.element.textContent = name;
    this.element.hidden = true;
    this.container.append(this.element);
    if (!flying) this.arrive();
  }

  arrive() {
    if (this.element && this.expiresAt === undefined) this.expiresAt = Date.now() + 3000;
  }

  hide() {
    if (this.element) this.element.hidden = true;
  }

  update(camera: PerspectiveCamera, width: number, height: number, now = Date.now()) {
    const element = this.element;
    if (!element) return;
    const reduced = prefersReducedMotion();
    const remaining = this.expiresAt === undefined ? Infinity : this.expiresAt - now;
    if (remaining <= (reduced ? 0 : -220)) {
      this.clear();
      return;
    }
    if (document.hidden) {
      this.hide();
      return;
    }
    const facing = this.normal.dot(this.projected.copy(camera.position).sub(this.position));
    this.projected.copy(this.position).project(camera);
    if (
      facing <= 0 ||
      Math.abs(this.projected.x) >= 1 ||
      Math.abs(this.projected.y) >= 1 ||
      Math.abs(this.projected.z) >= 1
    ) {
      this.hide();
      return;
    }
    element.style.maxWidth = `${Math.max(0, Math.min(240, width - 32))}px`;
    element.hidden = false;
    const x = (this.projected.x * 0.5 + 0.5) * width;
    const y = (-this.projected.y * 0.5 + 0.5) * height - 18;
    const left = x - element.offsetWidth / 2;
    const top = y - element.offsetHeight;
    const bounds = this.container.getBoundingClientRect();
    const rect = {
      left: bounds.left + left,
      top: bounds.top + top,
      right: bounds.left + left + element.offsetWidth,
      bottom: bounds.top + y,
    };
    // Hide rather than pin a geographic label to a viewport edge or over controls.
    const outside =
      left < 12 ||
      top < 12 ||
      left + element.offsetWidth > width - 12 ||
      y > height - 12 ||
      rect.left < 12 ||
      rect.right > window.innerWidth - 12 ||
      rect.top < 12 ||
      rect.bottom > window.innerHeight - 12;
    const controls = this.container
      .closest('.experience')
      ?.querySelectorAll<HTMLElement>(
        '.toolbar, .view-bottom, .floating-panel:not([hidden]), .detail-status:not([hidden]), .tile-attribution:not([hidden])',
      );
    const overlaps =
      controls &&
      Array.from(controls).some((control) => {
        const b = control.getBoundingClientRect();
        return (
          b.width > 0 &&
          b.height > 0 &&
          rect.left < b.right + 8 &&
          rect.right > b.left - 8 &&
          rect.top < b.bottom + 8 &&
          rect.bottom > b.top - 8
        );
      });
    if (outside || overlaps) {
      this.hide();
      return;
    }
    this.firstVisible ??= now;
    const opacity = reduced ? 1 : Math.min(1, (now - this.firstVisible) / 180, 1 + remaining / 220);
    element.style.opacity = String(Math.max(0, opacity));
    element.style.transform = `translate(${left}px, ${top}px)`;
  }

  clear() {
    this.element?.remove();
    this.element = undefined;
    this.firstVisible = undefined;
    this.expiresAt = undefined;
  }

  dispose() {
    this.clear();
  }
}
