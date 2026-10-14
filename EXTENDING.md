# 地理图层与细节扩展

第二步已将真实在线瓦片接入 Three.js 渲染循环。全球 NASA 底图保留在底层，近地通过 Web Mercator 四叉树选择并请求摄影或街道图。当前不含高程、三维建筑与街景；清晰度上限取决于实际来源。用户操作与配置见 [README.md](./README.md)，服务许可和采样记录见 [docs/IMAGERY.md](./docs/IMAGERY.md)。

## 当前模块

| 模块 | 职责 |
|---|---|
| `MercatorTiles.ts` | XYZ 索引、边界、父子关系、Mercator UV、可见瓦片选择和目标层级 |
| `ViewFootprint.ts` | 双精度射线与 WGS84 椭球解析求交、屏幕采样及日期变更线范围 |
| `TileGeometry.ts` | 以瓦片中心为原点的局部顶点、椭球法线和全球夜景 UV |
| `TileSources.ts` | 可替换的来源 URL、层级范围、类型和署名；按模式、位置与高度选源 |
| `ImageryTileLayer.ts` | 渲染集成、加载队列、父级覆盖、淡入、缓存、取消、重试与释放 |
| `CameraController.ts` | 从太空到 150 m 的 WGS84 高度控制、近地拖动、分段飞行与动态裁剪面 |
| `server/tile-relay.mjs` | 固定来源的同源请求、坐标校验、上游标识、HTTP 缓存与失败处理 |
| `server/serve.mjs` | 生产环境提供 `dist/` 与同源瓦片接口 |

第一步的 `TileLodManager.ts` 和旧 `TileProvider` 接口保留作为经纬度投影的算法实验，当前在线链路不使用它们的瓦片键或预算降级。扩展新的在线供应商应接入 `TileSources.ts` 的 `TileSource`，并同步更新 `server/tile-relay.mjs` 的来源及层级白名单。

## 坐标、投影与精度

地理坐标采用 WGS84，经纬度为度，椭球高为米。全球位置统一经 `src/geo/CoordinateSystem.ts` 换算：`world = (ECEF.x, ECEF.z, -ECEF.y) / 6378137`。

在线瓦片采用标准 **Web Mercator XYZ**：每级 `2^z` 行列，x 向东、y 向南；有效纬度为约 ±85.05112878°。高于此范围的极区保留全球底图。`west > east` 表示跨日期变更线，`[-180, 180]` 表示全球经度。正面积范围不额外包含最远边界的邻片。

`tileUV` 返回影像行坐标；`mercatorLatitudeAt` 通过逆 Mercator 得到网格行的纬度，不能将纬度线性插值直接当成影像 v。`TileGeometry` 的顶点先减去瓦片中心，再存入 Float32；物体位置保留 JS 双精度中心，视图变换在上传 GPU 前合成，以减少近地坐标误差。它不是全场景原点迁移，也没有加入地形高度。

`ViewFootprint` 对屏幕网格发射射线，以解析椭球求交计算当前地理范围；轨道高度增加适当边缘覆盖，再由视锥和地平线剔除不可见瓦片。接近表面时使用较稳定的二次方程根，避免最近交点相消误差。

## 画质与 LOD

渲染像素比固定为 `max(2, devicePixelRatio)`，最大各向异性和 GPU 支持的最大 MSAA；不使用屏幕、设备内存、CPU 数量或帧率判定低画质。全球纹理选择硬件可加载的最高现有尺寸，最高为 NASA 12K。

```ts
import { targetZoom, selectMercatorTiles } from './src/layers/MercatorTiles';
import { viewBounds } from './src/layers/ViewFootprint';

const bounds = viewBounds(camera);
const zoom = targetZoom(
  cameraAltitudeMeters,
  latitude,
  camera.fov,
  canvas.height, // 实际绘图像素，不能传 CSS 高度
  source.tileSize,
  source.maxZoom,
);
const tiles = bounds ? selectMercatorTiles(bounds, zoom) : [];
```

层级综合视场角、相机高度、纬度尺度与物理像素密度；目标是有足够源纹理像素覆盖屏幕像素。没有因掉帧或瓦片缓存数量而降低可见 LOD 的策略。渲染循环使用 `iterateMercatorTiles` 流式枚举候选瓦片并逐片剔除不可见区域，不先分配整个包围盒数组，因此可保留超过 4,096 片时的目标层级。`selectMercatorTiles` 是供测试和小范围调用使用的数组便捷接口，仍有 4,096 片分配上限，超出会抛错；生产渲染不要用它替代迭代接口。

当前在线图层在相机低于 3,500 km 时启用，并在 3,500–2,000 km 间与全球底图过渡。`atNativeLimit` 表示屏幕需要的层级高于来源上限；界面显示来源细节上限。它表示无法取得更多源数据，不是设备自动降画质。

## 来源与模式

默认无需密钥，`chooseTileSource` 依次处理：

1. `streets`：始终选择 OSM（最高 z19）。
2. 已配置 `VITE_ARCGIS_API_KEY`：自动及卫星模式使用授权 World Imagery（最高 z19）。
3. 日本主要覆盖区（30–45.8°N、129–146°E），低于 25 km：GSI 航空影像（z14–18）。
4. 美国本土范围（24.5–49.5°N、125–66°W），低于 40 km：USGS NAIP Plus（z12–19）。
5. `auto` 的其他地区低于 25 km：OSM 街道地图。
6. 其余情况：EOX Sentinel-2 cloudless 2025（最高 z14、10 米）。

区域包围盒是选源范围，不保证其中每一张瓦片都有摄影。缺失时沿用现有覆盖；可切到街道图。上海默认城市细节来自 OSM 道路与建筑轮廓，不能宣传为全球亚米级摄影。USGS 将标准瓦片 bbox 交给动态 `exportImage`，其 256 像素输出不意味着源影像具备同样的地面采样精度。

添加来源应实现 `id`、`name`、`minZoom`/`maxZoom`、`tileSize`、`kind`、署名文本和 URL，以及 `url(tile)`；可选 `annotationUrl(tile)` 用于独立渐进加载透明注记。用真实内容覆盖而非服务通用层级表确定 `maxZoom`。`kind: 'map'` 用清晰照明呈现文字，摄影图层保留从轨道光照到近地清晰照明的过渡。

Vite 的 `VITE_` 变量会公开进入客户端。`VITE_ARCGIS_API_KEY` 和纯静态模式的 `VITE_TIANDITU_TOKEN` 只能配置可公开、已限制来源和权限的 token。同源天地图使用独立的 `TIANDITU_TOKEN`，由 Node 保管；配置接口只返回是否存在凭据，不返回密钥。

2026-10-01 新增 `NetworkProfile`：手动偏好覆盖部署配置，自动模式仅用时区/语言作线路建议；Network Information API 的带宽/RTT/节省流量提示只改变排队，不改变质量。中国优先且有天地图配置时，使用 `vec_w`＋`cva_w` 街道或 `img_w` 摄影；上列原选源规则作为全球策略和兼容回退。`chooseTileSource` 可接收失败源集合，图层对备用源保持稳定，避免反复跳转。

默认 `TileSources` 通过 `/__tiles/{source}/{z}/{x}/{y}` 请求内置来源；Vite 开发及预览服务挂载 `tileRelayPlugin`，生产服务使用同一个 `createTileRelay`。纯静态托管必须在构建前设置 `VITE_DIRECT_TILES=true`，此时改用官方 URL 直接请求，并依赖浏览器的网络和 CORS 条件。

## 加载、缓存与回退

`ImageryTileLayer` 使用来源 id 与 z/x/y 组合为条目键，同一条目不会重复排队。每轮只选当前视野，先显示可用父级，然后以约 0.28 秒淡入新子片。切换数据源时保留原覆盖直到新覆盖到位；全球底图始终存在。

浏览器请求使用 `fetch`、`AbortController` 和默认 HTTP 缓存，视图变化取消无关在途请求。先加载必要的一层粗略父图，再按中心优先加载最终层级，最后在空闲请求名额中补充注记。正常并发为 8、慢网为 4，底图/注记共用队列，不改变选定分辨率。浏览器超时为正常 12 秒、慢网 20 秒、USGS 35 秒。默认同源服务转发实际页面 Referer，并以应用 User-Agent 识别自身；公开部署用 `TILE_USER_AGENT` 设置真实应用名称与联系信息。服务端同瓦片请求共用下载，最后一个等待客户端离开时才取消上游。

转发服务有默认 64 MiB 的内存 HTTP 缓存，与浏览器缓存、GPU 纹理缓存分别管理。它按上游有效期复用响应，过期时使用 ETag 或 Last-Modified 进行条件请求；不存储 `no-store` 或 `private` 响应。缓存只来自用户正在浏览的请求，不增加预取。带 `x-blocked` 标记的 HTTP 200 图片按服务拒绝处理，不能当作成功影像。暂时失败会保留原图并延时重试，页面也提供手动重试；公共服务的限流和可用性仍会影响加载等待时间。

当前 GPU 资源缓存淘汰只处理不再使用的条目，约 640 条之后按最近使用顺序释放；当前可见覆盖不因此降低清晰度。释放时销毁 geometry、material、texture 并关闭 `ImageBitmap`。这是会话资源复用，不是离线下载缓存。未来新增更大瓦片或地形数据时，应增加按解码字节统计的独立 CPU/GPU 预算，仍不以此静默降低当前视图的层级。

`server/tile-transport.mjs` 负责共享缓存、条件请求、进行中请求合并、Retry-After 和供应商冷却；`tile-relay.mjs` 保留来源白名单/URL 组装及 Vite 插件入口。浏览器会话中的 `TileMetrics` 只记录最多 256 条请求的来源、耗时、结果和字节数，`window.earth.getState().tiles.diagnostics` 返回来源汇总，不含 URL、坐标和密钥。全屏覆盖耗时需单独量测。本轮未构建/测试；Sol 验证任务在 `docs/CHINA_NETWORK_SOL_TESTS.md`。

公开服务应只请求用户当前观看的区域，不增加离屏邻片预取、自动扫图或城市离线包。保留正常 Referer，遵守服务端缓存头和可见署名；加载重试不要附加破坏缓存的随机参数。正式部署前检查默认 EOX 非商业许可是否适合用途，或更换已获授权来源。

## 相机与后续边界

相机高度限制在 150 m 至 `4.5 × WGS84.a`。缩放按高度而非地心距离乘比例；飞行在高度的对数空间插值，跨城近地飞行先升高、巡航再下降。近裁剪面按高度调整，近地拖拽以真实地面尺度移动，并保持相机在椭球之外。

云层、Bloom 和大气在近地淡出，是为看清地表的视觉设计；不因设备性能触发。`EarthOutputPass` 在 1,000–150 km 间从太空视角的 ACES 色调映射过渡到原始影像色彩，150 km 以下保留摄影与地图的原始对比度。实际三维建筑、地形高程、倾斜自由相机、地形遮挡和完整场景原点迁移仍是后续工作。加入地形前必须明确高程基准、垂直单位、相机到真实地面的距离，以及瓦片缝隙处理。

## 搜索地点名称

城市与坐标搜索都经 `EarthRenderer.focusLocation` 开始相机飞行并设置名称；`CameraController.onFlightState` 携带 travel/zoom 类型报告飞行开始、到达或取消。`SearchLabelLayer` 在 Three.js 场景中维护一条 Troika SDF 网格；`SearchSurfaceText` 只在字体 shaping 完成时进行一次布局，按中文字形、Latin 字母与无空格跨脚本边界分别加字距，再一次性 fit 到安全宽度，并将字形顶点映射到 WGS84 椭球曲面。名称固定于搜索坐标的东/北方向，不随镜头反向缩放。`SearchTitleSizing` 按 CSS 视口和可见字形测量定标；桌面短名称目标约为视口宽 22%，长名称与手机有独立宽度上限。渲染更新负责真实飞行显露、fit 后渐隐、地表明暗选墨和地球遮挡，不逐帧排版、不读回 GPU 像素、不接收点击或拖动。

本地字体为 Cinzel Medium 500 与 Source Han Serif SC Medium 500；加载失败时不请求 CDN，并保留安全失败状态。主色为浅香槟金 `#F2DEAE`，亮影像或街道由缓存亮度提示选择深古铜 `#644A2B`；复用 8×8 缓存采样、3×3 邻域和 0.27/0.19 滞回。中文字距 0.08em、Latin 字母 0.10em、无空格跨脚本边界 0.09em；真实空格、标点和数字不额外加宽。名称先收紧字距，再一次性等比缩小以适应工具栏安全宽度。到达后保留 3 秒并淡出 0.5 秒；缩放至 fit 后字号 1.5–3 倍渐隐，接近屏幕边缘或工具栏时平滑淡出。后续地点飞行、交互取消、重置、页面后台过期、上下文中断和销毁会清理旧对象。减少动态偏好下省略动效。地点数据仍供搜索使用，不再通过 `MarkerLayer` 创建常驻地图按钮，也没有 `markers` 图层开关。

旧版 DOM 投影方案记录在 `SEARCH_LABEL_FLIGHT_PLAN.md`，Atlas、Source Serif 4 与 28px Cinzel 字号方案分别记录在 `SEARCH_LABEL_ATLAS_PLAN.md`、`SEARCH_LABEL_CINZEL_PLAN.md`；它们均为演进历史。当前字号、颜色、fit 和渐隐规则以 [大标题交付记录](./docs/SEARCH_LABEL_GRAND_TITLE_PLAN.md)为准。验证通过 165 项单测、Web 构建、44 组浏览器前后样本、桌面/手机/减少动态生命周期与生产首搜；Android 共用资源已同步，但本轮未打 APK 或验收设备。

## 验证入口

```sh
npm test
npm run test:relay
npm run build
npm run test:browser
npm run check:visual
```

后两项需先启动开发服务。数学测试覆盖投影、日期变更线、UV、局部几何、源像素与屏幕采样、视野求交和近地相机；浏览器需检查三个地图模式、城市与街区预设、上海/东京/纽约、平移到瓦片边缘、失败重试、来源署名及资源释放。确定性测试应使用本地模拟响应，不用公共服务做循环扫图压力测试。
