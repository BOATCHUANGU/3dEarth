# 加载 Logo 扫光恢复

2026-10-13：仅修改 App 加载 Logo 的包裹元素与相关 CSS。当前 PNG 保留，白光以透明通道为遮罩从左向右扫过，2 秒循环；减少动态时静止。左上角 Logo、原生启动、地图及加载退出时机未修改。

历史核对：`12b295b` 及基线版本只有 `spin 2s linear infinite` 光环，未找到横向 shimmer 源码。因此沿用历史 2 秒线性节奏，按用户描述适配当前 PNG，而非声称原样恢复不存在于已存历史中的实现。

Web 构建及一次 Edge 实际浏览器检查通过：左/中/右动画帧、PNG 轮廓遮罩、减少动态、加载退出与地球就绪均确认，页面异常 0。证据位于本机 `artifacts/loading-shimmer/`：`left.png`、`center.png`、`right.png`、`reduced.png`、`loading.png`、`ready.png` 和 `results.json`。临时检查脚本也位于该忽略目录，未新增测试体系。

Web 验证后执行 `npm run android:sync` 同步共用 WebView 资源；未改 Android 原生资源，未生成新 APK、未运行 Android 设备/模拟器检验，未提交 Git。

## 当前状态

2026-10-13 后续按用户修正，应用内加载动画已恢复为旧版轨道图形：倾斜椭圆静止，外圆亮弧以 2 秒周期旋转；减少动态时停止。上文 shimmer 记录保留为历史；当前加载层不显示 PNG Logo。左上角 PNG、Android 原生启动 Logo、加载提示/进度及退出时机保持不变。

Web 构建和 Edge 专项检查通过，确认轨道、旋转、减少动态及加载退出正常，页面错误 0。已执行 `npm run android:sync` 同步共用 WebView 资源；未做 Android 设备检验。检查截图和结果在忽略目录 `artifacts/loading-orbit/`。
