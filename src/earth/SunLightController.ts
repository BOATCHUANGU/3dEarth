import { Vector3 } from 'three';
import { surfaceNormal } from '../geo/CoordinateSystem';

/** Approximate solar ephemeris, adequate for a global visual terminator (not navigation). */
export class SunLightController {
  readonly direction = new Vector3();
  private date: Date;
  realtime = false;

  constructor() {
    this.date = new Date();
    // Curated dusk over East Asia; the UI explicitly labels this as a simulation.
    this.date.setUTCHours(10, 30, 0, 0);
    this.updateDirection();
  }

  get simulatedDate() {
    return new Date(this.date);
  }

  setHour(hour: number) {
    this.realtime = false;
    this.date.setUTCHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    this.updateDirection();
  }

  setRealtime() {
    this.realtime = true;
    this.update();
  }

  update() {
    if (!this.realtime) return;
    this.date = new Date();
    this.updateDirection();
  }

  private updateDirection() {
    const rad = Math.PI / 180;
    const days = this.date.getTime() / 86400000 - 10957.5;
    const meanLongitude = (280.46 + 0.9856474 * days) % 360;
    const anomaly = (357.528 + 0.9856003 * days) * rad;
    const longitude =
      (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * rad;
    const obliquity = (23.439 - 0.0000004 * days) * rad;
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude)) / rad;
    const rightAscension =
      Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude)) / rad;
    const sidereal = (280.46061837 + 360.98564736629 * days) % 360;
    const solarLongitude = ((rightAscension - sidereal + 540) % 360) - 180;
    this.direction.copy(surfaceNormal(declination, solarLongitude));
  }
}
