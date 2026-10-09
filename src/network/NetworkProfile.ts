import { apiUrl, onlineMapsConfigured } from './ApiEndpoint';

export type NetworkPreference = 'auto' | 'china' | 'global';
interface ConnectionInfo extends EventTarget {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
}
export interface NetworkState {
  preference: NetworkPreference;
  region: 'china' | 'global';
  reason: string;
  online: boolean;
  effectiveType: string;
  rtt: number | null;
  downlink: number | null;
  saveData: boolean;
  concurrency: number;
  timeoutMs: number;
  chinaAvailable: boolean;
  transport: 'direct' | 'relay';
  configuration: 'loading' | 'ready' | 'unavailable';
  mapsConfigured: boolean;
}

const storageKey = 'earth.network.preference.v1';
const valid = (value: unknown): value is NetworkPreference =>
  typeof value === 'string' && ['auto', 'china', 'global'].includes(value);

/** No IP lookup, geolocation permission, tile probes, or background downloads. */
class NetworkProfile {
  private preference: NetworkPreference = 'auto';
  private deployment: NetworkPreference = valid(import.meta.env.VITE_NETWORK_REGION)
    ? import.meta.env.VITE_NETWORK_REGION
    : 'auto';
  private chinaAvailable =
    import.meta.env.VITE_DIRECT_TILES === 'true' &&
    Boolean(import.meta.env.VITE_TIANDITU_TOKEN?.trim());
  private configuration: NetworkState['configuration'] = 'loading';
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private connection?: ConnectionInfo;
  private started = false;
  private snapshot!: NetworkState;

  constructor() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (valid(saved)) this.preference = saved;
    } catch {
      /* optional storage */
    }
    this.refresh();
  }

  getState(): NetworkState {
    return { ...this.snapshot };
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  setPreference(preference: NetworkPreference) {
    if (!valid(preference)) throw new RangeError('Unknown network preference');
    this.preference = preference;
    try {
      localStorage.setItem(storageKey, preference);
    } catch {
      /* private browsing */
    }
    this.refresh();
    if (this.started && this.configuration === 'unavailable' && this.snapshot.online)
      void this.loadConfiguration();
  }

  private refresh = () => {
    const nav =
      typeof navigator === 'undefined'
        ? undefined
        : (navigator as Navigator & { connection?: ConnectionInfo });
    const connection = nav?.connection;
    let zone = '';
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* optional hint */
    }
    const chinaHint =
      ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi'].includes(
        zone,
      ) &&
      (nav?.languages ?? [nav?.language ?? '']).some((language) =>
        /^zh(?:-CN|-Hans(?:-CN)?)?$/i.test(language),
      );
    const selected = this.preference !== 'auto' ? this.preference : this.deployment;
    const region = selected !== 'auto' ? selected : chinaHint ? 'china' : 'global';
    const reason =
      this.preference !== 'auto'
        ? '手动选择'
        : this.deployment !== 'auto'
          ? '部署配置'
          : chinaHint
            ? '时区与语言提示，可手动更改'
            : '默认线路，可手动更改';
    const slow =
      connection?.saveData ||
      ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '') ||
      ((connection?.downlink ?? 0) > 0 && (connection?.downlink ?? 0) < 1.5) ||
      (connection?.rtt ?? 0) > 600;
    this.snapshot = {
      preference: this.preference,
      region,
      reason,
      online: nav?.onLine !== false,
      effectiveType: connection?.effectiveType ?? 'unknown',
      rtt: connection?.rtt ?? null,
      downlink: connection?.downlink ?? null,
      saveData: connection?.saveData ?? false,
      concurrency: slow ? 4 : 8,
      timeoutMs: slow ? 20_000 : 12_000,
      chinaAvailable: this.chinaAvailable,
      transport: import.meta.env.VITE_DIRECT_TILES === 'true' ? 'direct' : 'relay',
      configuration: this.configuration,
      mapsConfigured: onlineMapsConfigured,
    };
    this.listeners.forEach((listener) => listener());
  };

  private restored = () => {
    this.refresh();
    if (this.configuration === 'loading' && this.controller) {
      this.controller.abort();
      this.controller = undefined;
    }
    if (this.configuration !== 'ready') void this.loadConfiguration();
  };

  async initialize() {
    if (this.started) return;
    this.started = true;
    this.connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
    this.connection?.addEventListener('change', this.refresh);
    window.addEventListener('online', this.restored);
    window.addEventListener('offline', this.refresh);
    if (import.meta.env.VITE_DIRECT_TILES === 'true') {
      this.configuration = 'ready';
      this.refresh();
      return;
    }
    await this.loadConfiguration();
  }

  private async loadConfiguration() {
    if (!this.started || this.controller) return;
    if (!onlineMapsConfigured) {
      this.configuration = 'unavailable';
      this.chinaAvailable = false;
      this.refresh();
      return;
    }
    this.configuration = 'loading';
    this.refresh();
    this.controller = new AbortController();
    const controller = this.controller;
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(apiUrl('__earth/network'), {
        signal: controller.signal,
        credentials: 'same-origin',
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
        throw new Error('Configuration unavailable');
      const config = (await response.json()) as { chinaAvailable?: boolean; region?: unknown };
      if (!this.started || this.controller !== controller || controller.signal.aborted) return;
      this.chinaAvailable = config.chinaAvailable === true;
      if (valid(config.region)) this.deployment = config.region;
      this.configuration = 'ready';
    } catch {
      if (!this.started || this.controller !== controller) return;
      // Relay requests must not assume a browser token is configured on the server.
      this.chinaAvailable = false;
      this.configuration = 'unavailable';
    } finally {
      clearTimeout(timer);
      if (this.started && this.controller === controller) {
        this.controller = undefined;
        this.refresh();
      }
    }
  }

  dispose() {
    this.started = false;
    this.controller?.abort();
    this.controller = undefined;
    this.connection?.removeEventListener('change', this.refresh);
    window.removeEventListener('online', this.restored);
    window.removeEventListener('offline', this.refresh);
  }
}

export const networkProfile = new NetworkProfile();
