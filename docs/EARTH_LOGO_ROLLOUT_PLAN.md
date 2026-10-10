# 地球 Logo 与 Web / Android 品牌统一

日期：2026-10-10。状态：已实施；Web 已实际检验，Android 已同步并构建，未进行 Android 端检验。衔接 PROJECT_PLAN.md 第 18 节。

## 完成记录

### 原图与设计

选定第一版原图已逐字节复制到 `public/branding/earth-logo.png`；未采用第二版，也未重绘、裁切、改色、去噪或修改 alpha。原图为 1254×1254 RGBA、549,224 字节；四角均为 `(0,0,0,0)`，完全透明像素 1,177,781，半透明像素 387,521，完全不透明像素 7,214。浏览器在深色背景上正确合成低透明度纹理，无白底矩形。

Web、原生 PNG 及同步后的 WebView PNG SHA-256 均为 `10e04ad87e7caa48802bfa328fdb59fbda4ac09050fbf4a00b153ee5ed11745b`。仓库发布的原图副本为 [`public/branding/earth-logo.png`](../public/branding/earth-logo.png)。透明通道检查报告 `asset-inspection.json` 位于本机忽略目录 `artifacts/branding/`，不作为仓库链接。

左上角删除 EARTH / THE LIVING PLANET 可见文字，使用 56×56 CSS px 图像及同尺寸按钮，保留 `EARTH 返回初始视角` 辅助名称、键盘焦点和原 reset 事件。静态图形避免重复转动，悬停/焦点仅提高亮度。加载区共用原图，大小 112×112，保留细进度线和辅助技术加载提示，移除可见中英文启动宣传文案。短横屏单独调整加载内容位置，避免被原有页面最小高度推到视口外。首帧、资源初始化、地球入场、错误恢复逻辑未更改。

### Web 实际检验

先完成 `npm run build` 和 Edge 154.0.4258.62 实际浏览器检查，再修改 Android 原生资源。脚本为 `scripts/branding-check.mjs`，连接 `EARTH_TEST_URL` 或默认本机 4280 服务。瓦片使用受控夹具；加载截图暂缓本地纹理请求，截图后释放，不改变应用代码时序。

| 场景 | 浏览器窗口 / DPR | 结果 |
|---|---|---|
| 桌面 | 1440×1000 / 2 | 通过 |
| 手机竖屏 | 393×852 / 2 | 通过 |
| 手机横屏 | 852×393 / 2 | 通过 |
| 减少动态 | 393×852 / 2 | 通过，默认自转关闭 |

四组均检查图片加载、品牌/加载 Logo 边界、56×56 按钮尺寸、隐藏可见品牌文字、加载结束、键盘焦点及 Enter 返回初始视角、Paris 搜索、图层展开/关闭。页面异常为 0。人工查看实际截图确认线条清晰、比例和背景正确。过渡检查确认加载层退出后地球就绪；未做逐帧时间测量。原有普通 Web 横屏页面仍采用可滚动的最小高度布局，部分地图与工具需要滚动；本次只保证品牌区域不裁切，未扩大为全页面横屏重构。

截图和自动检查结果保存在本机忽略目录 `artifacts/branding/`，不随 GitHub 仓库发布。文件包括 `web-desktop-ready.png`、`web-desktop-loading.png`、`web-phone-ready.png`、`web-phone-loading.png`、`web-landscape-ready.png`、`web-landscape-loading.png`、`web-reduced-ready.png`、`web-results.json`。

### Android 同步与构建（未设备检验）

- 原生 `drawable-nodpi/earth_brand_logo.png` 为同一原图；`earth_splash.xml` 使用带 36dp 四边内缩的 bitmap drawable，保持正方形比例并为系统圆形遮罩预留空间。尺寸依据 [Android 启动图标规范](https://developer.android.com/develop/ui/views/launch/splash-screen)，最终厂商设备表现待验。
- 默认主题、减少动画主题以及 API 31+ 主题统一引用该静态图形。删除旧蓝色矢量动画资源及 700 ms 旋转引用；保留既有原生 180 ms 退出淡出、减少动画时立即退出、首帧协调和超时保障。桌面 launcher 图标没有更换。
- 共用 WebView 资源已由 Capacitor 同步；`npm run android:apk` 成功完成 TypeScript、Vite Android 构建、资源同步、Android 资源编译及 debug APK 打包。现有大包和 flatDir 提示不阻塞构建。
- 本轮 debug APK 位于本机忽略路径 `android/app/build/outputs/apk/debug/app-debug.apk`，大小 43,676,149 字节；SHA-256 `729EC0D6B914BF27F33B4B755B1F315FBFDCD1F40AD285B84C2EF2C710436F28`。构建日志 `artifacts/branding/android-build.log` 同样被 Git 忽略。APK 路径已覆盖上一轮文件，不能使用旧校验值。
- **本轮没有运行 adb、模拟器、真机、安装、启动录屏或任何 Android 检验脚本。构建成功不代表 Android 显示已验收；2026-10-09 的设备结果不适用于新 Logo。**

后续 Android 验收应检查 API 24–30 与 API 31+ 的静态启动图比例/遮罩/背景、普通与减少动画退出、冷/热启动到 WebView 的品牌连续性，以及各密度下的边缘清晰度。按本轮要求仅记录，不执行。

### 变更范围

`src/app/App.ts`、`src/styles.css`、`src/android.css`、`public/branding/earth-logo.png`、Android drawable/主题资源、`scripts/branding-check.mjs`，以及本计划、PROJECT_PLAN、README、ASSETS 和 Android 历史记录说明。地图、网络、渲染算法未改动；未执行 Git commit/push。

以下保留原实施计划。

## 已确认的设计

- 用户选定第一版生图，生成器源文件名为 `exec-290c4db5-fc9d-40c6-a9c1-a1473214a270.png`。随仓库发布的原样副本为 [`public/branding/earth-logo.png`](../public/branding/earth-logo.png)；本机 `artifacts/branding/earth-logo-selected.png` 是忽略目录中的备份副本。第二版不采用。
- 使用选定图形的圆形轮廓、倾斜经纬结构和白灰线条风格。整体少字、克制、优雅，不新增宣传语、说明条或鲜艳颜色。
- Android 替换的是点击桌面图标、进入全屏启动画面后首先显示的原生启动 Logo；不把“全屏启动画面”理解为 Logo 本身填满屏幕。本任务不主动更换桌面 launcher 图标。
- Web 优先设计和检验，随后将已验证的设计同步到 Android。本轮不进行 Android 端检验。

## 实施顺序与边界

1. 阅读第 18 节及 ANDROID16_ADAPTIVE_UI_PLAN.md、ANDROID16_VALIDATION.md，检查当前品牌按钮、加载遮罩和原生启动资源。
2. 检查选定 PNG 的实际透明通道与深色背景效果。保留原图，不擅自重新生图或换用第二版。若存在透明边缘/纹理影响缩小显示，优先通过原图的正确呈现解决；确需制作派生资源时，保持选定轮廓与结构、记录处理，并在 Web 预览中展示实际效果，不悄悄改成另一款地球。
3. 在 Web 中实现共享品牌资源。建议将左上角 EARTH 及 THE LIVING PLANET 可见字样替换为选定 Logo，保持现有返回初始视角的按钮行为、键盘焦点、辅助技术名称和触控范围。Logo 与页面深色背景协调，避免拉伸、白底矩形、裁切及过大的装饰占位。
4. 检查现有启动/加载界面中需要同步的品牌标识，统一使用该图形；保持当前首帧、地球进场、错误恢复和减少动画流程，不添加固定等待、不等待在线瓦片、不新增冗长文案。只调整本次品牌涉及的区域，不借机改地图、搜索、渲染与其他界面。
5. 完成 Web 构建与实际浏览器视觉检验，覆盖桌面、手机竖屏/横屏，检查缩小后的清晰度、首页按钮、加载至地球的过渡、减少动态和基本操作。保存截图和实际结果。浏览器尺寸模拟仅作为 Web 验证。
6. Web 检验通过后，将同一设计落实到 Android 原生启动资源及共用 WebView 界面；覆盖当前静态与 API 31+ 动画资源引用。动画方式可按 PNG/派生资源选择适配，保留克制退出和系统减少动画行为，避免为兼容 animated-vector 而替换为不同图形。
7. 本轮不运行 Android 模拟器/真机、adb 安装、启动录屏或 Android 检验脚本。可进行必要前端 Android 构建及 Capacitor 资源同步；若生成 APK，明确区分“构建”与“设备验收”，不得复用旧 APK 校验值或宣称本轮 Android 已通过。
8. 更新实施记录和 PROJECT_PLAN.md 的新进度，注明 Web 已验证范围、Android 已同步范围及 Android 未检验。交付截图、关键文件、构建/同步结果和剩余问题。不自动提交或推送 Git。

## 验收标准

- 可见 Logo 对应用户选择的第一版，颜色保持白灰，形态比例一致。
- 左上角以图形表达品牌，少字且保留原交互与可访问性。
- Web 各目标尺寸无品牌区域重叠、裁切或异常背景，启动过渡自然。
- Android 原生启动引用同步后的图形，共用页面使用同一品牌资源；本轮明确标为未做 Android 端检验。

## 调度记录

- 执行对话：实现-Astra。
- 规划对话只整理计划、保留素材和跟踪进度，不承担大规模代码修改。
