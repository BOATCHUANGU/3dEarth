import {
  Frustum,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  Sphere,
  SRGBColorSpace,
  Texture,
  Vector3,
  MathUtils,
  type BufferGeometry,
  AlwaysDepth,
} from 'three';
import { WGS84, geodeticToWorld, surfaceNormal, worldToGeodetic } from '../geo/CoordinateSystem';
import {
  tileBounds,
  tileKey,
  parentTile,
  iterateMercatorTiles,
  targetZoom,
  tileUV,
  type MercatorTile,
} from './MercatorTiles';
import { createTileGeometry } from './TileGeometry';
import { viewBounds } from './ViewFootprint';
import { chooseTileSource, type MapMode, type TileSource } from './TileSources';
import { networkProfile, type NetworkState } from '../network/NetworkProfile';
import { TileMetrics, type TileSample } from '../network/TileMetrics';

class TileRequestError extends Error {
  constructor(
    readonly code: TileSample['outcome'],
    readonly retryMs = 0,
  ) {
    super(code);
  }
}

export interface TileLayerState {
  active: boolean;
  mode: MapMode;
  source: string;
  sourceName: string;
  attribution: string;
  attributionUrl: string;
  zoom: number;
  maxZoom: number;
  loaded: number;
  total: number;
  pending: number;
  failed: number;
  metersPerTexel: number;
  atNativeLimit: boolean;
  cached: number;
  network: NetworkState;
  fallback: boolean;
  labelsLoaded: number;
  labelsTotal: number;
  labelsFailed: number;
  diagnostics: ReturnType<TileMetrics['snapshot']>;
  credits: Array<{ id: string; label: string; url: string }>;
}
interface Entry {
  key: string;
  tile: MercatorTile;
  source: TileSource;
  touched: number;
  controller?: AbortController;
  state: 'queued' | 'loading' | 'ready' | 'error';
  mesh?: Mesh<BufferGeometry, ShaderMaterial>;
  texture?: Texture;
  image?: ImageBitmap;
  readyAt?: number;
  retryAt?: number;
  priority: number;
  queuedAt: number;
  labelsController?: AbortController;
  labelsState?: 'queued' | 'loading' | 'ready' | 'error';
  labelsRetryAt?: number;
  labelsTexture?: Texture;
  labelsImage?: ImageBitmap;
  palettePixels?: Uint8ClampedArray;
}

/** Continuous, view-driven WGS84 imagery. It never coarsens LOD in response to FPS/device size. */
export class ImageryTileLayer {
  readonly group = new Group();
  private entries = new Map<string, Entry>();
  private wanted = new Set<string>();
  private leaves: string[] = [];
  private previousCover = new Set<string>();
  private mode: MapMode = 'auto';
  private source?: TileSource;
  private disposed = false;
  private pending = 0;
  private selectionClock = 1;
  private time = 0;
  private zoom = 0;
  private desiredZoom = 0;
  private altitude = 0;
  private latitude = 0;
  private enabled = false;
  private frustum = new Frustum();
  private nights = true;
  private quality = { value: 0 };
  private opacity = { value: 0 };
  private metrics = new TileMetrics();
  private health = new Map<string, { failures: number; blockedUntil: number }>();
  private preferredId = '';
  private fallbackSource?: TileSource;
  private unsubscribeNetwork: () => void;
  private paletteContext?: CanvasRenderingContext2D | null;

  constructor(
    private worldSun: Vector3,
    private nightMap: Texture,
    private anisotropy: number,
  ) {
    this.group.name = 'WGS84 imagery quadtree';
    let previousNetwork = networkProfile.getState();
    this.unsubscribeNetwork = networkProfile.subscribe(() => {
      const network = networkProfile.getState();
      if (
        network.preference !== previousNetwork.preference ||
        network.region !== previousNetwork.region ||
        network.chinaAvailable !== previousNetwork.chinaAvailable ||
        network.transport !== previousNetwork.transport
      )
        this.retry();
      if (!network.online && previousNetwork.online)
        for (const entry of this.entries.values()) {
          entry.controller?.abort();
          entry.labelsController?.abort();
        }
      if (network.online && !previousNetwork.online) this.selectionClock = 1;
      previousNetwork = network;
    });
  }

  setMode(mode: MapMode) {
    this.mode = mode;
    this.fallbackSource = undefined;
    this.preferredId = '';
    this.selectionClock = 1;
  }
  setNight(enabled: boolean) {
    this.nights = enabled;
  }
  retry() {
    const now = Date.now();
    // Manual retries do not bypass an upstream Retry-After / provider cooldown.
    for (const [source, health] of this.health)
      if (health.blockedUntil <= now) this.health.delete(source);
    this.fallbackSource = undefined;
    for (const entry of this.entries.values()) {
      if (entry.state === 'error')
        entry.retryAt = this.health.get(entry.source.id)?.blockedUntil ?? 0;
      if (entry.labelsState === 'error') entry.labelsRetryAt = entry.retryAt ?? 0;
    }
    this.selectionClock = 1;
  }

  /** Palette hint only; does not change tile selection, lighting, or rendering. */
  get hasLightMapBackground(): boolean {
    return (
      this.enabled &&
      this.source?.kind === 'map' &&
      this.opacity.value > 0.6 &&
      this.leaves.some((key) => this.entries.get(key)?.state === 'ready')
    );
  }

  /** Label-only hint from already drawn imagery; no requests or GPU readback. */
  searchLabelLuminance(latitude: number, longitude: number): number | undefined {
    let cover: Entry | undefined;
    let uv: ReturnType<typeof tileUV> | undefined;
    for (const entry of this.entries.values()) {
      if (
        !entry.mesh?.visible ||
        !entry.image ||
        entry.source.kind === 'map' ||
        entry.mesh.material.uniforms.fade.value * this.opacity.value < 0.6
      )
        continue;
      const point = tileUV(longitude, latitude, entry.tile);
      if (
        point.u < 0 ||
        point.u > 1 ||
        point.v < 0 ||
        point.v > 1 ||
        (cover && entry.tile.z <= cover.tile.z)
      )
        continue;
      cover = entry;
      uv = point;
    }
    if (!cover || !uv) return;
    try {
      if (!cover.palettePixels) {
        if (this.paletteContext === undefined) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 8;
          this.paletteContext = canvas.getContext('2d', { willReadFrequently: true });
        }
        if (!this.paletteContext) return;
        this.paletteContext.drawImage(cover.image!, 0, 0, 8, 8);
        cover.palettePixels = this.paletteContext.getImageData(0, 0, 8, 8).data;
      }
      // ImageBitmap was decoded with flipY; Mercator UV uses north-to-south rows.
      const x = Math.max(1, Math.min(6, Math.floor(uv.u * 8)));
      const y = Math.max(1, Math.min(6, Math.floor((1 - uv.v) * 8)));
      const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      let luminance = 0;
      for (let row = y - 1; row <= y + 1; row++)
        for (let col = x - 1; col <= x + 1; col++) {
          const i = (row * 8 + col) * 4,
            p = cover.palettePixels;
          luminance +=
            0.2126 * linear(p[i] / 255) +
            0.7152 * linear(p[i + 1] / 255) +
            0.0722 * linear(p[i + 2] / 255);
        }
      return luminance / 9;
    } catch {
      return undefined;
    }
  }

  getState(): TileLayerState {
    const source = this.source;
    const loaded = this.leaves.filter((key) => this.entries.get(key)?.state === 'ready').length;
    return {
      active: this.enabled && this.leaves.length > 0,
      mode: this.mode,
      source: source?.id ?? '',
      sourceName: source?.name ?? '全球影像',
      attribution: source?.attribution ?? '',
      attributionUrl: source?.attributionUrl ?? '',
      zoom: this.zoom,
      maxZoom: source?.maxZoom ?? 19,
      loaded,
      total: this.leaves.length,
      pending: this.pending,
      failed: [...this.wanted].filter((key) => this.entries.get(key)?.state === 'error').length,
      metersPerTexel:
        (Math.cos((this.latitude * Math.PI) / 180) * 2 * Math.PI * WGS84.a) /
        (256 * 2 ** this.zoom),
      atNativeLimit: this.desiredZoom > (source?.maxZoom ?? 19),
      cached: this.entries.size,
      network: networkProfile.getState(),
      fallback: !!source && source.id !== this.preferredId,
      labelsTotal: source?.annotationUrl ? this.leaves.length : 0,
      labelsLoaded: this.leaves.filter((key) => this.entries.get(key)?.labelsState === 'ready')
        .length,
      labelsFailed: this.leaves.filter((key) => this.entries.get(key)?.labelsState === 'error')
        .length,
      diagnostics: this.metrics.snapshot(),
      credits: [
        ...new Map(
          [source, ...[...this.previousCover].map((key) => this.entries.get(key)?.source)]
            .filter((item): item is TileSource => !!item)
            .map((item) => [
              item.id,
              { id: item.id, label: item.attribution, url: item.attributionUrl },
            ]),
        ).values(),
      ],
    };
  }

  update(camera: PerspectiveCamera, physicalHeight: number, delta: number) {
    this.time += delta;
    const center = worldToGeodetic(camera.position.x, camera.position.y, camera.position.z);
    this.altitude = center.altitude;
    this.latitude = center.latitude;
    this.enabled = this.altitude < 3_500_000;
    this.group.visible = this.enabled;
    this.quality.value = 1 - MathUtils.smoothstep(this.altitude, 150_000, 1_600_000);
    this.opacity.value = 1 - MathUtils.smoothstep(this.altitude, 2_000_000, 3_500_000);
    this.selectionClock += delta;
    if (this.selectionClock > 0.16) {
      this.selectionClock = 0;
      if (this.enabled) this.select(camera, physicalHeight, center.longitude);
      else this.deactivate();
    }
    this.group.visible = this.enabled && this.leaves.length > 0;
    const fullyReady =
      this.leaves.length > 0 &&
      this.leaves.every((key) => {
        const entry = this.entries.get(key);
        return entry?.state === 'ready' && this.time - (entry.readyAt ?? 0) >= 0.28;
      });
    if (fullyReady) this.previousCover.clear();
    const draw = new Set(this.previousCover);
    for (const key of this.leaves) {
      const leaf = this.entries.get(key);
      if (!leaf) continue;
      let tile: MercatorTile | null = leaf.tile;
      while (tile && tile.z >= (leaf.source.minZoom ?? 0)) {
        const entryKey = `${leaf.source.id}/${tileKey(tile)}`;
        const entry = this.entries.get(entryKey);
        if (entry?.state === 'ready') {
          draw.add(entryKey);
          break;
        }
        tile = parentTile(tile);
      }
    }
    // Keep parents below fading children so refinement cannot reveal holes.
    for (const key of [...draw]) {
      const entry = this.entries.get(key);
      if (!entry || this.time - (entry.readyAt ?? 0) > 0.3) continue;
      let parent = parentTile(entry.tile);
      while (parent) {
        const parentKey = `${entry.source.id}/${tileKey(parent)}`;
        if (this.entries.get(parentKey)?.state === 'ready') {
          draw.add(parentKey);
          break;
        }
        parent = parentTile(parent);
      }
    }
    for (const entry of this.entries.values())
      if (entry.mesh) {
        entry.mesh.visible = draw.has(entry.key);
        if (entry.mesh.visible) {
          entry.touched = this.time;
          entry.mesh.material.uniforms.fade.value = MathUtils.smoothstep(
            this.time - (entry.readyAt ?? 0),
            0,
            0.28,
          );
          entry.mesh.material.uniforms.nightEnabled.value = +this.nights;
          entry.mesh.renderOrder =
            10 + entry.tile.z + (entry.source.id === this.source?.id ? 40 : 0);
        }
      }
    this.pump();
  }

  private select(camera: PerspectiveCamera, physicalHeight: number, longitude: number) {
    const preferred = chooseTileSource(this.mode, this.altitude, this.latitude, longitude);
    if (preferred.id !== this.preferredId) {
      this.fallbackSource = undefined;
      this.preferredId = preferred.id;
    }
    const blocked = new Set(
      [...this.health].filter(([, health]) => health.blockedUntil > Date.now()).map(([id]) => id),
    );
    let nextSource =
      this.fallbackSource && !blocked.has(this.fallbackSource.id) ? this.fallbackSource : preferred;
    if (blocked.has(nextSource.id))
      nextSource = chooseTileSource(this.mode, this.altitude, this.latitude, longitude, blocked);
    if (nextSource.id !== preferred.id) this.fallbackSource = nextSource;
    if (nextSource.id !== this.source?.id) {
      this.previousCover = new Set(
        [...this.entries.values()].filter((entry) => entry.mesh?.visible).map((entry) => entry.key),
      );
      this.source = nextSource;
    }
    const bounds = viewBounds(camera);
    if (!bounds || bounds.south > bounds.north) {
      this.deactivate();
      return;
    }
    this.desiredZoom = targetZoom(
      this.altitude,
      this.latitude,
      camera.fov,
      physicalHeight,
      nextSource.tileSize,
      22,
    );
    const nextZoom = Math.max(
      nextSource.minZoom ?? 0,
      Math.min(nextSource.maxZoom, this.desiredZoom),
    );
    if (nextZoom !== this.zoom) {
      for (const entry of this.entries.values())
        if (entry.mesh?.visible) this.previousCover.add(entry.key);
    }
    this.zoom = nextZoom;
    this.frustum.setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const tiles: MercatorTile[] = [];
    for (const tile of iterateMercatorTiles(bounds, this.zoom)) {
      if (this.isVisible(tile, camera)) tiles.push(tile);
    }
    const center = geodeticToWorld(this.latitude, longitude);
    tiles.sort((a, b) => this.tileDistance(a, center) - this.tileDistance(b, center));
    const wanted = new Set<string>();
    this.leaves = [];
    for (const entry of this.entries.values()) entry.priority = Infinity;
    const request = (tile: MercatorTile, priority: number) => {
      const key = `${nextSource.id}/${tileKey(tile)}`;
      wanted.add(key);
      let entry = this.entries.get(key);
      if (!entry) {
        entry = {
          key,
          tile,
          source: nextSource,
          touched: this.time,
          state: 'queued',
          priority,
          queuedAt: performance.now(),
        };
        this.entries.set(key, entry);
      }
      entry.touched = this.time;
      entry.priority = Math.min(entry.priority, priority);
      if (entry.state === 'error' && Date.now() >= (entry.retryAt ?? 0)) {
        entry.state = 'queued';
        entry.queuedAt = performance.now();
      }
      if (entry.labelsState === 'error' && Date.now() >= (entry.labelsRetryAt ?? 0))
        entry.labelsState = 'queued';
      return key;
    };
    // One complete coarse cover, then final-resolution children. Fetching all
    // three intermediate levels first delays useful detail on long-distance links.
    for (const [index, tile] of tiles.entries()) {
      const leafKey = request(tile, 1_000_000 + index);
      this.leaves.push(leafKey);
      let cover = tile;
      const coverZoom = Math.max(nextSource.minZoom ?? 0, this.zoom - 3);
      while (cover.z > coverZoom) cover = parentTile(cover)!;
      if (cover.z !== tile.z && this.entries.get(leafKey)?.state !== 'ready') request(cover, index);
    }
    this.wanted = wanted;
    for (const entry of this.entries.values())
      if (!wanted.has(entry.key)) {
        entry.controller?.abort();
        entry.labelsController?.abort();
      }
    this.evict();
  }

  private tileDistance(tile: MercatorTile, center: Vector3) {
    const b = tileBounds(tile);
    return geodeticToWorld((b.north + b.south) / 2, (b.west + b.east) / 2).distanceToSquared(
      center,
    );
  }

  private isVisible(tile: MercatorTile, camera: PerspectiveCamera) {
    const b = tileBounds(tile);
    const center = geodeticToWorld((b.north + b.south) / 2, (b.west + b.east) / 2);
    const corners = [
      geodeticToWorld(b.north, b.west),
      geodeticToWorld(b.north, b.east),
      geodeticToWorld(b.south, b.west),
      geodeticToWorld(b.south, b.east),
    ];
    const radius = Math.max(...corners.map((point) => point.distanceTo(center)));
    if (!this.frustum.intersectsSphere(new Sphere(center, radius + 1e-7))) return false;
    const normal = surfaceNormal((b.north + b.south) / 2, (b.west + b.east) / 2);
    const angularRadius = Math.max(...corners.map((point) => normal.angleTo(point)));
    const horizon = Math.acos(Math.min(1, WGS84.b / WGS84.a / camera.position.length()));
    return normal.angleTo(camera.position) <= horizon + angularRadius + 0.01;
  }

  private pump() {
    const network = networkProfile.getState();
    if (this.disposed || !this.enabled || !network.online || !network.mapsConfigured) return;
    const queue = [...this.entries.values()].filter(
      (entry) =>
        this.wanted.has(entry.key) &&
        entry.state === 'queued' &&
        (this.health.get(entry.source.id)?.blockedUntil ?? 0) <= Date.now(),
    );
    // Fill a parent cover first; sharp children then replace it from the centre out.
    queue.sort((a, b) => a.priority - b.priority);
    for (const entry of queue) {
      if (this.pending >= network.concurrency) break;
      void this.load(entry);
    }
    for (const key of this.leaves) {
      if (this.pending >= network.concurrency) break;
      const entry = this.entries.get(key);
      if (
        entry?.state === 'ready' &&
        entry.labelsState === 'queued' &&
        (this.health.get(entry.source.id)?.blockedUntil ?? 0) <= Date.now()
      )
        void this.loadLabels(entry);
    }
  }

  private async fetchBitmap(entry: Entry, controller: AbortController, labels = false) {
    const network = networkProfile.getState();
    const started = performance.now();
    const sample: TileSample = {
      source: entry.source.id,
      kind: labels ? 'labels' : 'base',
      outcome: 'network',
      queueMs: Math.max(0, started - entry.queuedAt),
      ttfbMs: 0,
      totalMs: 0,
      bytes: 0,
      cache: '',
    };
    let timedOut = false;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      entry.source.id === 'usgs-naip' ? 35_000 : network.timeoutMs,
    );
    try {
      const response = await fetch(
        labels ? entry.source.annotationUrl!(entry.tile) : entry.source.url(entry.tile),
        { signal: controller.signal, credentials: 'omit' },
      );
      sample.ttfbMs = performance.now() - started;
      sample.cache = response.headers.get('x-earth-cache') ?? '';
      const retryHeader = response.headers.get('retry-after');
      const retryMs = retryHeader
        ? Math.max(
            0,
            /^\d+$/.test(retryHeader)
              ? Number(retryHeader) * 1000
              : Date.parse(retryHeader) - Date.now(),
          )
        : 0;
      if (response.headers.has('x-blocked')) throw new TileRequestError('denied', 60_000);
      if (!response.ok)
        throw new TileRequestError(
          `http-${response.status}`,
          Number.isFinite(retryMs) ? retryMs : 0,
        );
      if (!response.headers.get('content-type')?.startsWith('image/'))
        throw new TileRequestError('denied', 60_000);
      const blob = await response.blob();
      sample.bytes = blob.size;
      sample.outcome = 'decode';
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      sample.outcome = 'ok';
      return bitmap;
    } catch (error) {
      sample.outcome = timedOut
        ? 'timeout'
        : controller.signal.aborted
          ? 'cancelled'
          : error instanceof TileRequestError
            ? error.code
            : sample.outcome;
      if (sample.outcome === 'cancelled') throw error;
      throw new TileRequestError(
        sample.outcome,
        error instanceof TileRequestError ? error.retryMs : 0,
      );
    } finally {
      clearTimeout(timeout);
      sample.totalMs = performance.now() - started;
      this.metrics.record(sample);
    }
  }

  private failed(entry: Entry, error: unknown) {
    const previous = this.health.get(entry.source.id) ?? { failures: 0, blockedUntil: 0 };
    const code = error instanceof TileRequestError ? error.code : 'network';
    previous.failures++;
    const denied = ['denied', 'http-401', 'http-403', 'http-429'].includes(code);
    const retryMs = error instanceof TileRequestError ? error.retryMs : 0;
    if (denied || previous.failures >= 4 || retryMs > 0) {
      previous.blockedUntil = Math.max(
        previous.blockedUntil,
        Date.now() + Math.max(90_000, retryMs),
      );
      for (const other of this.entries.values())
        if (other !== entry && other.source.id === entry.source.id) {
          other.controller?.abort();
          other.labelsController?.abort();
        }
      this.selectionClock = 1;
    }
    this.health.set(entry.source.id, previous);
    entry.retryAt = Math.max(Date.now() + 15_000 + Math.random() * 3000, previous.blockedUntil);
  }

  private async load(entry: Entry) {
    entry.state = 'loading';
    const controller = new AbortController();
    entry.controller = controller;
    this.pending++;
    try {
      const bitmap = await this.fetchBitmap(entry, controller);
      if (this.disposed || controller.signal.aborted) {
        bitmap.close();
        if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
        return;
      }
      entry.image = bitmap;
      const texture = new Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = this.anisotropy;
      texture.needsUpdate = true;
      entry.texture = texture;
      const { geometry, center } = createTileGeometry(entry.tile);
      const material = this.material(texture, entry);
      const mesh = new Mesh(geometry, material);
      mesh.position.copy(center);
      mesh.renderOrder = 10 + entry.tile.z;
      mesh.visible = false;
      entry.mesh = mesh;
      this.group.add(mesh);
      entry.state = 'ready';
      entry.readyAt = this.time;
      if (entry.source.annotationUrl) entry.labelsState = 'queued';
      const health = this.health.get(entry.source.id);
      if (health && health.blockedUntil <= Date.now()) health.failures = 0;
    } catch (error) {
      this.releaseResources(entry);
      if (
        (controller.signal.aborted &&
          !(error instanceof TileRequestError && error.code === 'timeout')) ||
        this.disposed
      ) {
        if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
      } else {
        entry.state = 'error';
        this.failed(entry, error);
      }
    } finally {
      this.pending--;
      entry.controller = undefined;
      this.pump();
    }
  }

  private async loadLabels(entry: Entry) {
    const controller = new AbortController();
    entry.labelsController = controller;
    entry.labelsState = 'loading';
    entry.queuedAt = performance.now();
    this.pending++;
    try {
      const bitmap = await this.fetchBitmap(entry, controller, true);
      if (this.disposed || controller.signal.aborted || !entry.mesh) {
        bitmap.close();
        entry.labelsState = 'queued';
        return;
      }
      const texture = new Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = this.anisotropy;
      texture.needsUpdate = true;
      entry.labelsImage = bitmap;
      entry.labelsTexture = texture;
      entry.labelsState = 'ready';
      entry.mesh.material.uniforms.labelMap.value = texture;
      entry.mesh.material.uniforms.hasLabels.value = 1;
    } catch (error) {
      const cancelled =
        controller.signal.aborted &&
        !(error instanceof TileRequestError && error.code === 'timeout');
      entry.labelsState = cancelled ? 'queued' : 'error';
      entry.labelsRetryAt =
        Date.now() + Math.max(30_000, error instanceof TileRequestError ? error.retryMs : 0);
    } finally {
      this.pending--;
      entry.labelsController = undefined;
      this.pump();
    }
  }

  private material(texture: Texture, entry: Entry) {
    return new ShaderMaterial({
      uniforms: {
        tileMap: { value: texture },
        labelMap: { value: texture },
        hasLabels: { value: 0 },
        nightMap: { value: this.nightMap },
        sunDirection: { value: this.worldSun },
        clarity: this.quality,
        layerOpacity: this.opacity,
        fade: { value: 0 },
        nightEnabled: { value: +this.nights },
        mapStyle: { value: +(entry.source.kind === 'map') },
      },
      // Tile meshes and their globe parent use translation, rotation and uniform scale.
      // Match EarthMaterial's world-space normals and shared world-space sunlight.
      vertexShader: `attribute vec2 globalUv; varying vec2 vUv; varying vec2 vGlobalUv; varying vec3 vNormalWorld;
        void main() { vUv=uv; vGlobalUv=globalUv; vNormalWorld=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tileMap; uniform sampler2D labelMap; uniform float hasLabels; uniform sampler2D nightMap; uniform vec3 sunDirection;
        uniform float clarity; uniform float layerOpacity; uniform float fade; uniform float nightEnabled; uniform float mapStyle;
        varying vec2 vUv; varying vec2 vGlobalUv; varying vec3 vNormalWorld;
        void main() {
          vec3 albedo=texture2D(tileMap,vUv).rgb;
          if(hasLabels>0.5) { vec4 label=texture2D(labelMap,vUv); albedo=mix(albedo,label.rgb,label.a); }
          float sunlight=dot(normalize(vNormalWorld),sunDirection);
          float clearLight=max(clarity,mapStyle);
          vec3 color=albedo*mix(0.025+max(sunlight,0.0)*1.35,1.0,clearLight);
          vec3 night=texture2D(nightMap,vGlobalUv).rgb;
          color+=night*vec3(2.1,1.64,1.09)*(1.0-smoothstep(-0.22,0.1,sunlight))*nightEnabled*(1.0-clearLight);
          gl_FragColor=vec4(color,fade*layerOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      // Front-face culling and view selection prevent far-side tiles. Draw the
      // tile cover over the coarser global mesh independent of its triangle chords.
      transparent: true,
      depthWrite: true,
      depthFunc: AlwaysDepth,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -entry.tile.z - 1,
    });
  }

  private deactivate() {
    this.wanted.clear();
    this.leaves = [];
    this.previousCover.clear();
    for (const entry of this.entries.values()) {
      entry.controller?.abort();
      entry.labelsController?.abort();
    }
  }

  private evict() {
    // Only unused resources are evicted; this never changes visible resolution.
    const unused = [...this.entries.values()]
      .filter(
        (entry) =>
          !this.wanted.has(entry.key) &&
          !this.previousCover.has(entry.key) &&
          !entry.mesh?.visible &&
          !entry.labelsController &&
          entry.state !== 'loading',
      )
      .sort((a, b) => a.touched - b.touched);
    for (const entry of unused) {
      if (this.entries.size <= 640) break;
      this.free(entry);
    }
  }
  private free(entry: Entry) {
    this.releaseResources(entry);
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
  }
  private releaseResources(entry: Entry) {
    if (entry.mesh) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    }
    entry.texture?.dispose();
    entry.image?.close();
    entry.labelsTexture?.dispose();
    entry.labelsImage?.close();
    entry.labelsTexture = undefined;
    entry.labelsImage = undefined;
    entry.mesh = undefined;
    entry.texture = undefined;
    entry.image = undefined;
    entry.palettePixels = undefined;
  }
  dispose() {
    this.disposed = true;
    this.unsubscribeNetwork();
    for (const entry of this.entries.values()) {
      entry.controller?.abort();
      entry.labelsController?.abort();
      this.free(entry);
    }
    this.wanted.clear();
    this.leaves = [];
  }
}
