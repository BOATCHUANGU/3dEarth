# 地球贴图来源、许可与处理记录

本项目将全球纹理随站点打包到 `public/textures/`；城市级在线瓦片在运行时按视野请求，来源与许可见 [docs/IMAGERY.md](./docs/IMAGERY.md)。最后核对日期：2026-09-27。

## 当前使用的素材

### 白天地表：NASA Blue Marble: Next Generation

使用 NASA Earth Observatory 的 January 2004 全球合成图。NASA 页面提供的全局 JPEG 为 **21,600 × 10,800，约 2 km/pixel**；另有 500 米分辨率的分块数据。项目选用全球图，按高、中、轻量档缩放后作为地球颜色纹理，适合全球视角，不等同于城市级高清影像。

来源：[NASA Earth Observatory · Blue Marble: Next Generation, Base Map](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/)
原始图：[world.200401.3x21600x10800.jpg](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x21600x10800.jpg)
归属说明：NASA Earth Observatory 要求再发布 Blue Marble: Next Generation 时标注来源；页面要求的署名为 **NASA Earth Observatory**。

原始文件约 23,716,627 字节，未放入站点目录。项目生成的 JPEG 衍生图使用 Lanczos 缩放和 4:4:4 色度采样；NASA 原始全球图是 2:1 全球底图，和地球网格的 UV 投影相符。符合硬件和内存条件的桌面可用 12K 衍生图；其余设备使用 8K、4K 或 2K 档。

### 夜间灯光、云层和海洋遮罩：Solar System Scope / INOVE

这些素材来自 [Solar System Scope 官方纹理目录](https://www.solarsystemscope.com/textures/)，授权为 [Creative Commons Attribution 4.0 International（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/)。素材基于 NASA 高程、影像及 Blue Marble 数据合成与调色。再发布时保留作者、来源、许可和修改说明。

可用署名：

> Night, cloud and ocean-mask textures by Solar System Scope / INOVE, licensed under CC BY 4.0. Based in part on NASA imagery. Resized and recompressed variants are included.

## 文件清单

下列尺寸是图像解码后的实际尺寸。`2K`、`4K`、`8K`、`12K` 是全球经纬度贴图的像素宽度档位。

| 本地文件 | 尺寸 | 文件字节数 | 内容与用途 | 修改 |
|---|---:|---:|---|---|
| `earth-day-ultra.jpg` | 12288 × 6144 | 12,239,241 | NASA 白天地表高端设备档，sRGB | 由 21,600 × 10,800 全球图缩放，JPEG Q94 |
| `earth-day.jpg` | 8192 × 4096 | 5,933,378 | NASA 全球白天地表颜色图，sRGB | 由 21,600 × 10,800 全球图缩放，JPEG Q94 |
| `earth-day-4k.jpg` | 4096 × 2048 | 1,537,160 | NASA 白天地表中档 | 原始 NASA 全球图直接缩放，JPEG Q93 |
| `earth-day-2k.jpg` | 2048 × 1024 | 405,452 | NASA 白天地表轻量档及地点卡片缩略图 | 原始 NASA 全球图直接缩放，JPEG Q92 |
| `earth-day-sss-original.jpg` | 8192 × 4096 | 4,565,076 | 旧版 Solar System Scope 白天地表；留作溯源，不再用于主地球 | 原图副本，仅改名 |
| `earth-night.jpg` | 8192 × 4096 | 3,144,468 | Solar System Scope 夜景灯光，sRGB | 原图，仅改名 |
| `earth-night-4k.jpg` | 4096 × 2048 | 971,245 | 夜景中档，sRGB | 从 8K 缩放，JPEG Q93 |
| `earth-night-2k.jpg` | 2048 × 1024 | 176,762 | 夜景轻量档，sRGB | 从 8K 缩放，JPEG Q92 |
| `earth-clouds.jpg` | 4096 × 2048 | 3,179,625 | 灰度云量图；白为云、黑为较少云 | 8K 原图缩小，JPEG Q92 |
| `earth-clouds-2k.jpg` | 2048 × 1024 | 828,162 | 云层轻量档 | 从本地 4K 缩小，JPEG Q92 |
| `earth-specular.png` | 4096 × 2048 | 753,873 | 海洋遮罩；白为海洋、黑为陆地 | 8K TIFF 缩小并转为 PNG |
| `earth-specular-2k.png` | 2048 × 1024 | 308,416 | 海洋遮罩轻量档 | 从本地 4K 缩小 |

### 来源与下载链接

- NASA 白天地表：NASA Earth Observatory January 2004 全球 Blue Marble 图，21,600 × 10,800 JPEG。NASA 还列出 500 米全球分块图，可用于后续区域 LOD。
- 夜景：[8k_earth_nightmap.jpg](https://www.solarsystemscope.com/textures/download/8k_earth_nightmap.jpg)。
- 云层：[8k_earth_clouds.jpg](https://www.solarsystemscope.com/textures/download/8k_earth_clouds.jpg)。
- 海洋遮罩：[8k_earth_specular_map.tif](https://www.solarsystemscope.com/textures/download/8k_earth_specular_map.tif)。
- 旧版 Solar System Scope 白天地表：[官方素材说明](https://www.solarsystemscope.com/textures/)，项目保留副本 `earth-day-sss-original.jpg`，不参与当前渲染。

## 贴图档位选择

- 启动时按 WebGL 报告的 GPU 最大纹理尺寸选择可用的最高档，不按窗口宽度、设备内存或 FPS 降低贴图档位。

| GPU 最大纹理尺寸 | 白天地表 | 夜景 | 云层 / 海洋遮罩 |
|---:|---|---|---|
| ≥ 12,288 | 12K | 8K | 4K |
| 8,192–12,287 | 8K | 8K | 4K |
| 4,096–8,191 | 4K | 4K | 4K |
| < 4,096 | 2K | 2K | 2K |

高分辨率贴图加载失败时回退到 2K。12K 地表解码和 mipmap 会显著增加显存占用；当前策略依据 GPU 纹理上限，不把 8 GB 内存报告作为额外门槛。画质设置调整渲染像素比和 Bloom，不重新选择贴图。实际地表加载流程与近地影像瓦片是两套分辨率机制。

压缩文件大小不等于显存占用；WebGL 上传后会解码纹理并生成 mipmap。NASA 全球图仍作为全球底图。城市级细节已经由在线 Web Mercator 瓦片 LOD 提供，当前来源和采样范围见 [docs/IMAGERY.md](./docs/IMAGERY.md)；该在线图层与本文件列出的本地全球纹理分开管理。

## 渲染约定与局限

- 图像使用全球 2:1 经纬度纹理，左侧对应西经 180°，中线对应 0°，右侧对应东经 180°；北极在顶部。
- 地表颜色图和夜景图标记为 sRGB；云层和海洋遮罩作为线性数据纹理读取。
- 地表、夜光和夜间云层不是实时遥感数据。NASA 的白天地表固定使用 January 2004 合成图；云层漂移只是视觉效果。
- NASA 页面把 21,600 × 10,800 全球图标注为约 2 km/pixel。按地球赤道周长除以纹理宽度估算，8K 全球纹理约 4.9 km/纹素，12K 约 3.3 km/纹素；12K 比 8K 有更多显示像素，但仍是全球合成图，单一全球纹理无法提供城市或街道细节。当前近地细节由在线地图 LOD 提供，来源与覆盖边界见 [docs/IMAGERY.md](./docs/IMAGERY.md)。

## 离线城市地名索引

城市检索数据衍生自 [GeoNames 全球下载](https://download.geonames.org/export/dump/)，署名 **GeoNames**，遵循 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。采用 `cities15000.zip`、`admin1CodesASCII.txt` 和 `countryInfo.txt`；GeoNames 的坐标采用 WGS84，字段定义见[数据说明](https://download.geonames.org/export/dump/readme.txt)。本项目进行了筛选、字段精简、别名去重和 gzip 压缩，未改换坐标系。

- 获取快照：2026-10-04；各输入的 Last-Modified、字节数与 SHA-256 保存在 `public/search/metadata.json`。该日期是获取日期，并非人口统计日期；数据没有完整性/实时性保证。
- 范围：从 cities15000 选择 `P` 类，人口 ≥ 15,000 或 `PPLC`/`PPLA`；排除 `PPLX`（城市部分）、`PPLQ`、`PPLH`、`PPLW` 等废弃/历史/已毁居民点。共 31,729 项，244 个国家/地区代码，不能理解为 244 个主权国家。
- 名称：保留所选记录的 name、ASCII name 和所有非空去重 alternatenames，包括源数据可用的中文、英文及本地/历史别名。便利别名字段不带语言标签，不推断全部汉字别名都是中文，也不保证每个城市有中文名。行政区来自 admin1，国家中文显示来自浏览器 Intl.DisplayNames。
- 产物：`public/search/cities.json` 为 7,952,531 字节，`cities.json.gz` 为 3,473,691 字节；分别约 7.58 / 3.31 MiB。两者是同一索引的兼容格式，正常只读取 gzip，失败时才读取 JSON。没有将原始全球 dump 放入应用包。
- 生成脚本：`scripts/generate-city-index.py --snapshot-date YYYY-MM-DD`，使用 Python 标准库。官方 HTTPS 下载在本机握手失败，本次使用同一官方域名的 HTTP 公共下载，实际 URL 已记录；未关闭 TLS 验证。重新生成需同步 Worker 的 snapshot 缓存参数及文档体积；哈希用于追踪快照，不代表独立真实性认证。
- 按需加载：本地静态资源由 Worker 获取并在 Worker 内检索，不查询外部地名服务；HTTP 缓存及当前 Worker 内存可复用，无单独离线下载功能。

## 校验值

SHA-256：

| 文件 | SHA-256 |
|---|---|
| `earth-day-ultra.jpg` | `959af4f265e07b7bbba09d9c95e96e0f32987fa16e5538287e7945fc670f8ec3` |
| `earth-day.jpg` | `bd8f9b7988d4e5779619ec6ae073d53e9cca87d08ad3e833802f39777c3f6162` |
| `earth-day-4k.jpg` | `68a4b672e75038ff57a5bb17cf3a43f337a29d7f614aed1dca82499f5c6877c9` |
| `earth-day-2k.jpg` | `68f2d544d971a51fac45c979ad7795f3e38be2ce052a91590840e6b395dd6caf` |
| `earth-day-sss-original.jpg` | `88ab060b6e7d241cfc590c69f528fab2b3247b738d40124cb590999a6fe44abc` |
| `earth-night.jpg` | `9894e83a585a22c1c425e7ca4f987a9ba625bf08ecee45d3c9dcacae3c2ad5f7` |
| `earth-night-4k.jpg` | `1083f5e4d102731d9178fbe2f04152d08ae201a42ee0b0c256185ccdf2982dd0` |
| `earth-night-2k.jpg` | `d84396c13b8b82e40ce45f1082113a176e9c319d286549f8d17e6e34a1ac6a28` |
| `earth-clouds.jpg` | `3624f85de1367636fe1b053c65145dd27d16212121a320a828e711a92cf55778` |
| `earth-clouds-2k.jpg` | `4ec1db1a19048b48a38c92c12ed6cdb146584225fdb807ab4dbab36bb0732408` |
| `earth-specular.png` | `63ded7498b2fcf7d5c15bf010346dd2962f832db137189809ad5e86dae83d008` |
| `earth-specular-2k.png` | `81df49058681de6e50bd17ee40f9910b5db65e4a5713758dd70b0c458f8e00ef` |

## 品牌 Logo（2026-10-10）

采用用户指定的第一版生成图 `exec-290c4db5-fc9d-40c6-a9c1-a1473214a270.png`。项目运行资源为 `public/branding/earth-logo.png`；Android 原生副本为 `android/app/src/main/res/drawable-nodpi/earth_brand_logo.png`。两者均为原图逐字节复制，1254×1254 RGBA，549,224 字节，无重绘、裁切、改色或透明度通道修改。UI 只用等比显示、整体 opacity 和 Android drawable 内缩控制呈现，不生成另一款图形。

SHA-256：`10e04ad87e7caa48802bfa328fdb59fbda4ac09050fbf4a00b153ee5ed11745b`。生成器输出文件名为 `exec-290c4db5-fc9d-40c6-a9c1-a1473214a270.png`；仓库中随项目发布的原样副本是 [`public/branding/earth-logo.png`](./public/branding/earth-logo.png)。未跟踪的原始输出副本和检查截图位于被 Git 忽略的 `artifacts/branding/`，不作为仓库链接。透明通道检测和 Android 同步范围见 [Logo 实施记录](./docs/EARTH_LOGO_ROLLOUT_PLAN.md)。

## 2026-10-13：搜索地表名称字体

地表搜索名称按 A 方案改用本地 Source Serif 4 Medium（500、opsz 20）与 Source Han Serif SC Medium（500），均为 OFL 1.1。派生字库分别改名 Earth Latin Serif 与 Earth CJK Serif，中文回退剔除前者已覆盖的可见字符，保留真实空格以兼容 Troika 的空白字符继承；过滤其不支持的 GPOS 上下文辅助/竖排定位，未重绘轮廓或改变字形 advance。字体、完整许可、来源和重建方式见 [public/fonts/README.md](./public/fonts/README.md)。44,234 个回退字符加 919 个 Latin 字库字符，两字库仅空格重叠；未覆盖字符使用本地缺字方框，不向境外字体服务补字。最新实施与验证见 [A 方案记录](./docs/SEARCH_LABEL_ATLAS_PLAN.md)，原始三维化记录见 [三维名称计划](./docs/SEARCH_LABEL_3D_TYPE_PLAN.md)。
