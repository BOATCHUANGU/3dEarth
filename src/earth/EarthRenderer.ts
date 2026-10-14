import { prefersReducedMotion } from '../app/NativeWindow';
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Clock,
  Color,
  DataTexture,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  ACESFilmicToneMapping,
  HalfFloatType,
  UnsignedByteType,
  MathUtils,
} from 'three';
import { gsap } from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EarthOutputPass } from './EarthOutputPass';
import { CameraController } from '../camera/CameraController';
import { geodeticToWorld, WGS84 } from '../geo/CoordinateSystem';
import { SearchLabelLayer } from '../layers/SearchLabelLayer';
import { createCloudMaterial, createEarthMaterial, earthVertex } from './EarthMaterial';
import { SunLightController } from './SunLightController';
import { ImageryTileLayer, type TileLayerState } from '../layers/ImageryTileLayer';
import type { MapMode } from '../layers/TileSources';

export type LayerName = 'clouds' | 'atmosphere' | 'night' | 'grid';
export interface RendererState {
  fps: number;
  altitude: number;
  latitude: number;
  longitude: number;
  autoRotate: boolean;
  tiles?: TileLayerState;
  pixelRatio: number;
}
export interface RendererOptions {
  onProgress: (progress: number) => void;
  onWarning: (message: string) => void;
  onState: (state: RendererState) => void;
  onError: (message: string) => void;
}

export class EarthRenderer {
  readonly camera = new PerspectiveCamera(43, 1, 0.01, 150);
  readonly controls: CameraController;
  readonly sun = new SunLightController();
  // All lit materials share this vector; canonical solar coordinates stay untouched.
  private readonly effectiveSunDirection = this.sun.direction.clone();
  readonly scene = new Scene();
  private readonly searchLabel: SearchLabelLayer;
  readonly renderer: WebGLRenderer;
  readonly layers: Record<LayerName, boolean> = {
    clouds: true,
    atmosphere: true,
    night: true,
    grid: false,
  };
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private output = new EarthOutputPass();
  private clouds?: Mesh<SphereGeometry, ShaderMaterial>;
  private surface?: Mesh<SphereGeometry, ShaderMaterial>;
  private atmosphere?: Mesh<SphereGeometry, ShaderMaterial>;
  private grid = new Group();
  private readonly globe = new Group();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private entrance?: gsap.core.Timeline;
  private entranceStarted = false;
  private entranceFinished = false;
  private onEntranceComplete?: () => void;
  private textures: Texture[] = [];
  private observer: ResizeObserver;
  private clock = new Clock();
  private frame = 0;
  private running = false;
  private disposed = false;
  private contextLost = false;
  private elapsed = 0;
  private frameCount = 0;
  private width = 1;
  private height = 1;
  private tiles?: ImageryTileLayer;
  private onVisibility = () => {
    if (document.hidden) {
      this.searchLabel.hide();
      this.entrance?.pause();
      cancelAnimationFrame(this.frame);
      this.clock.stop();
    } else if (this.running) {
      this.searchLabel.resume();
      this.entrance?.resume();
      this.clock.start();
      this.animate();
    }
  };
  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.searchLabel.clear();
    this.contextLost = true;
    this.running = false;
    this.cancelEntrance();
    this.controls.setSuspended(true);
    cancelAnimationFrame(this.frame);
    this.options.onError('图形连接已中断，请重新载入以恢复地球。');
  };
  private onMotionPreference = () => {
    if (prefersReducedMotion() && this.entranceFinished) this.controls.setAutoRotate(false);
    if (prefersReducedMotion() && this.entranceStarted && !this.entranceFinished) {
      this.finishEntrance();
    }
  };

  constructor(
    private container: HTMLElement,
    private options: RendererOptions,
  ) {
    this.renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // Linear HDR value that maps to the UI's #080d14 after ACES at exposure 1.12.
    // A scene background also clears after changing the active render target.
    this.scene.background = new Color().setRGB(0.00876581, 0.01234554, 0.01815227);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute('aria-label', '交互式三维地球：拖动旋转，滚轮或双指缩放');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.tabIndex = 0;
    container.prepend(this.renderer.domElement);
    this.controls = new CameraController(this.camera, this.renderer.domElement);
    this.controls.setSuspended(true);
    this.searchLabel = new SearchLabelLayer(this.scene);
    this.controls.onFlightState = (state, kind) => {
      if (state === 'arrived' && kind === 'travel') this.searchLabel.arrive();
      else if (kind === 'travel' && (state === 'cancelled' || state === 'started'))
        this.searchLabel.clear();
    };
    this.globe.visible = false;
    this.scene.add(this.globe);
    const hdr = this.renderer.extensions.has('EXT_color_buffer_float');
    const target = new WebGLRenderTarget(1, 1, {
      samples: this.renderer.capabilities.maxSamples,
      type: hdr ? HalfFloatType : UnsignedByteType,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.16, 0.45, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.setQuality();
    this.createStars();
    this.createGrid();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.reducedMotion.addEventListener('change', this.onMotionPreference);
    window.addEventListener('earth-motion-change', this.onMotionPreference);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.resize();
  }

  async initialize() {
    const maxTextureSize = this.renderer.capabilities.maxTextureSize;
    const useUltraTexture = maxTextureSize >= 12288;
    const textureTier = useUltraTexture
      ? '12k'
      : maxTextureSize >= 8192
        ? '8k'
        : maxTextureSize >= 4096
          ? '4k'
          : '2k';
    const textureFiles = {
      day:
        textureTier === '12k'
          ? 'earth-day-ultra.jpg'
          : textureTier === '8k'
            ? 'earth-day.jpg'
            : textureTier === '4k'
              ? 'earth-day-4k.jpg'
              : 'earth-day-2k.jpg',
      night:
        textureTier === '8k' || textureTier === '12k'
          ? 'earth-night.jpg'
          : textureTier === '4k'
            ? 'earth-night-4k.jpg'
            : 'earth-night-2k.jpg',
      clouds: textureTier === '2k' ? 'earth-clouds-2k.jpg' : 'earth-clouds.jpg',
      specular: textureTier === '2k' ? 'earth-specular-2k.png' : 'earth-specular.png',
    };
    let loaded = 0;
    const load = async (
      fileName: string,
      fallbackName: string,
      srgb: boolean,
      required = false,
    ) => {
      const loader = new TextureLoader();
      const base = `${import.meta.env.BASE_URL}textures/`;
      let texture: Texture;
      try {
        texture = await loader.loadAsync(`${base}${fileName}`);
      } catch {
        try {
          if (fileName === fallbackName) throw new Error('Fallback texture unavailable');
          texture = await loader.loadAsync(`${base}${fallbackName}`);
          this.options.onWarning('部分高清纹理不可用，已自动切换轻量素材。');
        } catch {
          if (required) throw new Error('地表素材加载失败，请检查本地纹理文件或刷新重试。');
          this.options.onWarning('部分图层素材未能载入，地球仍可继续浏览。');
          texture = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
          texture.needsUpdate = true;
        }
      }
      if (this.disposed) {
        texture.dispose();
        throw new Error('Renderer disposed');
      }
      if (srgb) texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.textures.push(texture);
      this.options.onProgress(++loaded / 4);
      return texture;
    };
    const [day, night, cloud, specular] = await Promise.all([
      load(textureFiles.day, 'earth-day-2k.jpg', true, true),
      load(textureFiles.night, 'earth-night-2k.jpg', true),
      load(textureFiles.clouds, 'earth-clouds-2k.jpg', false),
      load(textureFiles.specular, 'earth-specular-2k.png', false),
    ]);
    if (this.disposed || this.contextLost) return;
    const geometry = new SphereGeometry(1, 384, 256);
    geometry.scale(1, WGS84.b / WGS84.a, 1);
    this.surface = new Mesh(
      geometry,
      createEarthMaterial(day, night, specular, this.effectiveSunDirection),
    );
    this.globe.add(this.surface);
    this.tiles = new ImageryTileLayer(
      this.effectiveSunDirection,
      night,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.globe.add(this.tiles.group);
    this.clouds = new Mesh(geometry, createCloudMaterial(cloud, this.effectiveSunDirection));
    this.clouds.scale.setScalar(1.005);
    this.clouds.renderOrder = 100;
    this.globe.add(this.clouds);
    this.atmosphere = new Mesh(
      geometry,
      new ShaderMaterial({
        uniforms: { sunDirection: { value: this.effectiveSunDirection } },
        vertexShader: earthVertex,
        fragmentShader: /* glsl */ `
        uniform vec3 sunDirection;
        varying vec3 vNormalWorld;
        varying vec3 vPositionWorld;
        void main() {
          vec3 n = normalize(vNormalWorld);
          vec3 v = normalize(cameraPosition - vPositionWorld);
          float rim = pow(1.0 - abs(dot(n, v)), 4.5);
          float sun = smoothstep(-0.4, 0.8, dot(n, sunDirection));
          vec3 blue = mix(vec3(0.045,0.10,0.24), vec3(0.12,0.40,0.83), sun);
          gl_FragColor = vec4(blue * rim * 0.6, rim * 0.7);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.atmosphere.scale.setScalar(1.016);
    this.atmosphere.renderOrder = 101;
    this.globe.add(this.atmosphere);
    for (const name of Object.keys(this.layers) as LayerName[])
      this.setLayer(name, this.layers[name]);
    // Prepare the first frame before App starts fading the loading overlay.
    this.globe.scale.setScalar(prefersReducedMotion() ? 1 : 0.12);
    this.globe.quaternion.setFromAxisAngle(
      this.entranceAxis(),
      prefersReducedMotion() ? 0 : MathUtils.degToRad(40),
    );
    this.globe.visible = true;
    this.running = true;
    this.clock.start();
    this.animate();
  }

  /** Called once when local scene setup is complete; remote tiles are never awaited. */
  playEntrance(onComplete: () => void) {
    if (this.disposed || !this.running || this.entranceStarted) return;
    this.entranceStarted = true;
    this.onEntranceComplete = onComplete;
    if (prefersReducedMotion()) {
      this.finishEntrance();
      return;
    }
    const axis = this.entranceAxis();
    const pose = { angle: MathUtils.degToRad(40) };
    this.entrance = gsap.timeline({
      paused: true,
      defaults: { duration: 1.8, ease: 'power2.out' },
      onComplete: () => this.finishEntrance(),
    });
    // Let the overlay reveal the small globe before the simultaneous turn and zoom.
    this.entrance.to(this.globe.scale, { x: 1, y: 1, z: 1 }, 0.2);
    this.entrance.to(
      pose,
      {
        angle: 0,
        onUpdate: () => this.globe.quaternion.setFromAxisAngle(axis, pose.angle),
      },
      0.2,
    );
    if (!document.hidden) this.entrance.play();
  }

  private entranceAxis() {
    // Tilt relative to the view; keep the globe's centre and camera fixed.
    return new Vector3(0.8, 1, 0.25).normalize().applyQuaternion(this.camera.quaternion);
  }

  private finishEntrance() {
    if (this.disposed || !this.running || this.entranceFinished) return;
    this.entrance?.kill();
    this.entrance = undefined;
    this.resetEntrancePose();
    this.entranceFinished = true;
    this.controls.setSuspended(false);
    if (prefersReducedMotion()) this.controls.setAutoRotate(false);
    const complete = this.onEntranceComplete;
    this.onEntranceComplete = undefined;
    complete?.();
  }

  private cancelEntrance() {
    this.entrance?.kill();
    this.entrance = undefined;
    this.onEntranceComplete = undefined;
    this.resetEntrancePose();
  }

  private resetEntrancePose() {
    this.globe.scale.setScalar(1);
    this.globe.quaternion.identity();
    // Restore identity first, then lighting, including cancellation/reduced-motion paths.
    this.effectiveSunDirection.copy(this.sun.direction);
    this.globe.updateMatrixWorld(true);
  }

  private syncSunDirection() {
    // Uniform scale does not affect lighting direction. Both normals and sunlight
    // follow the same visual rotation, keeping the terminator attached to the map.
    // After entrance, the group's identity quaternion leaves canonical light unchanged.
    this.effectiveSunDirection.copy(this.sun.direction).applyQuaternion(this.globe.quaternion);
  }

  focusLocation(
    name: string,
    latitude: number,
    longitude: number,
    altitude: number,
    duration = 1.8,
  ) {
    this.controls.focusOn(latitude, longitude, altitude, duration);
    // Measure available center span once; the geographic label must not sit behind controls.
    const view = this.container.getBoundingClientRect();
    const toolbar = this.container.parentElement
      ?.querySelector<HTMLElement>('.toolbar')
      ?.getBoundingClientRect();
    const centerX = view.left + view.width / 2;
    const labelWidth =
      toolbar && toolbar.left > centerX
        ? Math.max(40, 2 * (toolbar.left - centerX - 12))
        : Math.max(40, this.width - 96);
    this.searchLabel.show(
      name,
      latitude,
      longitude,
      this.controls.isFlying,
      this.controls.destinationAltitude,
      this.height,
      this.camera.fov,
      this.width,
      labelWidth,
    );
  }

  get searchLabelState() {
    return this.searchLabel.getState();
  }

  setMapMode(mode: MapMode) {
    this.tiles?.setMode(mode);
  }
  retryTiles() {
    this.tiles?.retry();
  }
  get tileState() {
    return this.tiles?.getState();
  }

  setLayer(name: LayerName, visible: boolean) {
    this.layers[name] = visible;
    if (name === 'clouds' && this.clouds) this.clouds.visible = visible;
    if (name === 'atmosphere' && this.atmosphere) this.atmosphere.visible = visible;
    if (name === 'night' && this.surface)
      this.surface.material.uniforms.nightEnabled.value = +visible;
    if (name === 'night') this.tiles?.setNight(visible);
    if (name === 'grid') this.grid.visible = visible;
  }

  setQuality() {
    // Quality is deliberately independent of screen width, memory, core count and FPS.
    this.renderer.setPixelRatio(Math.max(2, window.devicePixelRatio));
    this.bloom.enabled = this.renderer.extensions.has('EXT_color_buffer_float');
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.resize();
  }

  private resize() {
    this.width = Math.max(this.container.clientWidth, 1);
    this.height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = this.width / this.height;
    // On portrait viewports, fit the complete globe within the available width.
    this.camera.fov =
      this.camera.aspect < 1
        ? (2 * Math.atan(Math.tan((43 * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI
        : 43;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.composer.setSize(this.width, this.height);
  }

  private createStars() {
    const vertices: number[] = [];
    const colors: number[] = [];
    let seed = 9035;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 1700; i++) {
      const theta = random() * Math.PI * 2;
      const z = random() * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      vertices.push(60 * r * Math.cos(theta), 60 * z, 60 * r * Math.sin(theta));
      const brightness = 0.1 + random() ** 3 * 0.48;
      colors.push(brightness * 0.83, brightness * 0.91, brightness);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.scene.add(
      new Points(
        geometry,
        new PointsMaterial({
          size: 0.085,
          vertexColors: true,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      ),
    );
  }

  private createGrid() {
    const vertices: number[] = [];
    const segment = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      vertices.push(
        ...geodeticToWorld(lat1, lon1, 18000).toArray(),
        ...geodeticToWorld(lat2, lon2, 18000).toArray(),
      );
    };
    for (let lat = -60; lat <= 60; lat += 30)
      for (let lon = -180; lon < 180; lon += 2) segment(lat, lon, lat, lon + 2);
    for (let lon = -180; lon < 180; lon += 30)
      for (let lat = -90; lat < 90; lat += 2) segment(lat, lon, lat + 2, lon);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    this.grid.add(
      new LineSegments(
        geometry,
        new LineBasicMaterial({
          color: 0x9fb5c3,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      ),
    );
    this.grid.visible = false;
    this.globe.add(this.grid);
  }

  private animate = () => {
    if (!this.running || this.disposed || document.hidden) return;
    const rawDelta = this.clock.getDelta();
    const delta = Math.min(rawDelta, 0.05);
    this.controls.update(delta);
    const altitude = this.controls.altitudeMeters;
    const haze = MathUtils.smoothstep(altitude, 80_000, 600_000);
    if (this.surface)
      this.surface.material.uniforms.clarity.value =
        1 - MathUtils.smoothstep(altitude, 150_000, 1_600_000);
    if (this.clouds) {
      this.clouds.visible = this.layers.clouds && haze > 0;
      this.clouds.material.uniforms.layerOpacity.value = haze;
    }
    if (this.atmosphere) this.atmosphere.visible = this.layers.atmosphere && altitude > 150_000;
    this.grid.visible = this.layers.grid && altitude > 200_000;
    this.bloom.strength = 0.16 * MathUtils.smoothstep(altitude, 150_000, 1_000_000);
    this.output.clarity = 1 - MathUtils.smoothstep(altitude, 150_000, 1_000_000);
    this.tiles?.update(this.camera, this.height * this.renderer.getPixelRatio(), delta);
    if (this.clouds && this.entranceFinished && !prefersReducedMotion())
      this.clouds.rotation.y += delta * 0.0006;
    this.syncSunDirection();
    this.camera.updateMatrixWorld();
    const labelAnchor = this.searchLabel.geographicAnchor;
    this.searchLabel.setLightBackground(
      this.tiles?.hasLightMapBackground ?? false,
      labelAnchor
        ? this.tiles?.searchLabelLuminance(labelAnchor.latitude, labelAnchor.longitude)
        : undefined,
    );
    if (this.entranceFinished)
      this.searchLabel.update(
        this.camera,
        this.width,
        this.height,
        Date.now(),
        this.controls.flightProgress,
      );
    this.composer.render(delta);
    this.elapsed += rawDelta;
    this.frameCount++;
    if (this.elapsed >= 0.5) {
      const center = this.controls.centerCoordinates;
      this.options.onState({
        fps: Math.round(this.frameCount / this.elapsed),
        ...center,
        autoRotate: this.controls.autoRotate,
        tiles: this.tiles?.getState(),
        pixelRatio: this.renderer.getPixelRatio(),
      });
      this.sun.update();
      this.elapsed = 0;
      this.frameCount = 0;
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  dispose() {
    this.disposed = true;
    this.running = false;
    this.cancelEntrance();
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.reducedMotion.removeEventListener('change', this.onMotionPreference);
    window.removeEventListener('earth-motion-change', this.onMotionPreference);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.controls.dispose();
    this.searchLabel.dispose();
    this.tiles?.dispose();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<{ dispose(): void }>();
    this.scene.traverse((object) => {
      if (object instanceof Mesh || object instanceof Points || object instanceof LineSegments) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) =>
          materials.add(material),
        );
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.composer.passes.forEach((pass) => pass.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
