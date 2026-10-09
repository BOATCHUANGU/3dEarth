import {
  createIcons,
  Globe,
  ArrowUpRight,
  Plus,
  Minus,
  RotateCcw,
  Layers,
  Sun,
  Play,
  Pause,
  X,
  Search,
  ArrowRight,
  Compass,
  Info,
  Maximize2,
  LocateFixed,
  ChevronDown,
  Move,
} from 'lucide';
import { EarthRenderer, type LayerName, type RendererState } from '../earth/EarthRenderer';
import { locations, formatCoordinate } from './locations';
import { CitySearch, type CityResult } from './CitySearch';
import { nativeLaunchFinished, prefersReducedMotion } from './NativeWindow';
import type { MapMode } from '../layers/TileSources';
import type { TileLayerState } from '../layers/ImageryTileLayer';
import {
  networkProfile,
  type NetworkPreference,
  type NetworkState,
} from '../network/NetworkProfile';

const icon = (name: string, className = '') =>
  `<i data-lucide="${name}" class="${className}" aria-hidden="true"></i>`;
const icons = {
  Globe,
  ArrowUpRight,
  Plus,
  Minus,
  RotateCcw,
  Layers,
  Sun,
  Play,
  Pause,
  X,
  Search,
  ArrowRight,
  Compass,
  Info,
  Maximize2,
  LocateFixed,
  ChevronDown,
  Move,
};
const refreshIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.5 } });

export class App {
  private earth?: EarthRenderer;
  private readonly citySearch = new CitySearch();
  private searchSequence = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private ready = false;
  private disposed = false;
  private loadingTimer?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private state?: RendererState;
  private lastSource = '';
  private unsubscribeNetwork?: () => void;

  constructor(private root: HTMLElement) {
    this.render();
    this.bindEvents();
    this.unsubscribeNetwork = networkProfile.subscribe(() => this.updateNetwork());
    this.updateNetwork();
    void networkProfile.initialize();
    this.updateClock();
    this.timer = setInterval(() => this.updateClock(), 1000);
    void this.initialize();
  }

  private render() {
    this.root.innerHTML = `
      <header class="topbar">
        <button class="brand" id="home" aria-label="EARTH 返回初始视角">${icon('globe')}<span>EARTH<small>THE LIVING PLANET</small></span></button>
        <nav class="main-nav" aria-label="主导航"><span class="nav-active"><span class="live-dot"></span>探索地球</span><button data-about>星球档案 ${icon('arrow-up-right')}</button></nav>
        <button class="search-trigger" id="open-search">${icon('search')}<span>寻找一个地方</span><kbd>/</kbd></button>
      </header>

      <main class="experience">
        <div class="viewport" id="viewport"><div class="map-labels" id="map-labels"></div></div>
        <div class="compass" aria-hidden="true"><span>N</span><div class="compass-needle"></div><small>S</small></div>
        <div class="detail-status" id="detail-status" role="status" aria-live="polite" hidden><span id="tile-status"></span><button id="retry-tiles" hidden>重试</button></div>
        <div class="tile-attribution" id="tile-attribution" hidden></div>

        <aside class="toolbar" aria-label="地球控制">
          <div class="tool-group" role="group" aria-label="视角">
            <button id="zoom-in" aria-label="放大" title="放大">${icon('plus')}</button>
            <button id="zoom-out" aria-label="缩小" title="缩小">${icon('minus')}</button>
            <button id="reset-view" aria-label="重置视角" title="重置视角">${icon('rotate-ccw')}</button>
          </div>
          <div class="tool-group" role="group" aria-label="显示">
            <button id="layers-toggle" aria-label="图层设置" aria-expanded="false" aria-controls="layers-panel" title="图层设置">${icon('layers')}</button>
            <button id="sun-toggle" aria-label="光照与时间" aria-expanded="false" aria-controls="sun-panel" title="光照与时间">${icon('sun')}</button>
            <button id="fullscreen" aria-label="切换全屏" title="切换全屏">${icon('maximize-2')}</button>
          </div>
        </aside>

        <section class="floating-panel" id="layers-panel" aria-label="图层设置" hidden>
          <div class="panel-title"><span>让世界多一点层次</span><button class="icon-button" data-close-panel aria-label="关闭图层设置">${icon('x')}</button></div>
          <p>选择你想看见的地球。</p>
          <div class="map-style-settings">
            <span id="map-style-label">地图样式</span>
            <div class="map-modes" role="group" aria-labelledby="map-style-label"><button data-map-mode="auto" class="active" aria-pressed="true">自动</button><button data-map-mode="satellite" aria-pressed="false">卫星</button><button data-map-mode="streets" aria-pressed="false">街道</button></div>
          </div>
          ${(
            [
              ['clouds', '流动云层', '大气中的轻盈纹理'],
              ['atmosphere', '大气辉光', '地平线上的一抹蓝'],
              ['night', '城市灯火', '入夜后的人间星河'],
              ['markers', '地点标记', '每一次相遇的坐标'],
              ['grid', '经纬网格', '看见地理的秩序'],
            ] as const
          )
            .map(
              ([id, title, sub]) =>
                `<label class="layer-row"><span>${title}<small>${sub}</small></span><input type="checkbox" data-layer="${id}" ${id !== 'grid' ? 'checked' : ''}><span class="switch"></span></label>`,
            )
            .join('')}
          <div class="quality-row"><span>渲染画质</span><strong id="quality">极致 · 2× 超采样</strong></div>
          <p class="quality-note">高清纹理 · 全分辨率瓦片 · 最大各向异性<br>不根据设备性能降低清晰度。</p>
          <div class="network-settings">
            <label for="network-profile">地图网络</label>
            <select id="network-profile" aria-describedby="network-status">
              <option value="auto">自动选择</option><option value="china">中国网络优先</option><option value="global">全球网络</option>
            </select>
            <p id="network-status" role="status"></p>
          </div>
        </section>

        <section class="floating-panel sun-panel" id="sun-panel" aria-label="光照与时间" hidden>
          <div class="panel-title"><span>追随一束光</span><button class="icon-button" data-close-panel aria-label="关闭光照设置">${icon('x')}</button></div>
          <p>轻移时间，穿过日与夜的交界。</p>
          <div class="sun-time"><span id="sun-hour">10:30</span><small>UTC</small>${icon('sun')}</div>
          <input id="time-slider" type="range" min="0" max="23.95" step="0.05" value="10.5" aria-label="模拟 UTC 时刻">
          <div class="range-labels"><span>00:00</span><span>12:00</span><span>24:00</span></div>
          <div class="time-presets"><button data-hour="10.5" class="active">晨昏之间</button><button data-hour="20">漫漫长夜</button><button id="realtime">实时太阳</button></div>
          <div class="panel-note">太阳位置可随当前时间变化；地表、云层与夜光为历史合成影像。</div>
        </section>

        <div class="view-bottom">
          <button class="rotation-button" id="rotation-toggle" aria-label="暂停地球自转" aria-pressed="true">${icon('pause')}</button>
          <div class="altitude-readout"><span>观测高度</span><b id="altitude">12,760</b><small id="altitude-unit">km</small></div>
        </div>

        <div class="loading-overlay" id="loading" role="status"><div class="loading-orbit"><span></span></div><p id="loading-text">正在靠近这颗蓝色星球</p><div class="loading-track"><span id="loading-progress"></span></div><small>LOADING OUR WORLD</small></div>
        <div class="error-overlay" id="error" role="alert" hidden>${icon('globe')}<h2>暂时无法看见地球</h2><p id="error-message"></p><button id="retry">重新载入 ${icon('arrow-right')}</button></div>
      </main>

      <footer class="footer"><button data-about>影像来源与许可 ${icon('info')}</button><time id="utc-clock"></time></footer>

      <dialog id="search-dialog" class="search-dialog"><form method="dialog"><button class="icon-button dialog-close" aria-label="关闭搜索">${icon('x')}</button></form><div class="eyebrow">FIND YOUR PLACE</div><h2>世界，总有一个地方。</h2><div class="search-field">${icon('search')}<input id="search-input" type="search" placeholder="全球城市，或经纬度 31.23, 121.47" autocomplete="off" aria-label="搜索城市或经纬度"></div><div id="search-results" class="search-results"></div><p class="search-note">搜索全球常见城市，支持中文、英文及已收录别名，也可输入纬度、经度。</p></dialog>
      <dialog id="about-dialog" class="about-dialog"><form method="dialog"><button class="icon-button dialog-close" aria-label="关闭星球档案">${icon('x')}</button></form><div class="eyebrow">OUR ONLY HOME</div><h2>宇宙很大。<br><span>家，只有一个。</span></h2><p class="about-intro">距太阳约 1.5 亿公里的地方，一颗蓝色星球承载着我们所知的所有生命。换一个角度，再看一次地球。</p><div class="planet-facts"><div><strong>4.54<small>十亿年</small></strong><span>地球的年龄</span></div><div><strong>71<small>%</small></strong><span>被海洋覆盖</span></div><div><strong>6,378<small>km</small></strong><span>赤道半径</span></div></div><h3>关于这次观测</h3><p>通过右上角搜索或 / 快捷键查找全球城市，也可输入经纬度。空搜索保留五个精选城市；选择城市后飞到区域视角，可继续放大到街区。拖动旋转，滚轮、双指或右侧按钮连续缩放；右侧可重置视角，在图层设置中选择地图样式、云层、灯光与经纬网，在光照设置中查看 UTC 时刻并观察昼夜的变换。</p><p>现在可以从太空连续放大到城市与街区。自动模式按地区选择卫星、航拍或街道地图；近地视角使用清晰光照，并移开云层。影像不是实时拍摄，建筑显示为影像或地图轮廓，不是三维模型。</p><div class="attribution"><span>影像与归属</span><p>Day map: <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/" target="_blank" rel="noreferrer">NASA Earth Observatory Blue Marble: Next Generation, January 2004 ${icon('arrow-up-right')}</a> (resized; credit NASA Earth Observatory). Night, cloud and ocean maps: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope / INOVE ${icon('arrow-up-right')}</a>, CC BY 4.0. Online imagery: EOxCloudless 2025 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025), CC BY-NC-SA 4.0 for personal/noncommercial use; Japan: GSI; USA: USGS/USDA NAIP public domain; street maps: © OpenStreetMap contributors. Each active source is credited on the map. City search: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>; filtered populated-place index, snapshot 2026-10-04. See ASSETS.md and docs/IMAGERY.md for details.</p></div><div class="about-signature">MADE FOR A DIFFERENT PERSPECTIVE <span>EARTH © 2026</span></div></dialog>
      <div id="toast" class="toast" role="status" hidden></div>
    `;
    refreshIcons();
  }

  private $(selector: string) {
    return this.root.querySelector<HTMLElement>(selector)!;
  }

  private async initialize() {
    this.setCameraReady(false);
    // Let the lightweight shell commit before native splash exit; shader compilation
    // and local texture decoding must not delay the first usable Android frame.
    await nativeLaunchFinished;
    if (this.disposed) return;
    try {
      this.earth = new EarthRenderer(this.$('#viewport'), this.$('#map-labels'), {
        onProgress: (progress) => {
          this.$('#loading-progress').style.width = `${progress * 100}%`;
        },
        onWarning: (message) => this.toast(message),
        onError: (message) => this.showError(message),
        onSelect: (id) => this.selectLocation(id),
        onState: (state) => this.updateState(state),
      });
      await this.earth.initialize();
      await nativeLaunchFinished;
      if (this.disposed) return;
      this.$('#loading').classList.add('loaded');
      if (prefersReducedMotion()) this.$('#loading').hidden = true;
      this.loadingTimer = setTimeout(() => {
        this.$('#loading').hidden = true;
      }, 250);
      const earth = this.earth;
      window.earth = {
        focusOn: (lat, lon, altitude = 12_000_000) => this.focusCoordinates(lat, lon, altitude),
        setLayer: (name, value) => {
          earth.setLayer(name, value);
          const input = this.root.querySelector<HTMLInputElement>(`[data-layer="${name}"]`);
          if (input) input.checked = value;
        },
        setMapMode: (mode) => this.setMapMode(mode),
        setNetworkProfile: (preference) => networkProfile.setPreference(preference),
        retryTiles: () => earth.retryTiles(),
        getState: () => ({
          ...earth.controls.centerCoordinates,
          autoRotate: earth.controls.autoRotate,
          layers: { ...earth.layers },
          ready: this.ready,
          fps: this.state?.fps ?? 0,
          tiles: earth.tileState,
          pixelRatio: earth.renderer.getPixelRatio(),
          isFlying: earth.controls.isFlying,
          network: networkProfile.getState(),
        }),
      };
      earth.playEntrance(() => {
        if (this.disposed) return;
        this.setCameraReady(true);
        this.root.classList.add('is-ready');
        this.updateRotation();
      });
    } catch (error) {
      if (this.disposed) return;
      this.earth?.dispose();
      this.earth = undefined;
      this.showError(
        error instanceof Error && !error.message.includes('WebGL')
          ? error.message
          : '浏览器暂不支持 WebGL 2 图形渲染，请启用硬件加速或使用新版 Chrome、Edge、Firefox 或 Safari。',
      );
    }
  }

  private setCameraReady(ready: boolean) {
    this.ready = ready;
    this.$('#viewport').setAttribute('aria-busy', String(!ready));
    this.root
      .querySelectorAll<HTMLButtonElement>('#zoom-in, #zoom-out, #reset-view, #rotation-toggle')
      .forEach((button) => {
        button.disabled = !ready;
      });
  }

  private bindEvents() {
    this.$('#network-profile').addEventListener('change', (event) =>
      networkProfile.setPreference((event.target as HTMLSelectElement).value as NetworkPreference),
    );
    this.$('#home').addEventListener('click', () => this.reset());
    this.$('#reset-view').addEventListener('click', () => this.reset());
    this.$('#zoom-in').addEventListener('click', () => this.earth?.controls.zoom(0.83));
    this.$('#zoom-out').addEventListener('click', () => this.earth?.controls.zoom(1.2));
    this.$('#rotation-toggle').addEventListener('click', () => {
      if (!this.earth) return;
      this.earth.controls.setAutoRotate(!this.earth.controls.autoRotate);
      this.updateRotation();
    });
    for (const id of ['layers', 'sun'])
      this.$(`#${id}-toggle`).addEventListener('click', () => {
        const opened = !this.$(`#${id}-panel`).hidden;
        this.closePanels();
        if (!opened) {
          this.$(`#${id}-panel`).hidden = false;
          this.$(`#${id}-toggle`).setAttribute('aria-expanded', 'true');
        }
      });
    this.root
      .querySelectorAll('[data-close-panel]')
      .forEach((button) => button.addEventListener('click', () => this.closePanels()));
    this.root
      .querySelectorAll<HTMLInputElement>('[data-layer]')
      .forEach((input) =>
        input.addEventListener('change', () =>
          this.earth?.setLayer(input.dataset.layer as LayerName, input.checked),
        ),
      );
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-map-mode]')
      .forEach((button) =>
        button.addEventListener('click', () => this.setMapMode(button.dataset.mapMode as MapMode)),
      );
    this.$('#retry-tiles').addEventListener('click', () => this.earth?.retryTiles());
    this.$('#time-slider').addEventListener('input', (event) =>
      this.setHour(Number((event.target as HTMLInputElement).value)),
    );
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-hour]')
      .forEach((button) =>
        button.addEventListener('click', () => this.setHour(Number(button.dataset.hour))),
      );
    this.$('#realtime').addEventListener('click', () => {
      this.earth?.sun.setRealtime();
      this.updateSun();
    });
    this.$('#fullscreen').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen)
          await document.documentElement.requestFullscreen();
        else this.toast('当前浏览器不支持全屏，仍可正常浏览地球。');
      } catch {
        this.toast('未能进入全屏，请检查浏览器是否允许。');
      }
    });
    this.root
      .querySelectorAll('[data-about]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          (this.$('#about-dialog') as HTMLDialogElement).showModal(),
        ),
      );
    this.$('#open-search').addEventListener('click', () => this.openSearch());
    this.$('#search-dialog').addEventListener('close', () => {
      ++this.searchSequence;
      clearTimeout(this.searchTimer);
    });
    this.$('#search-input').addEventListener('input', () => {
      ++this.searchSequence;
      clearTimeout(this.searchTimer);
      this.$('#search-results').replaceChildren();
      this.searchTimer = setTimeout(() => void this.search(), 140);
    });
    this.$('#search-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        // Closing a dialog returns focus to its opener. Suppress the native Enter
        // activation so the restored search button cannot reopen the dialog.
        event.preventDefault();
        this.$('#search-results').querySelector<HTMLButtonElement>('button')?.click();
      }
    });
    this.$('#retry').addEventListener('click', () => window.location.reload());
    this.root.querySelectorAll('dialog').forEach((dialog) =>
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dialog.close();
      }),
    );
    document.addEventListener('keydown', this.onKey);
    this.$('#viewport').addEventListener('pointerdown', () => this.closePanels());
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
      return;
    if (event.key === '/' && !this.root.querySelector('dialog[open]')) {
      event.preventDefault();
      this.openSearch();
    }
    if (event.key === 'Escape') this.closePanels();
    if (event.target instanceof HTMLCanvasElement && this.earth) {
      const center = this.earth.controls.centerCoordinates;
      const shifts: Record<string, [number, number]> = {
        ArrowLeft: [0, -10],
        ArrowRight: [0, 10],
        ArrowUp: [8, 0],
        ArrowDown: [-8, 0],
      };
      if (shifts[event.key]) {
        event.preventDefault();
        const [lat, lon] = shifts[event.key];
        const scale = Math.min(1, center.altitude / 5_000_000);
        this.earth.controls.focusOn(
          center.latitude + lat * scale,
          center.longitude + lon * scale,
          center.altitude,
          0.4,
        );
      }
      if (event.key === '+' || event.key === '=') this.earth.controls.zoom(0.83);
      if (event.key === '-') this.earth.controls.zoom(1.2);
    }
  };

  private selectLocation(id: string) {
    const location = locations.find((location) => location.id === id);
    if (!location || !this.ready) return;
    this.earth?.selectLocation(id);
    this.earth?.controls.focusOn(location.latitude, location.longitude, 250_000, 2.6);
    this.closePanels();
  }

  private focusCoordinates(latitude: number, longitude: number, altitude: number) {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(altitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      throw new RangeError('纬度须在 -90 至 90，经度须在 -180 至 180 之间。');
    if (!this.ready) return;
    this.earth?.selectLocation('custom');
    this.earth?.controls.focusOn(latitude, longitude, altitude);
  }

  private reset() {
    if (!this.ready) return;
    this.earth?.selectLocation(locations[0].id);
    this.earth?.controls.reset();
    this.closePanels();
  }

  private updateRotation() {
    const rotating = this.earth?.controls.autoRotate ?? false;
    const button = this.$('#rotation-toggle');
    button.setAttribute('aria-pressed', String(rotating));
    button.setAttribute('aria-label', rotating ? '暂停地球自转' : '继续地球自转');
    button.innerHTML = icon(rotating ? 'pause' : 'play');
    refreshIcons();
  }

  private updateState(state: RendererState) {
    this.state = state;
    const near = state.altitude < 750_000;
    this.$('.experience').classList.toggle('is-near', near);
    this.$('#altitude').textContent = (
      state.altitude < 1000
        ? Math.round(state.altitude)
        : Number((state.altitude / 1000).toFixed(state.altitude < 100_000 ? 1 : 0))
    ).toLocaleString('en-US');
    this.$('#altitude-unit').textContent = state.altitude < 1000 ? 'm' : 'km';
    this.$('#quality').textContent = `极致 · ${state.pixelRatio}× 超采样`;
    const rotation = this.$('#rotation-toggle');
    if (rotation.getAttribute('aria-pressed') !== String(state.autoRotate)) this.updateRotation();
    rotation.setAttribute(
      'aria-label',
      state.autoRotate
        ? state.altitude < 80_000
          ? '关闭自动自转（近地已暂缓）'
          : '暂停地球自转'
        : '继续地球自转',
    );
    const tiles = state.tiles;
    // Failed parent tiles need no action once the visible target tiles are ready.
    const mapFailed = !!tiles?.active && tiles.failed > 0 && tiles.loaded < tiles.total;
    const labelsFailed = !!tiles?.active && tiles.labelsFailed > 0;
    const needsRetry = !!tiles?.network.online && (mapFailed || labelsFailed);
    this.$('#detail-status').hidden = !needsRetry;
    this.$('#retry-tiles').hidden = !needsRetry;
    const message = needsRetry ? (mapFailed ? '部分地图未能加载' : '部分地名未能加载') : '';
    if (this.$('#tile-status').textContent !== message) {
      this.$('#tile-status').textContent = message;
    }
    this.$('#tile-attribution').hidden = !tiles?.active;
    if (tiles?.active) {
      const creditKey = tiles.credits.map((credit) => credit.id).join('|');
      if (this.lastSource !== creditKey) {
        this.lastSource = creditKey;
        this.$('#tile-attribution').innerHTML = '';
        for (const credit of tiles.credits) {
          const line = document.createElement('span');
          if (credit.id === 'eox-sentinel-2025') {
            line.innerHTML =
              '<a href="https://cloudless.eox.at" target="_blank" rel="noreferrer">EOxCloudless</a> by <a href="https://eox.at" target="_blank" rel="noreferrer">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2025) · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>';
          } else {
            const anchor = document.createElement('a');
            anchor.href = credit.url;
            anchor.target = '_blank';
            anchor.rel = 'noreferrer';
            anchor.textContent = credit.label;
            line.append(anchor);
          }
          this.$('#tile-attribution').append(line);
        }
      }
    }
  }

  private updateNetwork() {
    if (this.disposed) return;
    const state = networkProfile.getState();
    (this.$('#network-profile') as HTMLSelectElement).value = state.preference;
    const description =
      state.configuration === 'loading'
        ? '正在读取可用线路'
        : state.region === 'china' && !state.chinaAvailable
          ? '国内数据源尚未配置，暂用全球来源'
          : state.region === 'china'
            ? '国内数据源优先'
            : '全球数据源';
    this.$('#network-status').textContent = !state.mapsConfigured
      ? '在线地图服务尚未配置，可浏览全球地球与搜索城市。'
      : !state.online
        ? '网络已离线，保留当前地图。联网后自动恢复。'
        : `${description} · ${state.reason}。始终保留完整地图清晰度。`;
  }

  private setMapMode(mode: MapMode) {
    if (!['auto', 'satellite', 'streets'].includes(mode)) throw new RangeError('Unknown map mode');
    this.earth?.setMapMode(mode);
    this.root.querySelectorAll<HTMLButtonElement>('[data-map-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mapMode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.mapMode === mode));
    });
  }

  private updateClock() {
    this.$('#utc-clock').textContent =
      `${new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' }).replaceAll('-', '.')}  ${new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC`;
    if (this.earth?.sun.realtime) this.updateSun();
  }

  private setHour(hour: number) {
    this.earth?.sun.setHour(hour);
    this.updateSun();
  }

  private updateSun() {
    if (!this.earth) return;
    const date = this.earth.sun.simulatedDate;
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    const formatted = date.toLocaleTimeString('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
    });
    this.$('#sun-hour').textContent = formatted;
    (this.$('#time-slider') as HTMLInputElement).value = String(hour);
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-hour]')
      .forEach((button) =>
        button.classList.toggle(
          'active',
          !this.earth!.sun.realtime && Math.abs(Number(button.dataset.hour) - hour) < 0.02,
        ),
      );
    this.$('#realtime').classList.toggle('active', this.earth.sun.realtime);
  }

  private closePanels() {
    for (const id of ['layers', 'sun']) {
      this.$(`#${id}-panel`).hidden = true;
      this.$(`#${id}-toggle`).setAttribute('aria-expanded', 'false');
    }
  }

  private openSearch() {
    (this.$('#search-dialog') as HTMLDialogElement).showModal();
    (this.$('#search-input') as HTMLInputElement).value = '';
    void this.search();
    this.$('#search-input').focus();
  }

  private async search() {
    clearTimeout(this.searchTimer);
    const sequence = ++this.searchSequence;
    const query = (this.$('#search-input') as HTMLInputElement).value.trim().toLowerCase();
    const results = this.$('#search-results');
    results.replaceChildren();
    const coordinateMatch = query.match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (coordinateMatch) {
      const [, lat, lon] = coordinateMatch.map(Number);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        const button = document.createElement('button');
        button.innerHTML = `${icon('locate-fixed')}<span>飞往这个坐标<small>${formatCoordinate(lat)} / ${formatCoordinate(lon, false)}</small></span>${icon('arrow-up-right')}`;
        button.onclick = () => {
          if (!this.ready) return;
          this.focusCoordinates(lat, lon, 12_000_000);
          (this.$('#search-dialog') as HTMLDialogElement).close();
        };
        results.append(button);
      } else results.textContent = '纬度范围 −90° 至 90°，经度范围 −180° 至 180°。';
    } else {
      const matches = locations.filter((location) =>
        `${location.name} ${location.english} ${location.country}`.toLowerCase().includes(query),
      );
      const showSuggestions = () => {
        for (const location of matches) {
          this.appendCityResult(location.name, `${location.english} · ${location.country}`, () =>
            this.selectLocation(location.id),
          );
        }
      };
      if (!query) showSuggestions();
      else {
        showSuggestions();
        const status = document.createElement('p');
        status.className = 'search-message';
        status.setAttribute('role', 'status');
        status.textContent = '正在读取城市索引…';
        results.append(status);
        refreshIcons();
        try {
          const cities = await this.citySearch.search(query);
          if (this.disposed || sequence !== this.searchSequence) return;
          results.replaceChildren();
          for (const city of cities) {
            const label =
              city.matchedName === city.name ? city.name : `${city.matchedName} · ${city.name}`;
            this.appendCityResult(
              label,
              `${city.admin} · ${city.country} (${city.countryCode})`,
              () => this.selectCity(city),
            );
          }
          if (!cities.length) {
            showSuggestions();
            if (!matches.length)
              results.textContent = '没有找到已收录的城市。试试其他名称，或输入纬度、经度。';
          }
        } catch {
          if (this.disposed || sequence !== this.searchSequence) return;
          status.textContent = '城市索引暂时无法读取。仍可选择精选城市或输入经纬度。';
          const retry = document.createElement('button');
          retry.textContent = '重新读取城市索引';
          retry.onclick = () => void this.search();
          results.append(retry);
        }
      }
    }
    refreshIcons();
  }

  private appendCityResult(name: string, detail: string, select: () => void) {
    const button = document.createElement('button');
    button.innerHTML = `${icon('compass')}<span></span>${icon('arrow-up-right')}`;
    const label = button.querySelector('span')!;
    label.textContent = name;
    const description = document.createElement('small');
    description.textContent = detail;
    label.append(description);
    button.onclick = () => {
      if (!this.ready) return;
      select();
      (this.$('#search-dialog') as HTMLDialogElement).close();
    };
    this.$('#search-results').append(button);
  }

  private selectCity(city: CityResult) {
    if (!this.ready) return;
    this.earth?.selectLocation(`geonames-${city.id}`);
    this.earth?.controls.focusOn(city.latitude, city.longitude, 250_000, 2.6);
    this.closePanels();
  }

  private toast(message: string) {
    if (this.disposed) return;
    clearTimeout(this.toastTimer);
    this.$('#toast').textContent = message;
    this.$('#toast').hidden = false;
    this.toastTimer = setTimeout(() => {
      this.$('#toast').hidden = true;
    }, 6500);
  }

  private showError(message: string) {
    if (this.disposed) return;
    this.setCameraReady(false);
    this.$('#loading').hidden = true;
    this.$('#error').hidden = false;
    this.$('#error-message').textContent = message;
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    clearTimeout(this.loadingTimer);
    clearTimeout(this.toastTimer);
    clearTimeout(this.searchTimer);
    this.citySearch.dispose();
    document.removeEventListener('keydown', this.onKey);
    this.earth?.dispose();
    this.unsubscribeNetwork?.();
    networkProfile.dispose();
    delete window.earth;
  }
}

declare global {
  interface Window {
    earth?: {
      focusOn(latitude: number, longitude: number, altitude?: number): void;
      setLayer(name: LayerName, value: boolean): void;
      setMapMode(mode: MapMode): void;
      setNetworkProfile(preference: NetworkPreference): void;
      retryTiles(): void;
      getState(): {
        latitude: number;
        longitude: number;
        altitude: number;
        autoRotate: boolean;
        layers: Record<LayerName, boolean>;
        ready: boolean;
        fps: number;
        tiles?: TileLayerState;
        pixelRatio: number;
        isFlying: boolean;
        network: NetworkState;
      };
    };
  }
}
