# Android 16 手机与平板适配计划

> 2026-10-10 品牌更新：原生蓝色旋转图已换成选定白灰 PNG，保留退出淡出；共用 WebView 同步新 Logo。已重新构建 APK，本次未进行 Android 端检验。[新构建与 Web 检验记录](./EARTH_LOGO_ROLLOUT_PLAN.md)取代下文旧 APK 校验值；下文设备结果仅属于 2026-10-09 版本。

## 完成记录（2026-10-09）

**代码实现与 debug APK 已完成；API 36 真机及真实平板/折叠屏验收待执行。** 下文保留原计划与实施前现状，当前交付以本节和[验证记录](./ANDROID16_VALIDATION.md)为准。

- 已实现深色原生地球启动图与轻微旋转、WebView 首帧交接、系统减少动画同步、浅色系统图标与边到边安全区。
- 已实现 Android 专用窗口自适应：48 px 触控按钮、手机横竖屏、宽屏/短窗口布局、弹层滚动及横屏键盘避让；旋转与窗口变化保留现有相机和搜索状态。
- `npm run android:apk` 构建成功；当时生成的 APK 为 42,577,106 字节。APK 路径 `android/app/build/outputs/apk/debug/app-debug.apk` 被 Git 忽略，且已于 2026-10-10 被新版 Logo APK 覆盖，旧二进制不随仓库发布。旧 APK SHA-256：`BA93082F82B26E5D7E133BB9E5D7B086EAEFB42894C6721CF37B8309F7D5E78B`。
- 130 项单元测试和 9 组 Edge 布局检查通过；在现有 API 37 手机模拟器完成冷启动、减少动画、横竖屏、软键盘、后台恢复与全屏检查。API 37 结果不能替代 API 36 验收。
- 未实测场景、复现命令、变更文件和本地证据详见[交付与待验清单](./ANDROID16_VALIDATION.md)。本轮未改变地图来源、瓦片算法或清晰度策略。

## 目标

完善 Earth Observatory Android App 的启动动画、系统栏与边到边显示，并让现有地球浏览界面在手机、平板、折叠屏和可调整大小的窗口中保持完整、易用。重点解决启动时白屏转黑、启动阶段缺少品牌画面，以及状态栏无法融入黑色界面的问题。

本计划交由 Astra 在现有 Vite + Capacitor 项目中实施。Android 16 适配以 API 36 为基线；不改变 Web 端现有视觉和地图能力，除非修复 Android 共用布局确有必要。

## 仓库现状

- `android/variables.gradle` 已设置 `compileSdkVersion = 36`、`targetSdkVersion = 36`、`minSdkVersion = 24`，Android 16 的目标 SDK 无需再升级。
- `android/app/src/main/res/values/styles.xml` 的启动主题继承 `Theme.SplashScreen`，但引用现有 `splash.png`。
- 启动画面资源 `android/app/src/main/res/drawable/splash.png` 是白底的 Capacitor 默认标志；`capacitor.config.ts` 和网页背景使用深色 `#080d14`。两者不一致会造成启动时白色闪屏。
- `MainActivity` 当前只继承 `BridgeActivity`；Gradle 已包含 `androidx.core:core-splashscreen`。
- 清单未锁定屏幕方向。网页已有手机与窄屏断点，但需检查 Android 系统栏安全区，以及平板宽屏和窗口动态缩放。

## 实施内容

### 1. 状态栏、导航栏与边到边布局

- 按 Android 16 的边到边规则适配：让应用背景绘制到状态栏和导航栏下方，状态栏区域与页面深色背景连续，白色状态图标保持清晰。
- 不依赖 Android 15/16 上失效或受限制的旧式系统栏着色/退出边到边方式。检查 Capacitor、Activity 和 WebView 的窗口配置，避免重复应用 inset 或使用互相冲突的系统栏设置。
- 为顶部操作区、底部控件和弹层正确处理状态栏、手势导航栏、三键导航栏及屏幕开孔安全区。内容可以延伸到系统栏下面，但交互控件不能被遮挡。
- 页面和系统栏背景统一使用 `#080d14`；根据实际系统栏背景设置浅色状态栏图标，并使导航栏在手势与三键模式下都协调。
- 使用 CSS 安全区变量或 Capacitor/Android WindowInsets 提供的等效机制。旋转屏幕、改变窗口尺寸后重新计算安全区。

### 2. Android 原生启动画面与地球进场衔接

- 用深色启动背景和简洁的地球品牌图形替换白底 Capacitor 默认启动图；同步启动主题和 Capacitor 启动背景色，消除白转黑闪变。
- 加入克制的图标动画，例如地球轻微自转、亮度呼吸或淡入；遵循 Android 启动画面资源格式和时长建议，动画不超过约 1 秒，不添加无意义的固定等待。
- WebView 首帧及基础界面稳定后再执行原生启动画面的退出淡出。地球贴图未加载时，先显示深色底和可交互的基础界面，不要让启动层等待在线瓦片。
- 与现有网页地球进场动画协调，避免原生图标动画和整颗地球同时重复放大/旋转。尊重系统减少动态效果设置，减少动态效果时使用静态图标和短淡出。
- 验证冷启动、热启动和从后台恢复时的表现，避免重复播放完整入场动画或短暂露出白色画面。

### 3. 手机、平板与窗口自适应

- 按应用窗口可用宽度和高度设计响应式布局，不依赖设备型号、固定方向或固定宽高比。Android 16 上，目标 API 36 的应用在最小宽度至少 600dp 的设备上不能依赖方向、比例或不可调整大小等限制维持旧布局。
- 手机竖屏：地球保持居中，顶部搜索、底部与浮动控件避开安全区，窄屏下文字和按钮不互相挤压。
- 手机横屏：根据可用高度收紧留白和面板尺寸，保证地球、搜索和主要控制仍可操作。
- 平板竖屏与横屏：利用增加的空间放大地球或分离控制区与地球视口；限制面板最大宽度，避免控件散落在过宽屏幕两端。
- 支持折叠/展开、分屏、多窗口和 Android 16 桌面窗口拖动缩放；尺寸变化时保持地球位置、搜索状态和当前视角，不发生裁切、重叠或意外重置。
- 检查触控尺寸、键盘弹出时的搜索弹层、图层/时间面板以及全屏切换。

### 4. 验收与交付

- 生成 Android debug APK，并记录构建结果、改动文件和任何未解决问题。
- 尽可能在 Android 16/API 36 手机和平板模拟器或真机上验证；如环境没有可用设备，明确列出未能实测的场景，提供可复现的手动验收步骤。
- 覆盖冷/热启动、竖屏/横屏、手机/平板宽度、分屏缩放、状态栏安全区、手势/三键导航、系统减少动态效果和键盘弹出。
- 验收标准：启动期间无白色闪屏；状态栏看起来为连续的深色背景且图标可读；关键控件不被系统栏遮挡；启动过渡自然且不延迟首屏；手机和平板各窗口尺寸下界面不重叠、不裁切，核心地球操作可用。
- 实施结束后更新本计划为完成记录，并给出 APK 路径及实际验证范围。

## Android 官方规范

- [Android 16 行为变更：面向 API 36 的应用与边到边显示](https://developer.android.com/about/versions/16/behavior-changes-16#edge-to-edge)
- [边到边布局指南](https://developer.android.com/develop/ui/views/layout/edge-to-edge)
- [Android 自适应布局与窗口大小类别](https://developer.android.com/develop/ui/views/layout/use-window-size-classes)
- [Android 启动画面及动画规范](https://developer.android.com/develop/ui/views/launch/splash-screen)
