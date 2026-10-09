# 在线影像与街道瓦片

来源采样日期：2026-09-25；同源服务接入说明更新于 2026-09-27。以下记录第二步使用的数据源、坐标与原生细节上限。瓦片分辨率不等于影像地面分辨率；把同一张图继续放大不会生成新的建筑细节。

## 项目当前默认配置

2026-10-01 代码增加可选天地图 WMTS：`tianditu-vec`（vec_w 街道底图）＋`tianditu-cva`（独立透明路名）、`tianditu-img`（img_w 卫星），配置 z1–18、256 px、墨卡托 `w` 矩阵。中国网络优先且有自有授权 Key 时选用；原全球策略作为缺少 Key 或故障时的兼容来源。下述原全球模式和历史采样保留。新增来源已通过本地受控夹具的渲染和请求流程测试，但未使用真实 Key 请求地图；授权、矩阵范围、地图对齐与现行许可仍待核对，不能把旧采样扩展为新增来源验收。见 [本轮结果](../artifacts/china-network/RESULTS.md)。

同源服务使用服务端 `TIANDITU_TOKEN`；纯静态直连使用单独的浏览器端 `VITE_TIANDITU_TOKEN`。Key 类型与实际调用产品必须匹配，不复用第三方示例 Key，不伪造 Referer/浏览器身份。来源参考 [官方地图服务](https://lbs.tianditu.gov.cn/server/MapService.html)、[官方站托管的适配文档](https://heilongjiang.tianditu.gov.cn/iportal/iClient/forJavaScript/docs/openlayers/ol.source.Tianditu.html)。保持可见“天地图 · 国家地理信息公共服务平台”署名；发布前按自己的授权确认附加标识要求。详细配置和待测内容见 [实施记录](./CHINA_NETWORK_PLAN.md)及 [Sol 验证清单](./CHINA_NETWORK_SOL_TESTS.md)。

`src/layers/TileSources.ts` 已实际接入 EOX 2025、GSI、USGS NAIP Plus 和 OSM。无需密钥即可运行；EOX 2016 仅在本文记录为可替代来源，当前没有提供年份切换 UI。

- **自动**：区域尺度用 EOX 2025；日本主要范围低于 25 km 用 GSI（z14–18），美国本土低于 40 km 用 USGS（z12–19），其他地区低于 25 km 用 OSM（最高 z19）。
- **卫星**：使用 EOX 2025 和同样的日本/美国摄影覆盖，不自动切成街道图。EOX 的原生请求上限为 z14。
- **街道**：使用 OSM，道路和建筑轮廓属于地图制图。
- 配置 `VITE_ARCGIS_API_KEY` 后，自动和卫星模式使用有授权的 World Imagery（最高 z19），街道模式不变。变量须放在本地环境配置中，重启开发服务或重新构建；客户端 token 必须适合公开使用并设置来源限制。

上海默认城市视图为 OSM 街道图；东京和美国覆盖区提供真实摄影。相机最低 150 m 与地图源能提供多少细节是两个独立上限。在线请求只针对当前视野及其显示过渡所需父级，使用正常 HTTP 缓存和会话资源复用，不随项目分发瓦片，不提供离线地图下载。

中国大陆网络下 OSM 街道级瓦片可能缓慢或无法加载，目前还没有运营商对照结果。国内源适配代码已加入，但真实可用性与提速仍待验证，未配置凭据时不会自动调用它。

## 无密钥来源

| 来源 | 覆盖和细节 | 原生请求建议 | 许可与署名 |
| --- | --- | --- | --- |
| EOX Sentinel-2 cloudless 2025 | 全球，10 米影像；适合区域、城市全貌 | z0–14，256×256 JPEG | 个人及非商业：CC BY-NC-SA 4.0；商业另需许可 |
| EOX Sentinel-2 cloudless 2016 | 全球，10 米历史影像 | z0–14，256×256 JPEG | CC BY 4.0；可作无非商业限制的旧年份替代 |
| 日本国土地理院 GSI seamlessphoto | 日本陆地区域；实拍航空正射影像 | 高细节 z14–18，256×256 JPEG | 实时网站/应用调用可署名使用；遵循图层附加来源说明 |
| USGS NAIP Plus | 美国覆盖区；源影像约 0.15–1 米，地区和年份不同 | 动态 EPSG:3857 瓦片，建议最高 z19 | USGS/USDA 的公共领域正射影像；保留来源署名 |
| OpenStreetMap 标准街道图 | 全球道路、建筑轮廓、地名；属于地图制图，不是摄影 | z0–19，256×256 PNG | © OpenStreetMap contributors；遵守公共瓦片服务政策 |

EOX 当前产品文档明确为 10 米，Web Mercator 金字塔到 z14。[产品规格](https://cloudless.eox.at/documentation/product-list)与[各年份许可及署名](https://cloudless.eox.at/license-non-commercial)应一并保留。2018–2025 不能描述为无条件商用免费。EOX 公开演示服务允许应用直接使用，但没有 SLA，可能限流。[EOX 服务说明](https://maps.eox.at/)

## URL 与接入

默认浏览器请求 `/__tiles/{source}/{z}/{x}/{y}`，由 `server/tile-relay.mjs` 转发至下列官方来源。开发与构建预览由 Vite 挂载同一处理逻辑；生产环境使用 `npm run serve`。路由只允许内置来源 ID 与有效 XYZ 坐标，不能用来代理任意网址。

需要纯静态托管时，构建前设置 `VITE_DIRECT_TILES=true` 可改为浏览器直连。默认构建只上传 `dist/` 时没有同源瓦片接口；全球本地底图仍可显示，在线细节需要配套 Node 服务或重新构建为直连模式。

所有 x/y 均采用 Web Mercator XYZ 索引，y 从北向南递增。EOX 的 URL 路径顺序是 z/y/x；GSI、OSM 是 z/x/y。纬度应钳制在 ±85.05112878°，经度循环归一化。

```text
# EOX 2025：适合当前个人 / 非商业项目
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg

# EOX 2016：CC BY 4.0 历史影像
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg

# GSI：仅在其日本实际覆盖区请求高细节
https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg

# OSM：只请求用户正在看的瓦片
https://tile.openstreetmap.org/{z}/{x}/{y}.png

# USGS：将标准 XYZ 瓦片换算为 Web Mercator 米制 bbox
https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox={west},{south},{east},{north}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image
```

USGS 的 bbox：令 `half = 20037508.342789244`，`span = 2 * half / 2**z`，则 `west = -half + x * span`、`east = west + span`、`north = half - y * span`、`south = north - span`。这是把官方动态影像按瓦片网格请求，并非其缓存瓦片 API。影像合成可能较慢；请求取消、排队、复用已加载父级和失败回退必不可少。[服务元数据](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer)

不要把 `USGSImageryOnly/MapServer` 的通用 tileInfo 层级表误当成全层级内容：纽约实测 z16 成功，z17–19 均为 404。NAIP Plus 的 `exportImage` 在同一地点可返回高细节影像。

## 可见署名

- EOX 2025：`EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)`，对 EOxCloudless 和 EOX 分别保留到产品站和公司站的链接，并提供 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 链接。2016 图层按官方年份说明改用 `2016 & 2017` 并链接 CC BY 4.0。
- GSI：`地理院タイル（国土地理院）`，链接[地理院瓦片目录](https://maps.gsi.go.jp/development/ichiran.html)。目录明确允许实时应用加载；z14–18 以航空影像为主。若覆盖冲之鸟礁附近 GRUS 数据（约 20.408–20.456°N、136.066–136.140°E），还需 `GRUS画像（© Axelspace）`。低于 z14 的同名图层采用其他来源，附加署名要求不同，因此本方案只使用它的高细节层。
- USGS：`USGS, USDA, The National Map: Orthoimagery`，链接[服务目录](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer)。这些资料是历史采集影像，不能标为实时卫星。
- OSM：`© OpenStreetMap contributors`，链接[版权页面](https://www.openstreetmap.org/copyright)，在地图上始终可见。

## 网络与缓存边界

公共来源只用于当前视野的按需请求。遵守响应缓存头，不增加强制绕过缓存的请求参数，不提供批量下载、离线包、城市预取；图层应可配置更换。[OSM 公共瓦片政策](https://operations.osmfoundation.org/policies/tiles/)要求可识别的应用请求、有效 Referer 和正常缓存行为，并禁止自动扫图、离屏预取和用于强制下载的无头漫游。几何 LOD 和设备高画质与这些服务约束相互独立。

默认同源服务用稳定的应用 User-Agent 识别自身，并携带实际页面 Referer；公开部署建议用 `TILE_USER_AGENT` 填写真实应用名称与网站或联系方式。它保留缓存控制、ETag、Last-Modified 等上游信息，依据有效期复用已请求响应并在需要时进行条件请求；上游要求不存储的响应不进入缓存。缓存仅服务于已发生的在线浏览，不触发后台下载。直连模式保留浏览器自身 User-Agent、Referer 与 HTTP 缓存行为。

少量集成核验发现，本机浏览器直连可能报告 `ERR_CONNECTION_CLOSED`；缺少明确应用标识的脚本请求也可能收到 HTTP 200 的拒绝访问图片。转发服务把带 `x-blocked` 标记的图片当作失败，使页面保留已有底图并允许重试，不把 HTTP 200 直接当作有效影像。服务拒绝、缺片和限流仍应按失败处理，转发不改变来源授权或可用性。

EOX 采样响应为 `Cache-Control: max-age=604800`、CORS 回显请求 Origin；GSI/USGS/OSM 支持 CORS。浏览器跨域支持并不保证每条访问网络都能连通。不把在线瓦片写入仓库或生产包。

## 现场采样结果

以下是少量、有界的 HTTP 集成核验，不是批量抓取。请求来自当前 Windows 环境，Origin 为 `http://127.0.0.1:4173`。

| 地点 | EOX 2025 z14 | EOX 2016 z14 | OSM z19 |
| --- | --- | --- | --- |
| 上海 31.2304, 121.4737 | 200 JPEG，19,670 B | 200 JPEG，10,177 B | 200 PNG，9,999 B |
| 东京 35.6762, 139.6503 | 200 JPEG，18,526 B | 200 JPEG，11,712 B | 200 PNG，11,578 B |
| 纽约 40.7128, -74.0060 | 200 JPEG，11,571 B | 200 JPEG，8,315 B | 200 PNG，9,669 B |

东京 GSI `/18/232762/103231.jpg` 返回 200 JPEG（21,536 B），对应 z19 返回 404。纽约 USGS NAIP Plus z19 对应 bbox `-8238382.9085763,4970012.01613045,-8238306.47154801,4970088.45315873` 返回 200 JPEG（7,984 B），CORS `*`，缓存 43,200 秒。同一点查询影像目录，结果为 USDA 2019 年、0.6 米源影像。以上是可访问性核验，不保证其他地点存在同样清晰度或服务永远在线。

### 生产渲染视图（2026-09-27）

使用生产 Node 服务和真实在线来源完成了有限的画面加载核验：

| 地点与相机高度 | 实际来源 | 层级 | 已加载 / 所需瓦片 | 失败 |
|---|---|---:|---:|---:|
| 上海城市，12 km | OSM 街道图 | z15 | 180 / 180 | 0 |
| 上海街区，600 m | OSM 街道图 | z19 | 120 / 120 | 0 |
| 东京站航空影像，600 m | GSI seamlessphoto | z18 | 40 / 40 | 0 |

对应截图：[上海城市](../artifacts/phase2-shanghai-city.png)、[上海街区](../artifacts/phase2-shanghai-streets.png)、[东京航空影像](../artifacts/phase2-tokyo-aerial.png)。这些是验收时对三个具体视图的抽样结果，不代表数据源在所有地点持续提供相同覆盖或清晰度。

## 可配置的全球亚米级影像

Esri World Imagery 可以提供更广泛的亚米级摄影，但其可公开请求的旧端点不等于开放许可。[Esri 官方使用摘要](https://goto.arcgis.com/termsofuse/viewsummary)要求配合相应 Esri 软件/订阅，并限制系统抓取及瓦片再分发。[World Imagery 项目条款](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)明确该普通图层不用于离线导出。因此不把匿名旧端点作为无需授权的默认源。

持有适用 ArcGIS 授权与 token 时可配置：

```text
https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={ACCESS_TOKEN}
```

官方开发者[接入说明](https://www.esri.com/arcgis-blog/products/developers/developers/open-source-developers-time-to-upgrade-to-the-new-arcgis-basemap-layer-service)提供此直接影像瓦片方式；当前 [Basemap Styles 身份验证文档](https://developers.arcgis.com/documentation/mapping-and-location-services/mapping/basemaps/introduction-basemap-styles-service/)说明 token 要求。不要把密钥提交到仓库；浏览器公开 token 应配置来源与权限限制。

2026-09-25 读取旧公开服务元数据时署名为 `Esri, Vantor, Earthstar Geographics, and the GIS User Community`。三个城市各 z16–19 采样均返回影像；官方 Citations 图层给出上海 0.31 米 WorldView-3（2025-04-18）、东京 0.5 米 WorldView-2（2026-01-08）、纽约 0.1524 米正射影像（2024-03-14）。上海、东京原生元数据到 z19；纽约到 z20。通用服务虽列到 z23，也不能承诺全球 z23 细节；上海 z20 曾返回极小的 200 JPEG，HTTP 成功本身不足以判定有数据。

未找到同时满足全球覆盖、亚米级、无需密钥且许可无条件开放的可靠摄影源。默认开放方案可在日本、美国进入真实街区摄影，在其他地区提供 10 米区域影像并用 OSM 街道图呈现更细的城市信息。全球亚米级摄影需要接入有授权的数据供应商。
