# 手机 App 发布需求

更新时间：2026-10-14
状态：Android Capacitor 工程与网络配置已接入。2026-10-14 大标题版本已在本机离线构建 debug APK；尚未做 Android 设备验收。最新 APK 计划作为独立 GitHub 预览版发布，旧版 `app` release 保持不变。应用标识仍为临时包名，地图公网服务未部署；debug 包不作正式签名、设备验收或商店发布声明。

## Android debug APK（2026-10-14，28px Cinzel 历史基线）

- 源码提交：`bb60f93a6679989e84803693dcbbe82ad1f32f58`；构建命令：`npm run android:apk`（Android Vite mode + Capacitor sync + Gradle `assembleDebug`）。
- 产物：`Earth-Observatory-Android-Debug-Preview-2026-10-14.apk`，61,183,178 字节；SHA-256：`C129A5B359839D6672D286C57B18B32DB565FD7B02DD637FF159B5F896634495`。构建输出和副本均被 Git 忽略。
- `aapt dump badging` 核对 applicationId `com.example.earthobservatory`、versionName `1.0`、versionCode `1`、minSdk `24`、compileSdk `36`；`apksigner verify` 成功，使用 Android Debug 证书（APK Signature Scheme v2）。
- 当时 Cinzel 与 CJK 字体打包资源哈希与仓库源文件一致；本地只有 `.env.example` 和 `.env.android.example` 模板，未配置公网瓦片 API。该包支持随包全球地球与离线城市搜索；在线城市影像不可用。后续大标题版本更新了前端/字体资源，未重新生成 APK。
- 未在模拟器或真机安装/检验。该 debug 包仅作试装预览；临时 applicationId、debug 签名、服务端点和影像授权范围仍未达到正式 App 商店发布条件。它保留在历史 GitHub 预览版 [app](https://github.com/BOATCHUANGU/3dEarth/releases/tag/app)，不包含后续大标题更新。

## Android debug APK（2026-10-14，大标题版本）

- 构建：先运行 `npm run android:sync`，再在 Windows 设置 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 并运行 `android/gradlew.bat --offline assembleDebug`。TypeScript、Android Vite 构建、Capacitor 同步及 Gradle 构建均成功；Gradle 使用本机缓存，未下载依赖。
- 产物：`android/app/build/outputs/apk/debug/app-debug.apk`，61,313,690 字节；SHA-256：`9F6657EF98CEA9C370771F84DF273806B585EAD9997591132249C7045AB64500`。APK 被 `.gitignore` 排除，不进入源码提交。
- 包信息：`com.example.earthobservatory`，versionName `1.0` / versionCode `1`，minSdk `24`、targetSdk/compileSdk `36`。`apksigner verify` 成功，Android Debug 证书，APK Signature Scheme v2。
- 本机没有 `.env.android.local` 或 `.env.local`，未配置公网地图 API；全球底图和随包城市索引可用，在线城市影像不可用。未在模拟器或真机安装/检验。
- 上传目标：新建独立预览版 `preview-app1.0-grand-title-2026-10-14`（tag `app-grand-title`），保留已有 `app` tag/release。发布后补入 GitHub Release 链接及源码提交哈希。

## 本轮 Android APK 实施（2026-10-05）

本轮先交付可维护的 Android 壳与构建流程。`@capacitor/core`、`@capacitor/android`、`@capacitor/cli` 锁定 **8.5.2**。`capacitor.config.ts` 的 `webDir` 为 `dist`，未设置远程 `server.url`，前端、全球纹理及城市索引经 `cap sync` 复制进 App。Android 工程已生成在 `android/`，模板要求 Android SDK 36、JDK 21，最低 Android API 24；能安装不代表已通过真实设备 WebGL/性能验收。

**临时身份**：`com.example.earthobservatory` / `Earth Observatory`，版本 `1.0`（code 1）。当前图标与原生启动页为 Capacitor 模板。正式发布前确认包名、名称、图标与签名；已发布后更改 applicationId 会成为另一应用。改名需要同时调整 Capacitor 配置、Android `applicationId`/`namespace`/Java 包路径及 `strings.xml`，不能只改一处。

分工：Astra 配置工程、客户端 API 地址、服务端 CORS 与文档；Sol 执行源码审查、构建与可执行测试并记录结果。Astra 阶段只生成原生工程，没有运行测试、生成 APK 或宣称手机实测通过。CLI 创建工程时复制的是已有 `dist`，必须先执行下方同步命令，避免打入旧网页。

### 安装依赖与构建调试 APK（Windows）

```powershell
npm ci
# 按需复制配置；没有正式接口时可直接生成仅本地资源可用的样机。
Copy-Item .env.android.example .env.android.local
# 编辑 .env.android.local 后：
npm run android:apk
```

`android:apk` 顺序执行 TypeScript 检查、`vite build --mode android`、`cap sync android`、Gradle `assembleDebug`。成功后文件位于 `android/app/build/outputs/apk/debug/app-debug.apk`，使用 Android debug 签名，可用于安装测试，不是正式发布包。该脚本使用 Windows `gradlew.bat`；其他系统可先 `npm run android:sync`，然后在 `android/` 执行 `./gradlew assembleDebug`。

构建需要可用的 Android SDK 36、Build Tools 和 JDK 21。若终端找不到，可仅在当前 PowerShell 会话设置以下路径（以本机实际安装位置为准）：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
npm run android:apk
```

这些命令不会安装 SDK。也可在 Android Studio 中为 Gradle 选择自带 JDK，并在本地 `android/local.properties` 配置 `sdk.dir`（该文件已忽略）。首次构建需要下载 Gradle 与 Android Maven 依赖；这类下载失败应单独记录为环境/网络阻碍。无需模拟器即可生成 APK；设备测试可用 USB 真机，模拟器可选。

其他命令：

| 命令 | 用途 |
|---|---|
| `npm run build:android` | 用 Android 模式重建 `dist`；不运行 Node 服务。 |
| `npm run android:sync` | 重建网页并同步至 Android 工程。 |
| `npm run android:open` | 先同步，再打开 Android Studio。 |
| `npm run android:run` | 先同步，再经 Capacitor 选择已连接真机或已有模拟器运行。 |
| `npm run build` / `npm run dev` | 继续使用原浏览器生产/开发模式。 |

Android 和浏览器构建共用 `dist`；切换交付目标时重新执行相应构建。不要将 Android 模式下配置的远程 API 与普通网页生产构建混淆。

Android 的 asset 合并会把 `cities.json.gz` 视作 `cities.json` 的预压缩版本，因此两者同时存在会触发重复资源。Android 工程通过 `ignoreAssetsPattern` 仅排除包内的 `cities.json.gz`，保留完整 `cities.json`；网页 `public/` 与 `dist/` 的两个文件不变。搜索 Worker 已有压缩资源读取失败后回退 JSON 的逻辑，在 App 中使用该回退，不改变索引数据或网页行为。APK 自身仍会压缩所打包的资源。

### 地图接口配置与无接口时的行为

`VITE_API_BASE_URL` 是公开的构建期配置，只接受绝对 HTTPS 地址，可含部署路径前缀，拒绝用户名、密码、查询参数或 hash。例如 `https://maps.example.com/earth/` 只是地址格式示例，并不是本项目已部署服务；程序会在其后拼接 `__earth/network` 与固定格式的 `__tiles/{source}/{z}/{x}/{y}`。如有路径前缀，反向代理须去掉该前缀后转发到当前 Node 服务。

- 普通网页未填此值时继续使用 Vite `BASE_URL` 下的同源服务；浏览器 dev/preview/serve 工作流保持不变。
- Capacitor 原生 App 未填此值或填写非法地址时，不向 App 本地 `https://localhost` 请求 Node 接口，不发在线瓦片请求。全球地球、随包城市搜索与坐标跳转仍可用；图层设置会说明在线地图服务尚未配置。近距离不能据此声称有高清细节。
- `VITE_DIRECT_TILES=true` 仍是显式的直连选择，需独立确认供应商 CORS、App 许可与中国网络可达性。首版不自动切换成直连规避接口配置。
- `.env.android.local` 可隔离手机配置，但 Vite 同样会读取通用 `.env` / `.env.local`；不要在通用配置里留下无意继承的远程接口或直连模式。`VITE_` 值随包公开，禁止写服务端秘密。

正式 Node API 服务需配置 `EARTH_ALLOWED_ORIGINS=https://localhost`，允许 Android Capacitor 的本地页面 origin；多个已授权 HTTPS origin 用逗号分隔。此 `localhost` 只是 App 页面来源，**地图 API 的目标仍必须是公网 HTTPS 地址**。该 CORS 配置只影响两类 API 路由，不允许 `*`、不启用 cookie 凭据，并暴露缓存/重试所需响应头。Origin 白名单不等于鉴权或限流，生产反向代理仍须配置容量保护。服务端继续只允许内置数据源和合法瓦片坐标，不提供任意 URL 代理，也不伪造客户端 Referer。

本轮没有部署 HTTPS 服务，没有取得新地图凭据或供应商授权，因此不能将 APK 封装完成视为在线地图已可用。`TIANDITU_TOKEN` 仅保留在 Node 服务端；原有客户端 token 只能使用允许公开、受限制的凭据。

### 正式签名与分发

先 `npm run android:sync`，再在 Android Studio 使用 **Build → Generate Signed App Bundle or APK**，选择 APK（安装分发）或 Android App Bundle（商店渠道按要求使用）。使用用户管理的正式签名密钥，妥善备份，后续更新保持同一签名与 applicationId 并增加 versionCode。未配置签名时单独执行 `assembleRelease` 不会自动得到可正式分发的签名包。

本轮不创建 release keystore、不保存密码、不生成正式签名配置；`.jks`、`.keystore`、`keystore.properties` 已加入忽略规则。暂不创建 iOS 工程。

### 本轮后续交接

Sol 负责确认生产网页构建与 Android 同步、Gradle APK 构建、接口地址选择/非法配置、未配置接口时的本地资源行为，以及允许/拒绝来源的 CORS。设备连接可用时验证安装启动、WebGL、触控和前后台；没有设备时应明确列为未测，浏览器模拟不能替代真机。地图公网端点、中国运营商网络、实际性能/温升、正式身份/图标/签名及应用发布仍需后续完成。

官方参考：[Capacitor 环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)、[Capacitor 配置](https://capacitorjs.com/docs/config)。

## 推荐方案（初步设计）

### 结论

建议先用 **Capacitor 将现有 Vite + TypeScript + Three.js 网页封装成 Android / iOS App**，而不是迁移到 Flutter 或重写原生 3D 渲染。Capacitor 支持接入已有现代 JavaScript 项目；Three.js 当前 `WebGLRenderer` 使用 WebGL 2，因此这条路线能够最大限度复用现有地球场景、相机、城市搜索、图层和地图瓦片逻辑。

该路线的可行性为**较高**。应用视觉和地球功能可大部分复用，但手机端不应被视为桌面版的等比例缩小：触控、安全区、生命周期、显存、功耗和在线地图服务都需要专门适配与实体设备验证。封装器本身不能解决大陆网络下的瓦片可达性，也不能替代地图来源授权。

### 目标架构

1. **App 内置前端**：将 Vite 生成的静态资源与 NASA 全球地球底图、城市搜索索引一同打入安装包。App 可独立启动，不加载开发电脑网页，不依赖局域网，也不要求首次启动时下载完整前端。
2. **轻量原生容器**：Android 与 iOS 使用同一套 Web 前端，通过 Capacitor 提供启动页、状态栏/安全区、返回行为、应用前后台生命周期等平台衔接。第一阶段不新增复杂原生界面。
3. **独立公网地图服务**：App 内前端通过 HTTPS 访问正式地图接口。当前默认的 `BASE_URL/__tiles/...` 假设前端同源服务器同时运行 Node 瓦片转发；打入 App 后本地资源目录不会自动提供这个 Node 服务，必须改成可配置的公网 API 地址，或有依据地选择可由客户端直连的数据源。
4. **固定来源的瓦片转发**：如果使用服务端转发，只允许项目明确配置的来源、图层和合法瓦片坐标；加入缓存、超时、并发/频率限制、健康状态和故障回退，不做任意 URL 代理。天地图等服务所需凭据不能假设在 App 包内保密；优先核实服务条款，再决定用受限客户端凭据还是服务端转发。
5. **地区与网络设置**：保留自动 / 中国 / 全球线路选项和用户手动覆盖。时区、语言只能作为弱提示，不能视作实际所在地区；不要为了选择地图线路而强制申请 GPS 权限。线路状态、无网络和地图服务失败应有简短、可重试的反馈。

### 手机端交互与渲染

- 纵向作为主要布局，横向保持可用；支持单指旋转、双指缩放，控制按钮避开刘海、底部手势区和系统栏。界面沿用当前精简方向，避免把桌面所有面板原样搬到手机。
- 后台时暂停动画和连续渲染，返回前台后恢复状态；处理 WebGL 上下文丢失、屏幕旋转、来电/切后台后恢复和网络中断重试。
- 现有桌面画质策略优先清晰度，含 12K 纹理和高像素比渲染。移动版需先建立单独的性能档：测量真实设备上的首帧时间、帧率、GPU 纹理内存、持续发热和耗电，再确定像素比上限、纹理渐进加载/回退与最低设备要求。不要仅凭 GPU 报告的最大纹理尺寸判定设备可承受完整材质。
- 可把“定位到我”作为后续可选原生能力：用户主动点击后才请求定位权限，拒绝权限时搜索和手动操作仍完整可用。首版不要求定位、推送或后台定位。
- 全球底图和城市搜索索引可随包工作；街道/卫星瓦片依赖网络。首版不承诺离线城市地图，不批量下载瓦片。无网络时保留可交互的全球地球，并说明在线细节暂不可用。

### 可行性与主要限制

| 项目 | 判断 | 说明 |
|---|---|---|
| 复用现有地球与 UI | 高 | Three.js、相机控制、城市索引和图层逻辑主要为 Web 技术，可继续共用。 |
| Android App | 高 | 可用 Capacitor 生成原生 Android 工程；需 Android Studio、Android SDK 和真机验证。 |
| iOS App | 高（有 Mac 条件） | 可用 Capacitor/WKWebView 承载；本地构建与调试需要 macOS 和 Xcode，Windows 不能直接完成 iOS 本机签名构建。 |
| 桌面同等性能 | 不保证 | GPU、WebView 和散热能力因设备而异；须先做中低端手机性能样机，设定清晰的最低支持范围。 |
| 中国大陆地图加载 | 中 | 取决于公网 API 部署位置、服务商可达性、凭据和配额、坐标基准、许可与地图数据合规；打包 App 不会自动改善网络。 |
| 应用商店上架 | 可行但需产品化 | 除功能与签名外，必须解决地图许可、隐私与应用资料。Apple 要求 App 有超出简单网站封装的功能与体验；当前独特 3D 地球、随包全球底图和离线城市索引有帮助，但不构成审核保证。 |
| Flutter 原生重写 | 当前不建议 | 若 Flutter 仅嵌 WebView，仍是网页渲染且额外维护另一层壳；若要原生重写，则需重做 Three.js 场景、GLSL 材质、瓦片 LOD 和交互，成本显著增加。仅当实机验证显示 WebView 方案无法达到目标性能时再重新评估。 |

### 分阶段实施

1. **确认发布目标**：先定 Android / iOS 范围、内测或商店分发、最低设备档位、是否商业使用及地图许可范围。
2. **做移动性能样机**：对现有构建增加最小 Capacitor 壳，在至少一台中档 Android 和一台目标 iPhone 上验证启动、WebGL 2、触控、12K 材质加载、前后台恢复和长时间温升。此阶段用于决定是否继续复用 Web 渲染，不先迁移框架。
3. **建立 App 网络配置**：将静态资源与地图 API 地址解耦；部署可从目标地区访问的 HTTPS 配置/瓦片服务，验证天地图及全球数据源在目标网络下的可达性、授权、配额、坐标与署名。
4. **完成移动体验**：适配安全区、竖横屏、触摸目标、状态栏和系统返回；增加后台暂停与恢复、断网状态和 WebGL 错误恢复。按设备实测结果确定移动纹理与渲染档位。
5. **发布验收**：分别生成 Android 与 iOS 签名包，在真实网络和设备上验收地图、城市搜索、瓦片失败回退、许可/署名、隐私说明与耗电/发热；然后走所选内测或商店流程。

### 当前工作站的发布条件

当前项目位于 Windows 工作区。Android 开发和构建可在 Windows 安装 Android Studio 与 SDK 后进行；iOS 的本地构建、签名和实机调试需要 Mac + Xcode，若没有 Mac，需要配置受控的 macOS 云构建，并仍安排 iPhone 真机验收。Capacitor 8 官方环境要求 Node.js 22 或以上，当前项目建议的 Node.js 24 满足这一项。

### 仍待用户决定

- 首发只做 Android，还是 Android 与 iOS 同步。
- 先内部安装包/测试分发，还是目标为公开商店。
- App 是否只限个人与非商业使用；若计划商业发布，先替换或取得满足发布范围的影像许可。当前 EOX 2025 来源标注为 CC BY-NC-SA 4.0，仅供个人/非商业用途。
- 最低支持设备与地区；特别是大陆线路使用天地图所需的正式凭据、可公开分发授权和公网服务部署方式。

## 目标

把现有 3D 地球做成用户可安装、可独立启动的手机 App，并按选定渠道分发。用户无需保持开发电脑运行，也不需要手机和电脑连接同一 Wi-Fi。此需求取代此前“通过局域网访问电脑上的 Vite / Node 服务来让手机运行”的临时预览方式。

## 当前项目状态

- 项目为 TypeScript、Vite、Three.js 浏览器应用，现已增加 Capacitor Android 工程；尚无 iOS 工程、正式签名配置或商店提交记录。当前搜索文字版本的 Web/Android 同步状态见 `SEARCH_LABEL_GRAND_TITLE_PLAN.md`；上方 APK 为旧 Cinzel 基线，不包含最新大标题实现。
- `npm run dev` 用于电脑本地开发；`npm run serve` 用于生产预览和 Node 部署。二者都不能作为正式 App 的在线服务地址。
- NASA 全球地球纹理已随前端资源打包。城市细节通过在线 EOX、GSI、USGS 和 OSM 瓦片加载；断网时可看全球底图，不能离线查看城市瓦片。
- 默认生产 Node 服务同时托管前端资源并转发 `/__tiles`。正式 App 需要可公网访问的 HTTPS 服务，或另行确定 App 内资源与远程地图 API 的跨域架构。
- 默认 EOX 2025 数据源限个人和非商业用途。公开分发 App 前须确认用途符合许可，保留所有图层署名，或更换有相应授权的数据源。

## 发布前需要确定

1. **目标平台和分发方式：** Android、iOS 或两者；支持的最低系统版本；内部测试、私下分发或公开商店。
2. **封装技术：** 先评估复用现有 Web 客户端的移动容器方案。验证 WebGL 2、触控、纹理内存、前后台切换、应用商店要求后，再决定复用 Web 渲染或改用原生渲染。
3. **前端交付方式：** 选择把前端静态资源打入 App，或让 App 通过 HTTPS 加载受控的线上前端。无论哪种方式，都不得依赖开发服务器或局域网 IP。
4. **地图服务部署：** 确定线上 `/__tiles` 服务域名、HTTPS、可用性和运维方式；在 App 环境核对来源识别、Referer / User-Agent、CORS、缓存和地图供应商条款。不能将本地 Node 转发进程或任意 URL 代理打包成客户端功能。
5. **应用资料：** 确认名称、图标、启动页、应用标识、隐私政策、支持联系方式、版本策略、签名证书和开发者账户。

## 实施要求

### App 与地球功能

- 在真实目标手机上支持启动、触控旋转与缩放、城市定位、图层选择、方向变化、切换到后台后恢复，以及 WebGL 上下文错误提示。
- 全球地球纹理随包提供。无网络或地图服务失败时仍显示全球地球，提供明确状态与重试入口；产品文案说明在线城市瓦片需要网络。
- 按真实设备检查 WebGL 2 支持、最大纹理尺寸、12K 纹理解码内存、首屏耗时、发热和长时间运行稳定性。若设备无法稳定运行当前最高档，先形成明确的兼容策略，再实施和记录，不以 GPU 最大纹理尺寸推断设备必然有足够内存。
- 屏幕安全区、状态栏、导航栏、全屏和横竖屏行为需按目标平台验收。

### 在线服务与授权

- 地图服务必须从 App 可访问的公网 HTTPS 地址提供。配置、健康检查、日志、限流与服务失败提示要适合真实用户使用。
- 按来源许可保留地图署名，不做公共瓦片批量下载、离线包或未授权缓存。EOX 2025 的非商业限制应纳入发布范围判断。
- `VITE_ARCGIS_API_KEY` 属于客户端公开值，只能使用有来源和权限限制、允许公开的 token；任何服务端秘密都不得写入客户端包。
- 若面向中国大陆发布，按[中国网络地图加载计划](./CHINA_NETWORK_PLAN.md)评估国内可达的授权数据源、响应性能、坐标系和地图发布检查要求。
- 不把真实应用冒充成浏览器网站来伪造请求头。针对 OSM 等来源，应核实 App 请求方式和身份标识符合其当前政策；必要时替换数据源或使用获授权的服务。

## 发布验收

- 安装包可在干净手机上安装并启动，不需要连接开发电脑或同一局域网；所有在线端点均为正式 HTTPS 地址，不残留 `127.0.0.1`、`localhost` 或临时开发地址。
- 在每个目标平台的实体设备上完成启动、地球操作、城市瓦片、署名、后台恢复、网络中断 / 恢复和低纹理能力设备验收。
- 在许可允许的用途下验证默认地图来源；数据源不适用时已切换为可发布来源。
- 包含可查看的隐私、许可及支持信息，应用签名、版本号、图标与商店资料完整。
- 生成并验证对应渠道的正式安装包，记录平台、版本、设备覆盖、已知限制和提交状态。

## 后续顺序

1. 确认平台、分发渠道和许可范围。
2. 做移动容器与 WebGL 2 的实体机可行性验证，选定 App 和在线服务架构。
3. 部署 HTTPS 地图服务，接入可发布的数据源和 App 正式配置。
4. 完成触控、生命周期、内存、离线底图与错误恢复适配。
5. 执行实体机验收，生成安装包并按所选渠道测试分发或提交。

相关项目阶段记录见 [PROJECT_PLAN.md](../PROJECT_PLAN.md)，当前浏览器运行与服务说明见 [README.md](../README.md)，地图来源许可见 [IMAGERY.md](./IMAGERY.md)。
