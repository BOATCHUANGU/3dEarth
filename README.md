# EARTH · 3D 地球

一个可以从太空连续放大到城市街区、跨越昼夜并飞向真实坐标的 3D 地球。全球视角提供独立云层、城市夜光、海洋高光、大气边缘和星空；近地视角按屏幕分辨率加载在线影像和街道瓦片。

第二步已完成：接入真实在线瓦片、物理像素 LOD、最高 12K 全球底图与最低 150 m 城市缩放；始终按清晰度优先渲染。

2026-10-14 搜索选中的城市名或坐标已改为 WGS84 锚定的地表曲面文字，使用本地 Cinzel Medium 与思源宋体 SC Medium，并按实际飞行到达尺寸适配缩放渐隐。160 项单元测试、Web 构建及桌面、手机和减少动态检查通过；Android 资源已同步。当前 Luna 收尾正在构建可供试装的 debug APK；没有 Android 设备验收。参数、实现和验证边界见[最新交付记录](./docs/SEARCH_LABEL_CINZEL_PLAN.md)，较早 DOM 标注记录见[历史计划](./docs/SEARCH_LABEL_IMPLEMENTATION.md)。

2026-10-04 已实施三阶段界面减法：地图样式移入图层设置，移除尺度快捷栏、操作提示、正常加载状态、左侧宣传/地点详情、地球顶部文案和首页目的地栏；自转控制改为无文字图标按钮，精选城市移入搜索建议。地球视口和启动遮罩覆盖主区域，右侧按视角与显示分组控制。全球城市检索及 UI 待验证项见 [第三阶段计划](./docs/UI_SIMPLIFICATION_PLAN_3.md) 和 [Sol 验收清单](./docs/UI_SIMPLIFICATION_3_SOL_TESTS.md)。本轮未运行构建、测试或浏览器验收。

2026-10-01 新增中国网络优化：自动/手动线路配置、天地图街道与卫星适配、渐进路名、超时回退和请求合并。本轮已完成本地受控验证，结果见 [中国网络验证记录](./artifacts/china-network/RESULTS.md)；真实凭据、运营商网络与发布授权仍待核验。下文 2026-09-27 验收记录属于旧版本。

现已增加 Capacitor 8 Android 工程与 APK 构建流程；APK 为 debug 签名时仅供试装，不等于商店发布。手机 App 构建、签名、服务配置和设备验收边界见 [docs/APP_RELEASE_PLAN.md](./docs/APP_RELEASE_PLAN.md)。当前架构和对话协作状态见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) 与 [docs/COORDINATION.md](./docs/COORDINATION.md)；Git/GitHub 状态见 [docs/GIT_VERSIONING_PLAN.md](./docs/GIT_VERSIONING_PLAN.md)。

使用 TypeScript、Vite 7、Three.js 和自定义 GLSL 材质在浏览器中渲染；默认通过同源 Node 服务转发在线瓦片。默认来源无需账号或 API 密钥；全球地球贴图随项目打包，高清瓦片运行时需要网络。EOX 2025 影像用于个人及非商业用途；各来源许可与实测清晰度见 [在线影像说明](./docs/IMAGERY.md)。

## 本地运行

建议 Node.js 24；Vite 7 要求 `^20.19.0 || >=22.12.0`。浏览器需要 WebGL 2 与硬件加速。

```sh
npm ci
npm run dev
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)，实际端口以终端输出为准。首次安装依赖及浏览在线瓦片需要网络；本地全球底图不依赖外部图片服务。

```sh
npm run build
npm run preview
```

`build` 先检查 TypeScript，再生成 `dist/`。构建预览默认是 [http://127.0.0.1:4173](http://127.0.0.1:4173)。开发与预览服务均包含 `/__tiles/{source}/{z}/{x}/{y}` 同源瓦片转发，浏览器无需逐个直连外部图像站点。

## 部署

默认部署使用项目自带的 Node 服务，同时提供 `dist/` 静态文件与瓦片转发：

```sh
npm run build
npm run serve
```

服务入口是 `server/serve.mjs`，默认地址为 [http://127.0.0.1:4173](http://127.0.0.1:4173)。通过环境变量 `HOST` 和 `PORT` 更改监听地址；部署到容器或云主机时按平台要求设置监听地址与端口。部署需保留完整 `dist/`（包括 `textures/`）、`server/` 和项目运行配置，并通过 HTTPS 提供公网服务。

转发服务只接受内置数据源和合法 XYZ 坐标，不接收任意外部 URL。它使用应用标识和实际页面 Referer，遵守上游 HTTP 缓存、过期与条件请求规则；拒绝带有 `x-blocked` 标记的拒绝访问图片，使界面显示加载失败而不是把错误图片铺到地图上。公开部署建议用 `TILE_USER_AGENT` 配置真实应用名称、网站或联系地址。转发不会增加数据源细节，也不提供批量抓取或离线导出。

若托管环境只能提供静态文件，可在构建前于 `.env.local` 设置 `VITE_DIRECT_TILES=true`，再构建并部署完整 `dist/`。该模式由浏览器直接访问数据源，依赖使用者网络及各来源 CORS；仅上传默认构建的 `dist/` 无法提供同源瓦片接口。本地全球底图在两种方式中均可用。

## 手机 App 发布

2026-10-10 已统一选定的第一版白灰地球 Logo：Web 左上角与加载区、Android 原生启动图及 WebView 共用同一原图。Web 四组实际浏览器检查通过，Android 已同步并重新生成 debug APK，**本轮未进行 Android 端检验**。最新产物校验值、截图及范围见 [Logo 实施记录](./docs/EARTH_LOGO_ROLLOUT_PLAN.md)；此前设备结果仅代表旧版本。

2026-10-09 已完成 API 36 目标下的深色原生地球启动页、首帧衔接、系统安全区与窗口自适应，并生成 debug APK。APK 是本机生成且被 Git 忽略的文件，当前路径为 `android/app/build/outputs/apk/debug/app-debug.apk`；按下方命令可重新构建。130 项单测、9 组浏览器布局检查及 API 37 手机模拟器交互检查通过；API 36 真机、实体平板/折叠屏仍待实测。构建校验值、实际范围和待验步骤见 [Android 适配交付记录](./docs/ANDROID16_VALIDATION.md)。

已接入 Capacitor 8.5.2，Android 工程位于 `android/`。在安装 JDK 21、Android SDK 36 的 Windows 上运行：

```powershell
npm ci
npm run android:apk
```

命令会重建前端、同步资源并构建 debug APK，成功后位于 `android/app/build/outputs/apk/debug/app-debug.apk`。`npm run android:open` 可同步后打开 Android Studio；`npm run android:run` 可连接真机运行。生成 APK 不需要模拟器，也不依赖局域网网页服务。

临时包名为 `com.example.earthobservatory`、名称为 `Earth Observatory`。全球纹理和城市索引随包；在线地图须在 `.env.android.local` 配置正式 `VITE_API_BASE_URL`（HTTPS），Node API 服务配置 `EARTH_ALLOWED_ORIGINS=https://localhost`。未配置时 App 仅使用本地资源，不会假装在 App 内运行 Node 服务。本轮未部署地图公网接口。环境路径、release 签名流程、测试分工和已知限制见 [App 发布计划](./docs/APP_RELEASE_PLAN.md)。

## 探索方式

| 操作 | 效果 |
|---|---|
| 鼠标或单指拖动 | 移动视角，带平滑惯性 |
| 滚轮、双指缩放或右侧 `＋` / `−` | 按离地高度连续缩放，最低 150 m |
| 搜索空查询建议 | 飞往上海、东京、纽约、巴黎或悉尼的区域视角 |
| 图层设置 → 地图样式 | 选择自动 / 卫星 / 街道：按地区与高度选源、保留摄影图层，或始终显示街道图 |
| 搜索或 `/` | 搜索全球常见城市的中文、英文或已收录别名，或输入 `31.23, 121.47` |
| 居中暂停/播放图标 | 暂停或继续自转；近地时暂缓旋转以便观察 |
| 重置按钮或左上角地球 Logo | 返回初始视角 |
| 图层面板 | 切换云层、大气、灯火与经纬网，查看极致画质 |
| 太阳面板 | 调整模拟 UTC 时刻，或启用实时太阳位置 |
| 全屏按钮 | 在浏览器支持时切换全屏 |

首页精选目的地栏已移除，五个精选城市保留在搜索空查询建议中。城市搜索结果显示行政区与国家，选中后飞到约 **250 km** 区域视角，可继续缩放到街区；飞行后段开始显露以 WGS84 坐标固定在地表的单条曲面名称，抵达后停留约 3 秒再淡出。文字随镜头放大渐隐，地表明暗变化时切换墨色；无常驻地点标记。缩放文字参数和限制见[最新搜索文字交付记录](./docs/SEARCH_LABEL_CINZEL_PLAN.md)。开启系统“减少动态效果”会暂停默认自转与云层漂移并省略飞行动画，名称抵达后静态显示约 3 秒。光照时刻在太阳面板查看和调整。画布获得焦点后，方向键移动、`＋` / `−` 缩放。界面适配窄屏。

坐标输入固定为**纬度、经度**，范围分别为 `−90…90` 和 `−180…180`。自由坐标可飞往任意合法位置，不会新增永久标记；选中坐标后会显示临时坐标名称。未内置在线地名搜索。

全球城市搜索采用随应用分发的 GeoNames 离线索引，2026-10-04 快照包含 **31,729** 个居民点、244 个国家/地区代码。主要覆盖人口至少 15,000 的居民点及数据中的国家/一级行政中心，保留可用别名；并非完整城镇、地址或 POI 数据库，中文及历史别名覆盖以源数据为准。名称精确匹配优先，其次前缀/包含匹配，同级按人口排序，最多显示 12 项；可追加行政区或国家缩小范围。

首次输入城市名时才启动 Worker 并从本应用读取索引；gzip 为 **3,473,691 字节（3.31 MiB）**，不支持解压或压缩资源不可用时回退到 **7,952,531 字节（7.58 MiB）** JSON，不进入主 JS 包。运行时不请求境外地名 API、地图瓦片或高德服务。已有本地服务/资源可用时，断开外网仍能检索；本功能不新增 Service Worker，不能保证未缓存的远程站点首次离线打开。索引失败时保留五城建议与坐标输入，并提供重试。

数据规则、来源和署名见 [ASSETS.md](./ASSETS.md)，生成记录见 [public/search/metadata.json](./public/search/metadata.json)。本阶段未运行构建或测试，后续任务见 [UI 第三阶段验证清单](./docs/UI_SIMPLIFICATION_3_SOL_TESTS.md)。

## 城市细节与数据源

相机可连续缩放至最低 **150 米**，通过滚轮、双指或工具栏 +/- 操作。靠近地面时云层、辉光和 Bloom 逐渐淡出，地表进入清晰照明，便于辨认道路与摄影细节。正常加载不显示状态条；在线且部分地图或地名加载失败时，显示简短提示与重试按钮。活动影像署名始终保留。

| 模式 | 无密钥时的行为 |
|---|---|
| 自动 | 全球与区域使用 EOX Sentinel-2；日本主要区域低于 25 km 使用 GSI 航空影像，美国本土低于 40 km 使用 USGS NAIP；其他地区低于 25 km 使用 OSM 街道图 |
| 卫星 | 使用 Sentinel-2 及上述区域航空影像，不自动切为街道图 |
| 街道 | 使用 OSM 道路、地名与建筑轮廓 |

Sentinel-2 源为 10 米、最高 z14；GSI 最高 z18；USGS 动态正射影像请求最高 z19，实际源约 0.15–1 米且覆盖不均；OSM 最高 z19。**上海默认缩放到城市尺度后显示街道地图，不是亚米级卫星摄影**。东京和美国覆盖区可浏览真实街区摄影；年份和清晰度随地点不同。达到原生数据上限后仍能靠近观察，但不会产生新的细节。

中国网络优化默认无需改动现有全球源。要启用国内街道与卫星，在 `.env.local` 配置自己的 `TIANDITU_TOKEN`（适用于服务端 WMTS 调用），重启 dev/preview/serve。通过图层设置 → 地图网络选择“中国网络优先”，或设置 `EARTH_NETWORK_REGION=china`。自动模式采用部署偏好或时区/语言提示，并允许手动覆盖，不做 IP/精确位置查询。未配置密钥时仍使用原全球来源，界面明确说明。

中国优先下，街道及 25 km 以下自动视图采用天地图街道和中文注记，卫星及区域视图采用天地图影像；原始数据级别与覆盖仍限制可见细节。纯静态直连需另配可公开的浏览器端 `VITE_TIANDITU_TOKEN`、`VITE_NETWORK_REGION` 并重新构建。配置与边界见 [中国网络地图加载计划](./docs/CHINA_NETWORK_PLAN.md)；真实提速尚待 Sol 验证，不能视为已在中国多运营商网络通过验收。

地表几何仍为 WGS84 椭球，未包含三维建筑、起伏地形或街景。断网或请求失败时保留可用父级与本地全球底图，联网后自动恢复；在线加载失败时可点击提示中的重试按钮。在线瓦片不打包到项目中，也不提供离线下载。

如已有适用 ArcGIS 授权，可在项目根目录 `.env.local` 设置 `VITE_ARCGIS_API_KEY`，重启开发服务或重新构建。自动及卫星模式会使用 World Imagery（最高 z19），街道模式仍为 OSM。Vite 变量会进入浏览器构建，只能使用允许客户端公开、已配置来源和权限限制的 token，不能放服务端秘密。各来源 URL、署名与缓存要求见 [docs/IMAGERY.md](./docs/IMAGERY.md)。

## 光照与画质

初始为**当日 10:30 UTC 模拟光照**，可由滑块及预设改变；“实时太阳”按当前时间更新近似太阳方向。页脚时钟始终为真实 UTC，与模拟时刻独立。地表、夜景、云层及在线摄影都是历史采集或合成资料，云层漂移是视觉模拟，不是实时天气或卫星直播。

第二步固定以清晰度优先，不根据屏幕宽度、设备内存、CPU 数量或 FPS 降低画质，也不提供流畅档位。

- 日间地表选择 GPU 能加载的最高现有素材：12K → 8K → 4K → 2K；夜景最高 8K，云层与海洋遮罩最高 4K。12K 不再受设备内存门槛限制。
- 渲染像素比为 `max(2, devicePixelRatio)`；纹理使用 GPU 最大各向异性过滤，MSAA 使用 GPU 报告的最大采样数。
- LOD 依据实际绘图缓冲的像素高度、视场角、纬度和相机高度选细节，只受数据源层级约束，不因掉帧降低清晰度。
- 支持时使用半浮点 HDR，太空视角采用 ACES 色调映射；在 1,000–150 km 间平滑过渡，150 km 以下保留地图与摄影的原始色彩，避免近地画面泛灰。无浮点颜色附件时使用普通颜色缓冲。高分辨率本地文件加载失败仍有素材回退，它与主动降低画质不同。

压缩文件体积不同于 GPU 解码占用；采用高画质并不承诺固定帧率。页面隐藏时暂停渲染，恢复后继续；窗口变化调整画布，销毁或热更新时释放资源。

白天地表继续使用 NASA Earth Observatory **Blue Marble: Next Generation**；夜景、云层、海洋遮罩来自 Solar System Scope / INOVE，星空由代码生成。本地素材作者、下载地址、修改记录、色彩空间与校验值见 [ASSETS.md](./ASSETS.md)。

## 坐标与调用接口

WGS84 经纬度使用度，`altitude` 为椭球高，单位米。统一转换位于 `src/geo/CoordinateSystem.ts`：

```text
WGS84.a = 6,378,137 米
WGS84.f = 1 / 298.257223563
world = (ECEF.x, ECEF.z, -ECEF.y) / WGS84.a
```

北极朝 `+Y`，本初子午线与赤道交点朝 `+X`，东经 90° 与赤道交点朝 `−Z`；一个世界单位是一个赤道半径。`LocalFrame` 提供 ENU 转换；在线瓦片采用中心附近的局部顶点及双精度物体平移，减小城市尺度抖动。

页面准备完成后可调用：

```js
// 第三个参数是相机的 WGS84 椭球高，单位米。
window.earth.focusOn(35.6762, 139.6503, 600);
window.earth.setMapMode('satellite'); // 'auto' | 'satellite' | 'streets'
window.earth.setLayer('grid', true);
window.earth.setLayer('clouds', false);
window.earth.retryTiles();
window.earth.getState();
```

`focusOn` 默认高度为 12,000,000 m，范围为 150 m 至 `4.5 × WGS84.a`（约 28,701.6 km）。高度表示相机位置，不是地面目标高程；超范围请求会钳制。`setLayer` 支持 `clouds`、`atmosphere`、`night`、`grid`。`getState()` 包括相机坐标、高度、自转、图层、`ready`、近似 FPS、`pixelRatio`、`isFlying` 及 `tiles` 加载状态。

## 验证

```sh
npm test
npm run test:relay
npm run build
```

单元测试覆盖坐标往返、日期变更线、Web Mercator 地址与 UV、物理像素 LOD、椭球视野、瓦片局部几何及 150 m 相机行为；转发测试覆盖 HTTP 缓存、条件请求和失败处理。浏览器检查在本机 Edge 运行，先保持开发服务启动，再执行：

```sh
npm run test:browser
npm run check:visual
```

`test:browser` 可通过 `EARTH_TEST_URL` 指定站点，默认使用 5173；`check:visual` 使用 5173。结果与截图写入 `artifacts/`；`npm run format` 格式化源码和脚本。移动端验证为浏览器视口与触控模拟，不代表全部实体设备验证。

2026-09-27 验收：**111 项单元测试、9 项瓦片转发测试及 23 项 Edge 浏览器检查全部通过，类型检查与生产构建通过**。浏览器检查在 `npm run serve` 的 4173 端口运行，包含 11 项基础交互、5 项故障回退和 7 项城市地图检查。另对 3,360 组视口、像素密度、高度和纬度组合完成离线瓦片选择核验；渲染使用逐块筛选，4K / 高 DPR 不再受旧数组数量上限影响，也不会因此降低 LOD。

2026-10-01 本轮受控验证：111 项单测、15 项转发测试和 33 项 Edge 浏览器检查通过，类型检查与生产构建通过；3,360 组选择审计失败 0。浏览器瓦片全部为本地夹具；[详细结果和未测项](./artifacts/china-network/RESULTS.md)明确区分真实网络验收。

真实网络画面另行核验：上海 12 km / z15 加载 180/180 片，上海 600 m / z19 加载 120/120 片，东京站 600 m / z18 航空影像加载 40/40 片，均无失败。截图见 [上海城市](./artifacts/phase2-shanghai-city.png)、[上海街区](./artifacts/phase2-shanghai-streets.png)与[东京航空影像](./artifacts/phase2-tokyo-aerial.png)。这些结果确认所测视图可用，不代表公共服务在所有地点和时段均有同样表现。

## 代码位置

| 路径 | 职责 |
|---|---|
| `src/app/` | 城市、搜索、地图样式、图层设置、异常提示和署名 UI |
| `src/earth/` | 场景、NASA 底图、昼夜材质、云层、太阳与后处理 |
| `src/camera/` | WGS84 高度缩放、近地操作、分段飞行和自转 |
| `src/geo/` | WGS84/ECEF、世界轴映射、ENU 坐标 |
| `src/layers/MercatorTiles.ts` | 实际在线图层使用的 Web Mercator 四叉树、UV 和 LOD |
| `src/layers/ViewFootprint.ts` | 屏幕射线与 WGS84 椭球求交，计算可见范围 |
| `src/layers/TileGeometry.ts` | 瓦片局部顶点、椭球曲面与 Mercator 纹理映射 |
| `src/layers/ImageryTileLayer.ts` | 按需请求、父级过渡、缓存、取消、失败回退和资源释放 |
| `src/layers/TileSources.ts` | EOX、GSI、USGS、OSM 与可选授权影像；同源或直接请求地址 |
| `server/tile-relay.mjs` | 固定来源的在线瓦片转发、HTTP 缓存与失败响应 |
| `server/serve.mjs` | 生产环境静态文件与瓦片服务 |
| `public/textures/` | 本地全球底图与各分辨率素材 |

第一步的 `TileLodManager.ts` 经纬度占位算法保留供参考；实际在线链路使用新的 Web Mercator 实现，不能混用两套瓦片键。实现与扩展约定见 [EXTENDING.md](./EXTENDING.md)，计划与阶段记录见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。此前 NASA 底图修复记录保留于 [TEXTURE_FIX_PLAN.md](./TEXTURE_FIX_PLAN.md) 和 [BLUR_ANALYSIS_REPORT.md](./BLUR_ANALYSIS_REPORT.md)。
