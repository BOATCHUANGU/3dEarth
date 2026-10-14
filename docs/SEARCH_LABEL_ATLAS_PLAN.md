# 地表名称 A 方案：冷灰地图册

历史状态（2026-10-14）：A 方案的字体和尺寸曾由 [Cinzel 搜索曲面文字](./SEARCH_LABEL_CINZEL_PLAN.md)演进，随后又被[地表大标题与浅香槟金](./SEARCH_LABEL_GRAND_TITLE_PLAN.md)取代。本文保留 Astra 初版与 Sol 打磨的测试、截图验收记录；当前字号、配色与渐隐参数以大标题记录为准。

2026-10-13。用户选择 A，要求字体贴合绑定地球、随地球缩放，放大时逐渐消失；测试及细节打磨交给「检验/实现-Sol」。

状态：Sol 已完成 Web 检验、修复与截图核对。当前实现以文末完成记录为准；下面的初版与交接范围保留供追溯。

## 实现-Astra 初版

- Source Han Serif SC Medium 500 + Source Serif 4 Medium 500（opsz 20），本地 TrueType WOFF；不改变界面字体。清除原 Cinzel / CJK Regular 发布资产。
- 到达字号 22 CSS px，letterSpacing 0.015em；自然大小写，单行、居中，无黑描边、光晕、背景板。
- 默认灰绿 `#D8E2DE`；已显示的街道地图使用深蓝绿灰 `#283B3C`。颜色按实际地图源类型提示选取，非逐像素亮度检测。明亮卫星影像的可读性需实图检查。
- Troika SDF，每字 4 级细分。通过材质 shader 在 Troika 排布后、相机投影前，将每顶点沿地理法线投影到 WGS84 椭球。采用稳定二次方程形式，保留地表上方约 2m 与原 depth bias。不是 cylindrical curveRadius，也不是仅旋转平面。
- 文本世界尺寸在创建时固定。长名称只在排布完成后按到达视口宽度缩小一次；后续不按屏幕字号反向缩放。
- 以原始到达字号为基准，放大到 1.35 倍开始渐隐，2.75 倍完全隐藏；倍率由当前投影字号计算。缩回仍在原生命周期内可恢复。远端仍保留原小字淡入。
- 保留飞行末段显现、真实到达后 3 秒停留加 0.5 秒退出、背景清除、连续搜索、取消、字体失败降级等生命周期。减少动态仅改变时间动画，仍保留随缩放的空间透明度。

## 原交接范围

用户授权测试与视觉细节打磨。请更新旧断言（旧字号、字体路径、34px 动态上限已不适用）；检查实际 WebGL shader 编译、椭球贴合、固定世界尺寸及连续 zoomOpacity、长名称、中英混排、手机/桌面/减少动态、地图两种配色、生命周期、失败路径。可以修复本功能及调整字体大小/字距/配色/淡出曲线，保留 A 方案方向。

旧浏览器入口 `scripts/search-label-3d-check.mjs` 可复用；原产物属于旧方案，请将本次证据放 `artifacts/search-label-atlas/`。完成必要单测、Web 构建、浏览器截图检查、Android assets 同步；不要运行 Android 设备/模拟器或打 APK，不提交/推送 Git。不要修改 Logo、启动图、加载样式、地图选源/画质或飞行速度。共享工作区已有其他未提交改动，禁止清理/回退。

本记录初版只表示实现已写入，测试尚未执行；由 Sol 补充实际结果、修复项、截图与限制。

## Sol 完成记录（2026-10-13）

### 修复与视觉打磨

- 保留 22 px 到达基准、500 字重、0.015em 字距、无描边/光晕，以及原飞行与停留节奏。世界尺寸和地理朝向固定；1.35–2.75 倍放大渐隐不再采用 34 px 反向缩放。
- 修复两处实际截图暴露的字体兼容问题：Troika 对中文后的空格沿用前一个字体，原子集缺少空格而使用了宽缺字 advance；已保留思源宋体真实的 0.255em 空格。Troika 遍历所有 GPOS lookup，误把仅供上下文定位调用的辅助 lookup 无条件应用，中点叠到 `i` 上；生成脚本只保留其可处理的直接水平定位 lookup，保留正常 kerning/combining mark，不重绘轮廓或修改 advance。混排间隔约 0.226em，中点与相邻字母不再重叠。
- 明亮影像仍用浅灰绿时对比度偏低。新增仅服务于名称的只读亮度提示：在已绘制瓦片上、名称地理锚点附近读取缓存的 8×8 缩略像素，按 3×3 邻域线性亮度选择既有两色；进入深色墨水阈值 0.27、返回浅色阈值 0.19。街道仍用 `#283B3C`，暗影像用 `#D8E2DE`。无新地图请求、逐帧 GPU readback 或地图渲染/选源/画质改动。
- 手机长名称原本虽在视口内，但末尾被右侧按钮遮挡。搜索时一次性测量中央区域到工具栏的距离，保留 12 px 间隔；排布只 fit 一次，随后不反向缩放或偏移地理锚点。本次手机长名称到达宽度为 249 px。
- 旧单测与 DOM 检查入口迁移至现行曲面文字；`scripts/search-label-check.mjs`、`scripts/search-label-flight-check.mjs` 作为兼容入口转接 `scripts/search-label-3d-check.mjs`。新增有针对性的缩放、曲面、亮度缓存/翻转及调色稳定性验证。

### 实际验证结果

- `npm test`：11 文件、156 项通过；`npm run build`：类型检查与 Web 生产构建通过，保留现有 500 kB chunk 提示。
- Edge 155.0.4283.45、DPR 2：桌面 1440×1000、手机 393×852、减少动态三组通过，页面异常和 shader 错误均为 0。覆盖飞行末段、到达、固定锚点/朝向/scale、1/1.35/2.05/2.75 倍缩放、中英与中点混排、长名称、坐标、英文、连续搜索、取消、重置、背面/斜视、后台过期、上下文中断、dispose 与本地字体 HTTP 503。普通停留加退出约 3498 ms；减少动态约 2989 ms。连续缩放分别记录 186/155/122 帧。
- GPU 检查使用实际已编译顶点 shader 与真实 Troika glyph 属性及 uniform 做 transform feedback：675 个顶点，长名称边缘下弯约 160.97 m；相对 WGS84 的最大计算残差约 0.000026 m，确认曲面计算在 glyph 排布后执行。另用前景遮挡物做有/无文字的像素比较，无遮挡时存在 16905 个通道差异，遮挡后差异为 0，`depthTest` 保持开启。该数值是计算验证，不能解释为地图或显示器具备相同精度。
- 本地字体均实际 HTTP 200；字体表检查确认字重 500、Latin 919 与 CJK 44,234 码点，仅 U+0020 重叠。实际字形仍来自本地 Medium WOFF；缺字使用本地方框。生产包另外通过手机首次 UI 搜索及延迟字体响应/减少动态检查，未先等待测试用字体 Promise。
- 仅下载一个真实 EOX 明亮沙漠瓦片和一个真实 OSM 巴黎街道瓦片，随后在本地重复回放作配色压力检查；查看并对比了修复前后截图，不把这些重复图案当作真实城市全景。生命周期与缩放矩阵使用受控地图夹具。
- Web 通过后执行 `npm run android:sync`，仅 Android mode 网页构建与 Capacitor assets 同步；字体及资源校验记录见同步证据。未运行 Android 真机/模拟器或生成 APK，未提交/推送 Git。

### 本机证据与复现

证据位于被 Git 忽略的 `artifacts/search-label-atlas/`，不沿用旧方案产物：

- [浏览器结果](../artifacts/search-label-atlas/results.json)、[GPU 曲面与深度遮挡](../artifacts/search-label-atlas/surface-gpu.json)、[字体表与校验](../artifacts/search-label-atlas/font-evidence.json)、[生产首次搜索](../artifacts/search-label-atlas/production.json)。
- [手机长名称](../artifacts/search-label-atlas/phone-long.png)、[混排中点](../artifacts/search-label-atlas/reduced-mixed-punctuation.png)、[桌面斜视](../artifacts/search-label-atlas/desktop-oblique.png)、[2.05 倍渐隐](../artifacts/search-label-atlas/desktop-fade-2.05.png)、[2.75 倍隐藏](../artifacts/search-label-atlas/desktop-fade-2.75.png)。
- [明亮影像最终效果](../artifacts/search-label-atlas/bright-satellite-final.png)、[街道最终效果](../artifacts/search-label-atlas/street-final.png)、[混排细节](../artifacts/search-label-atlas/bright-satellite-text-detail.png)、[上游样本记录](../artifacts/search-label-atlas/samples.json)、[同步日志](../artifacts/search-label-atlas/android-sync.log)、[Android 字体资源校验](../artifacts/search-label-atlas/android-assets.json)。

```powershell
npm test
npm run build
# 另开终端运行 npm run dev -- --port 4295 --strictPort
$env:EARTH_TEST_URL = 'http://127.0.0.1:4295'
node scripts/search-label-3d-check.mjs
npm run android:sync
```

限制：后台/上下文中断为合成浏览器事件，遮挡是测试场景；未声称操作系统或 Android GPU 实测。配色采用邻域平均和两色阈值，复杂纹理局部可能仍降低辨识度，不保证每个像素的对比度。字库不是全球文字/完整上下文排版引擎；CJK 资源约 16.67 MiB，未做真实低速网络或 Android 性能验收。Logo、启动图、加载样式、地图选源/画质及飞行速度沿用既有实现。
