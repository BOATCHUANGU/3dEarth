# Android 自适应与启动交付记录

> 历史记录：下文为 2026-10-09 的旧蓝色启动图版本。2026-10-10 已替换为用户选定的白灰 Logo，并重新构建覆盖同路径 APK；本轮 Android **未检验**。新产物、校验值及范围见 [Logo 实施记录](./EARTH_LOGO_ROLLOUT_PLAN.md)，以下旧 APK 校验值和设备结果不能用于新产物。

日期：2026-10-09。实现基线为 compile/target SDK 36，最低 SDK 24。代码与 debug APK 已完成；API 36 真机、实体平板及折叠屏验收仍待执行。本文区分浏览器布局模拟与 Android 系统实测，不将窗口尺寸模拟视为对应设备认证。

## 已交付

- 原生启动主题、WebView 与网页背景统一为 `#080d14`。用项目自绘蓝色地球矢量替换启动主题对默认白底图片的引用；Android 12 及以上使用 700 ms 轻微旋转，旧版本使用静态图标。
- 页面基础 DOM 提交后，通过原生 `postVisualStateCallback` 确认 WebView 绘制，再淡出原生启动页；随后初始化地球资源并衔接既有入场动画。正常流程没有固定等待，也不等待在线瓦片。异常情况下保留原生 4 秒及网页 4.5 秒退出保障。
- 统一系统减少动画与网页减少动态偏好；减少动画时使用静态启动图、立即退出，并省略地球入场及默认自转。恢复前台时同步系统偏好。
- 边到边显示与浅色系统图标；安全区由 Capacitor 8.5.2 内置 SystemBars 处理，避免额外监听器重复添加 inset。配置包含 `viewport-fit=cover` 与键盘 resize。
- Android 专用 CSS 按实际窗口宽高布局，解除旧页面最小高度限制，主要触控按钮至少 48 CSS px；短横屏工具栏重排、面板限高滚动、搜索框避开键盘，宽屏限制控制区跨度。普通网页不启用 Android 专用样式。
- 保留窗口可调整大小及现有配置变更处理。旋转、窗口缩放时保留相机和搜索状态。

主要文件：`MainActivity.java`、`EarthWindowPlugin.java`、Android 主题/矢量/动画资源、`AndroidManifest.xml`、`capacitor.config.ts`、`index.html`、`src/app/NativeWindow.ts`、`src/android.css`、`src/main.ts`；App、CameraController 和 EarthRenderer 接入启动与动态偏好。

## APK 与构建

- 2026-10-09 旧 debug APK 为 42,577,106 字节，包名 `com.example.earthobservatory`。文件当时位于 `android/app/build/outputs/apk/debug/app-debug.apk`，被 Git 忽略，且已在 2026-10-10 被新版 Logo APK 覆盖，旧二进制不随仓库发布。
- SHA-256：`BA93082F82B26E5D7E133BB9E5D7B086EAEFB42894C6721CF37B8309F7D5E78B`。
- JDK 21.0.10，Android SDK 36；`npm run android:apk` 完成 TypeScript 检查、Vite Android 构建、Capacitor 同步与 Gradle assembleDebug。
- 构建成功；现有 Vite 大包提示与 Gradle flatDir 提示不阻塞产物生成。这是调试安装包，尚未完成正式签名与发布。
- 本轮不部署在线地图服务。安装包内的全球纹理和城市索引可独立使用；在线地图仍依赖 App 发布计划中的公网 API 配置。

## 实际验证范围

| 项目 | 结果与边界 |
|---|---|
| 单元测试 | 8 个文件、130 项通过 |
| Android 构建 | 成功生成并安装上述 APK |
| Edge 154 布局检查 | 9 组通过，脚本记录未捕获页面错误；使用受控瓦片夹具和模拟安全区 |
| Android 系统环境 | 本机唯一可用 Medium_Phone AVD：Android 17 预览版/API 37，1080×2400，SwiftShader；没有 API 36 镜像或实体设备 |
| 手机竖屏、系统安全区 | 原生 WebView 为约 411×914 CSS px，顶部及底部 inset 各 24 px，控件可见 |
| 搜索与软键盘 | 竖屏约 411×578、横屏约 914×150 可用区域；输入框和关闭按钮可用，结果区滚动；旋转保留 Paris 查询及弹窗 |
| 手机横屏、图层面板 | 约 914×411，可展开与关闭，未重置视角 |
| 后台恢复 | Home 后重新打开，地球就绪且相机位置保留；未重复创建完整入场流程 |
| 冷启动、减少动画 | 系统动画倍率 1 与 0 均启动完成；后者默认自转关闭；测试结束恢复原倍率 |
| 全屏 | 实际 WebView 进入与退出均成功 |

布局矩阵为 393×852、320×480、852×393（模拟左侧开孔）、600×500、800×1280、1280×800、420×380、320×320、852×150。检查主要控件/面板/搜索边界及尺寸变化后的相机连续性，不代表真实折叠铰链、系统分屏或桌面窗口实测。

冷启动采样截图显示深色原生图标与深色网页加载界面连续衔接；这是离散截图检查，不能等同逐帧录像证明所有设备均无闪屏。模拟器软件 GPU 的启动耗时不作为产品性能基准。早期日志出现过 Capacitor 在 documentElement 就绪前注入 SystemBars 变量的非致命错误；页面提交后安全区正确，后续交互脚本未捕获页面错误。

## 本地证据与复现

本机证据位于被 Git 忽略的 `artifacts/android16/`，不随源码提交：

本机证据文件名包括 `build.log`、`unit-tests.log`、`layout-results.json`、`device-results.json`、`startup-results.json`、`fullscreen-results.json`、`startup-normal-750.png`、`startup-normal-3000.png`、`device-phone-ready.png` 和 `device-landscape-search.png`，均位于被 Git 忽略的 `artifacts/android16/`，不随 GitHub 仓库发布。

在已配置 JDK 21、Android SDK 36 的环境执行：

```powershell
npm test
npm run android:apk
# 在另一个终端启动本地 4173 服务后运行浏览器布局检查
npm run serve
node scripts/android-layout-check.mjs
```

设备检查要求只连接一个目标设备，安装并启动 debug APK，且允许 adb 与 WebView 调试。通过 `EARTH_ADB` 指定 adb 可执行文件（脚本默认使用当前开发机路径）：

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.example.earthobservatory/.MainActivity
node scripts/android-device-check.mjs
node scripts/android-startup-check.mjs
```

设备脚本会旋转窗口、开关搜索和图层、切后台再恢复，结束后释放旋转锁；启动脚本会强制停止并重启本应用，临时调整动画倍率后恢复。布局脚本固定连接本机 4173，并要求安装 Edge。全屏结果来自本次单独的 CDP 操作，三个脚本不包含该项自动复现。

## 待执行验收清单（可交给 Sol）

1. **Android 16/API 36 手机与平板**：安装上述 APK，录屏冷启动、热启动及后台恢复；逐帧检查白闪、系统图标可读性与原生/地球动画衔接。当前仅 API 37 模拟器通过，不替代本项。
2. **手势及三键导航、实体开孔**：两种导航模式分别旋转；打开搜索、图层、光照与许可弹层，确认按钮不进入系统交互区。三键导航尚未实测，开孔仅浏览器模拟。
3. **折叠屏与真实多窗口**：搜索输入期间折叠/展开、拖动分屏分隔线、调整桌面窗口；确认查询、相机高度/经纬度、图层与光照状态连续。硬件铰链避让尚未验证。
4. **系统版本与 WebView 差异**：API 24–30 静态启动图、API 31+ 动画、旧 WebView inset 回退均待设备实测；特别检查不会重复添加安全区。
5. **系统动态偏好**：在系统设置切换“移除动画”后回到 App，确认入场/自转/云层行为；已测动画倍率 0，厂商设置映射仍待确认。
6. **真实输入法和生命周期**：中文候选条、浮动键盘、硬件键盘、进程被系统回收后重新打开、长时间前后台切换和 WebGL 上下文丢失。当前已测软件键盘 resize 和普通后台恢复。
7. **在线地图与实体 GPU**：配置真实公网服务后检查街道/卫星、网络恢复和高分辨率纹理；本次不作为中国网络加载速度或真实 GPU 性能验收。

每项记录设备型号、Android/WebView 版本、导航方式、窗口尺寸、截图/录像、通过或失败，以及可复现步骤；失败项修复后重新构建并更新 APK 校验值。
