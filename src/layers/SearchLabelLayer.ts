import { Matrix4, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { SearchSurfaceText } from './SearchSurfaceText';
import { characterRanges } from './SearchTextLayout';
import { prefersReducedMotion } from '../app/NativeWindow';
import { geodeticToWorld, surfaceNormal, WGS84 } from '../geo/CoordinateSystem';
import { localSearchText, prepareSearchFonts, SEARCH_LATIN_FONT } from './SearchFonts';
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
/** One east/north oriented geographic SDF mesh. No per-frame text layout. */
export class SearchLabelLayer {
  private text?: SearchSurfaceText;
  private material?: MeshBasicMaterial;
  private normal = new Vector3();
  private projected = new Vector3();
  private viewPosition = new Vector3();
  private worldSize = 0;
  private expiresAt?: number;
  private generation = 0;
  private ready = false;
  private disposed = false;
  private name = '';
  private status = 'idle';
  private projectedSize = 0;
  private arrivalSize = 28;
  private fittedArrivalSize = 28;
  private zoomOpacity = 1;
  private lightBackground = false;
  private coordinates?: Readonly<{ latitude: number; longitude: number }>;
  private maxArrivalWidth = 0;
  private fontPreparation: Promise<boolean>;
  constructor(private readonly scene: Scene) {
    this.fontPreparation = prepareSearchFonts();
  }
  show(
    name: string,
    latitude: number,
    longitude: number,
    flying: boolean,
    arrivalAltitude = 250_000,
    viewportHeight = 800,
    fov = 43,
    viewportWidth = viewportHeight,
    maximumLabelWidth = Math.max(40, viewportWidth - 96),
  ) {
    if (this.disposed) return;
    this.clear();
    const generation = this.generation;
    this.name = localSearchText(name);
    this.coordinates = { latitude, longitude };
    this.maxArrivalWidth = maximumLabelWidth;
    this.status = 'preparing';
    this.worldSize =
      (this.arrivalSize * (arrivalAltitude / WGS84.a) * 2 * Math.tan((fov * Math.PI) / 360)) /
      Math.max(1, viewportHeight);
    const text = (this.text = new SearchSurfaceText(this.arrivalSize, maximumLabelWidth));
    this.material = new MeshBasicMaterial({ color: 0xe7eeeb, depthTest: true, depthWrite: false });
    text.material = this.material;
    text.name = 'search-surface-name';
    text.text = this.name;
    text.font = SEARCH_LATIN_FONT;
    text.fontSize = this.worldSize;
    text.anchorX = 'center';
    text.anchorY = 'middle';
    text.letterSpacing = 0;
    text.colorRanges = characterRanges(this.name);
    text.whiteSpace = 'nowrap';
    text.color = this.lightBackground ? 0x283b3c : 0xe7eeeb;
    text.outlineWidth = 0;
    text.outlineBlur = 0;
    text.outlineOpacity = 0;
    text.sdfGlyphSize = 64;
    text.glyphGeometryDetail = 4;
    text.fillOpacity = 0;
    text.visible = false;
    // Geographic frame with each glyph vertex subsequently projected onto WGS84.
    text.position.copy(geodeticToWorld(latitude, longitude, 2));
    this.normal.copy(surfaceNormal(latitude, longitude));
    const lon = (longitude * Math.PI) / 180;
    const east = new Vector3(-Math.sin(lon), 0, -Math.cos(lon));
    const north = new Vector3().crossVectors(this.normal, east);
    text.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(east, north, this.normal));
    const inverseAxes = new Vector3(1, WGS84.a / WGS84.b, 1);
    const surface = geodeticToWorld(latitude, longitude).multiply(inverseAxes);
    const e = east.clone().multiply(inverseAxes);
    const n = north.clone().multiply(inverseAxes);
    const up = this.normal.clone().multiply(inverseAxes);
    const surfaceScale = { value: 1 };
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.surfaceMetric = { value: new Vector3(e.dot(e), e.dot(n), n.dot(n)) };
      shader.uniforms.surfaceSlope = { value: new Vector3(surface.dot(up), e.dot(up), n.dot(up)) };
      shader.uniforms.surfaceA = { value: up.dot(up) };
      shader.uniforms.surfaceScale = surfaceScale;
      shader.vertexShader = `uniform vec3 surfaceMetric;
uniform vec3 surfaceSlope;
uniform float surfaceA;
uniform float surfaceScale;
${shader.vertexShader}`.replace(
        '#include <project_vertex>',
        `
// Solve the ellipsoid intersection along the geographic normal. The stable
// quadratic form avoids subtracting nearly equal Earth-sized coordinates.
vec2 surfaceXY = transformed.xy * surfaceScale;
float surfaceC = dot(vec3(surfaceXY.x * surfaceXY.x, 2.0 * surfaceXY.x * surfaceXY.y, surfaceXY.y * surfaceXY.y), surfaceMetric);
float surfaceB = dot(vec3(1.0, surfaceXY), surfaceSlope);
float surfaceSag = -surfaceC / (surfaceB + sqrt(max(0.0, surfaceB * surfaceB - surfaceA * surfaceC)));
transformed.z += surfaceSag / surfaceScale;
#include <project_vertex>`,
      );
    };
    this.material.customProgramCacheKey = () => 'search-wgs84-surface-v1';
    text.depthOffset = -4;
    text.renderOrder = 1000;
    text.frustumCulled = false;
    if (!flying) this.arrive();
    void this.fontPreparation.then((available) => {
      if (generation !== this.generation || this.disposed) return;
      if (!available) {
        this.status = 'font-unavailable';
        return;
      }
      text.sync(() => {
        if (generation !== this.generation || this.disposed) {
          text.dispose();
          return;
        }
        this.ready = true;
        this.status = 'ready';
        // Fit long names once at arrival; never counter-scale camera zoom.
        const fit = text.layoutFit;
        text.scale.setScalar(fit);
        surfaceScale.value = fit;
        this.fittedArrivalSize = this.arrivalSize * fit;
        this.scene.add(text);
      });
    });
  }
  arrive() {
    if (this.text && this.expiresAt === undefined) this.expiresAt = Date.now() + 3000;
  }
  hide() {
    if (this.text) this.text.visible = false;
  }
  get geographicAnchor() {
    return this.coordinates;
  }
  setLightBackground(light: boolean, luminance?: number) {
    // Keep the two atlas inks stable near the threshold during tile refinement.
    if (!light && luminance !== undefined) light = luminance > (this.lightBackground ? 0.19 : 0.27);
    if (this.lightBackground === light) return;
    this.lightBackground = light;
    if (this.text) this.text.color = light ? 0x283b3c : 0xe7eeeb;
  }
  resume() {
    if (this.expiresAt !== undefined && Date.now() >= this.expiresAt) this.clear();
  }
  update(
    camera: PerspectiveCamera,
    _width: number,
    height: number,
    now = Date.now(),
    flightProgress = 1,
  ) {
    const text = this.text;
    if (!text) return;
    const reduced = prefersReducedMotion();
    const remaining = this.expiresAt === undefined ? Infinity : this.expiresAt - now;
    if (remaining <= (reduced ? 0 : -500)) {
      this.clear();
      return;
    }
    if (!this.ready || document.hidden) {
      this.hide();
      return;
    }
    const facing = this.normal.dot(this.projected.copy(camera.position).sub(text.position));
    const depth = -this.viewPosition.copy(text.position).applyMatrix4(camera.matrixWorldInverse).z;
    this.projectedSize =
      (this.worldSize * height * camera.projectionMatrix.elements[5]) / (2 * Math.max(depth, 1e-9));
    // Calibrate to the actual fitted arrival em; enlarge physically, then fade 1.5x–3x.
    const zoomRatio = (this.projectedSize * text.scale.x) / Math.max(this.fittedArrivalSize, 1e-9);
    this.zoomOpacity = 1 - smooth((zoomRatio - 1.5) / 1.5);
    const opacity = this.expiresAt === undefined ? smooth((flightProgress - 2 / 3) * 3) : 1;
    text.fillOpacity =
      (reduced
        ? this.expiresAt !== undefined || flightProgress >= 1
          ? 1
          : 0
        : Math.max(0, Math.min(opacity, 1 + remaining / 500))) *
      smooth((this.projectedSize * text.scale.x - 0.7) / 1.3) *
      this.zoomOpacity;
    this.projected.copy(text.position).project(camera);
    text.visible =
      facing > 0 &&
      depth > 0 &&
      text.fillOpacity > 0 &&
      this.projectedSize >= 0.7 &&
      Math.abs(this.projected.x) < 1 &&
      Math.abs(this.projected.y) < 1 &&
      Math.abs(this.projected.z) < 1;
  }
  /** Read-only flight/zoom inspection without creating a hidden DOM label. */
  getState() {
    return {
      name: this.name,
      status: this.status,
      present: !!this.text,
      ready: this.ready,
      visible: this.text?.visible ?? false,
      opacity: this.text?.fillOpacity ?? 0,
      projectedSize: this.projectedSize,
      fittedProjectedSize: this.projectedSize * (this.text?.scale.x ?? 0),
      fittedArrivalSize: this.fittedArrivalSize,
      trackingFit: this.text?.trackingFit ?? 1,
      zoomOpacity: this.zoomOpacity,
      color: this.text?.color,
      surfaceProjection: 'WGS84',
      scale: this.text?.scale.x ?? 0,
      maxArrivalWidth: this.maxArrivalWidth,
      position: this.text?.position.toArray(),
      quaternion: this.text?.quaternion.toArray(),
      projectedAnchor: this.projected.toArray(),
      expiresAt: this.expiresAt,
    };
  }
  clear() {
    this.generation++;
    this.text?.removeFromParent();
    this.text?.dispose();
    this.text = undefined;
    this.material?.dispose();
    this.material = undefined;
    this.expiresAt = undefined;
    this.ready = false;
    this.name = '';
    this.coordinates = undefined;
    this.maxArrivalWidth = 0;
    this.status = 'idle';
    this.projectedSize = 0;
    this.fittedArrivalSize = this.arrivalSize;
    this.zoomOpacity = 1;
  }
  dispose() {
    this.disposed = true;
    this.clear();
  }
}
