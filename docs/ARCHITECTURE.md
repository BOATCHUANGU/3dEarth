# Earth 架构基线与实施规则

更新：2026-10-14。本文记录当前实现、架构边界与后续扩展约束。当前产品是 Web 与 Capacitor Android 共用的交互式 WGS84 地球；地形、三维建筑和街景尚未实现。

## 模块与依赖方向

| 层 | 现有入口 | 职责与边界 |
| --- | --- | --- |
| 启动与平台 | `src/main.ts`、`app/NativeWindow.ts`、`android/` | 平台窗口、安全区、原生启动交接；业务层不散布原生平台判断 |
| 应用交互 | `app/App.ts`、`CitySearch.ts`、`city-search.worker.ts` | UI、搜索与用户意图；通过渲染入口控制地球，不直接维护 GPU 对象 |
| 场景编排 | `earth/EarthRenderer.ts` | 组合相机、地球、图层、入场和渲染循环，处理生命周期；算法留在所属模块 |
| 地理与相机 | `geo/*`、`camera/CameraController.ts` | WGS84 换算、局部坐标、轨道控制及飞行状态；地理数学不依赖 DOM |
| 呈现 | `earth/EarthMaterial.ts`、`EarthOutputPass.ts`、`SunLightController.ts`、`layers/*` | 地表、光照、瓦片、临时名称等对象与资源；共享地理和相机契约 |
| 网络策略 | `network/*`、`layers/TileSources.ts` | API 地址、线路偏好、来源选择与有限诊断；质量与网络排队分离 |
| 同源服务 | `server/tile-relay.mjs`、`tile-transport.mjs`、`serve.mjs` | 来源白名单、请求校验、缓存、去重与上游失败处理；不做任意 URL 代理 |
| 内容与交付 | `public/`、`scripts/`、`docs/` | 字体/城市索引/许可、生成及验证脚本、版本与证据记录 |

主调用链：平台准备 → App → EarthRenderer → 相机和图层 → 渲染。搜索链：UI → 城市 Worker 或坐标解析 → focusLocation → 相机飞行状态 → 名称生命周期。瓦片链：相机视野 → Mercator LOD/来源选择 → 加载队列 → 同源服务或明确配置的直连 → 局部几何与纹理。

## 不变量与接口契约

1. 地理坐标统一为 WGS84：经纬度为度、椭球高为米；世界坐标为 `(ECEF.x, ECEF.z, -ECEF.y) / 6378137`。投影、法线和贴地计算复用 `geo`，不私建球半径或混用海拔基准。
2. 在线瓦片使用 Web Mercator XYZ，极区保留全球底图；瓦片顶点相对局部中心存储。现有局部精度方案不能被描述为完整场景原点迁移。
3. 飞行进度和到达以 CameraController 的实际状态为准。文字等待、显隐与取消不得用独立定时器猜测到达；字体异步结果不能覆盖后续搜索。
4. 最新地表文字为 Troika SDF 单网格，采用本地 Cinzel Medium 500 + Source Han Serif SC Medium 500；按 WGS84 地理锚点及东/北方向贴合椭球曲面。脚本字距、一次性安全宽度拟合、墨色适配和 fit 后的放大渐隐以 `SEARCH_LABEL_CINZEL_PLAN.md` 为当前交付基线。Atlas、Source Serif 4 和 DOM 投影均为历史阶段，不代表当前字体或布局。
5. GPU 几何、材质、纹理和异步任务由创建模块释放；重新搜索、取消、重置、后台、上下文丢失、销毁和减少动态需逐项明确行为。引入新的共享生命周期抽象前先找到重复实现及实际缺陷。
6. 网络缓慢只影响排队、超时、重试和回退，不静默降低用户当前视图画质。缓存、来源冷却与取消逻辑优先复用现有 transport。
7. Node 服务保管服务器凭据；VITE 配置均视为公开客户端信息。诊断不输出密钥、完整请求 URL 或用户位置。
8. Web 与 Android 复用功能代码；资源同步、APK 构建、模拟器验收和真机验收分别记录，不能相互代替。

## 扩展与底层框架策略

保留 TypeScript、Vite、Three.js、自定义 WGS84 渲染、Capacitor 与现有 Node 服务。当前初始化不引入替代引擎、全局事件总线、状态库或全量目录迁移。

- 新图层：先明确坐标基准、父级变换、更新输入、可见性、资源所有权与销毁路径，再实现最小接线。出现第二个真实复用场景后再提取公共接口。
- 新来源：同时修改 TileSources 与服务端白名单，明确投影、层级、署名、许可、失败回退和测试夹具。
- 新平台能力：优先隔离到平台适配边界，避免 App 和渲染循环分别重复平台判断。
- 性能优化：先采集场景、资源大小及 CPU/GPU 证据，再制定预算；现有大 chunk 提示与约 16.67 MiB CJK 字体是待评估项，不因初始化擅自削减字库。
- 地形/建筑：单独立项，先确定高程基准、局部精度、相机地面距离、瓦片缝隙、遮挡和数据授权，再安排实现。

## 验收与当前状态

每项任务定义输入、输出、修改范围、失败路径和验证证据。数学/状态改动跑针对性单测；功能交付执行类型检查与生产构建；视觉和 shader 改动追加真实浏览器检查；服务改动追加 relay 验证。已有检查通过且代码未改变时不为形式重复完整矩阵。

截至 2026-10-14，Sol 的 Cinzel 交付记录报告 160 项单测、Web 类型检查与生产构建、Edge 桌面/手机/减少动态检查，以及 WGS84 曲面 GPU 与遮挡检查通过；Android 字体资源已同步。此后 Luna 按用户要求构建并记录本次 debug APK。debug 签名和 APK 构建不能替代 Android 真机/模拟器验收、正式签名或商店审核。当前提交与 APK 发布状态见 `COORDINATION.md`、`APP_RELEASE_PLAN.md` 和 `GIT_VERSIONING_PLAN.md`。
