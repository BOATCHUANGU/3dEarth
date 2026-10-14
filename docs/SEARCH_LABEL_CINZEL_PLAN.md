# 地表搜索名称：增强古典地图册效果

2026-10-14，用户已确认并要求按统筹 → Sol 实现 → Luna 文档与 GitHub 的分工开始。本计划是新的视觉目标，替代 A 方案的字号、字距和英文字体参数；不替代已验证的地理、渲染和生命周期契约。

## 目标与实现边界

让搜索后浮现在地球上的名称更明显、更美观。基于当前未提交的 A 方案继续实现，保留 Troika、WGS84 逐顶点曲面贴合、固定世界尺寸与真实飞行进度。不得回退已有字体空格/中点、亮度提示或长名称遮挡修复。

- 到达字号从 22 CSS px 提至约 28 px，作为实际视觉调优起点。
- 英文改为本地 Cinzel Medium，中文保留思源宋体 Medium。保留输入大小写，不人为全部转换为大写；说明 Cinzel 本身的小型大写视觉特征。核对实际字体元数据与字重，更新生成脚本、资源、许可及覆盖信息，不只修改字体名称。
- 中文字距约 0.08em，英文字距约 0.10em。区分文字脚本而不硬插空格；核对 Troika 现有能力，采用最小可维护实现保证字距及混排基线、中心一致。真实空格、标点、数字与坐标保持自然，不重复加宽空格。
- 保留两色底图适配与滞回，提高浅色字亮度；可从 #E7EEEB 试起，通过明暗影像和街道实图样本选定最终值。无明显黑描边、光晕或背景板。
- 长名称优先收紧字距，再适度缩小到可用安全宽度。仅布局准备阶段 fit，不逐帧反向缩放，不能通过移动经纬度锚点避让控件。
- 按完成 fit 后的到达尺寸重新校准放大渐隐基准，避免字号提高或长名称压缩导致过早/过晚消失。曲线连续；到达清楚，适度放大仍可辨认，更近时逐渐隐去。报告最终阈值及选择依据。
- 保留真实飞行最后约 1/3 显现、到达约 3 秒停留和 0.5 秒退出；保留减少动态、连续搜索、取消、重置、背面遮挡、后台过期、字体失败与释放路径。

范围仅搜索地表文字及必要接线、字体资产与相关验证。不要修改搜索框/列表/按钮字体、Logo、启动画面、加载轨道、地图来源/画质、自转或飞行速度。不增加地图请求或逐帧 GPU 读回。

## Sol 交付

1. 修改前记录同地点同视角 A 方案基线；完成后对比中文、英文、中英混排和长名称。以当前实现为起点，不重置工作区。
2. 保证本地 Cinzel 真实载入，记录字体字重、许可、覆盖和混排间距。迁移已有测试断言，不堆砌只复述常量的测试。
3. 跑必要单测与 Web 构建；真实浏览器检查桌面、手机和减少动态。观察到达、连续缩放、曲面贴合、遮挡、工具栏避让及至少暗底/明亮影像/街道的可读性。使用可控夹具验证状态，真实样本用于配色；明确其局限。
4. 浏览器自动化按当前适用技能使用；复用项目测试入口。证据保存 `artifacts/search-label-cinzel/`，至少提供前后截图、结果 JSON 与字体证据，统筹可直接查看。
5. Web 通过后同步 Android 共用资源；本轮不打 APK、不运行 Android 模拟器/真机。明确同步和设备验收不同。
6. 在本文件追加简短完成记录，列出最终参数、实现取舍、实际检查、证据与限制。不提交/推送，不改 README/EXTENDING/PROJECT_PLAN/ARCHITECTURE/COORDINATION，留给 Luna；不向其他对话发消息，由统筹读取结果。

## 统筹与 Luna 收尾

统筹核对实际截图、变更范围和测试证据后再派发 Luna。Luna 同步当前架构/使用/扩展/进度说明与历史计划的替代关系，逐项审查所有未提交搜索文字链路和本次文档；排除本机 artifacts、构建产物、凭据及无关文件，然后提交推送并返回远端状态。共享工作区串行写入。

## Sol 完成记录（2026-10-14）

### 最终呈现与实现

- 到达基准 **28 CSS px**；思源宋体 SC Medium 500 / 实际 Cinzel Medium 500。中文相邻字 **0.08em**，Latin 字母 **0.10em**，无空格的跨脚本边界 0.09em；空格、标点和数字不额外加宽。浅墨色 **#E7EEEB**，深墨色 #283B3C，保留原亮度提示与滞回。
- Cinzel 输入仍是 `Paris` 等原始大小写。其小写原生轮廓呈小型大写：字体表实测 A/a 高度 0.716/0.618em，P/p 为 0.700/0.600em。没有把字符串转为大写。字体由 Google Fonts 的 Cinzel 可变 TTF 实例化为 500，保留 OFL 全文；生成脚本、覆盖表和资源说明已更新，旧 Source Serif 4 WOFF 已移出发布资产。
- Troika 0.52.5 没有逐脚本字距属性。新增一个 Text 子类与一次性布局适配：零字距完成真实字体 shaping，通过公开 `colorRanges` 携带字符索引，再调整字形实例边界和 caret/bounds；渲染前移除索引颜色。仍为一条网格、公共基线、固定地理中心，未插入可见空格，未逐帧排版或反向缩放。浏览器确认索引颜色没有进入渲染。
- 长名先把额外 tracking 连续收紧到 0，仍超宽才缩小；一次性 fit 到工具栏安全宽度。桌面样本保留完整 tracking 和 28px；手机混排约 22.57px、极长名约 12.52px，宽度 249px。Cinzel 自然轮廓较宽，极长手机样本的 em 比 A 方案约 13.94px 略小，这是保留整条名称和控件间隔的取舍，未宣称所有长名称都更大。
- 渐隐按 **fit 后到达 em** 校准，**1.5 倍开始、3 倍全隐**；中点 2.25 倍透明度 0.5。普通名称对应 42–84px，压缩名称按各自实际到达尺寸计算。相较旧阈值，适度放大时保留更多可读时间，近处仍自然消失。到达 3 秒停留/0.5 秒退出、真实飞行末段、减少动态和全部清理路径保留。

### 实际检验

- `npm test`：**12 文件、160 项通过**；`npm run build`：类型检查与生产构建成功，保留现有 Three.js 大 chunk 提示。针对性单测覆盖脚本字距、真实空格/标点/数字、字符索引而非 glyph 序号、先收字距再缩小、fit 后渐隐及截止时间。
- Edge 155.0.4283.45、DPR2：桌面 1440×1000、手机 393×852、减少动态三组通过，页面/shader 错误均为 0。覆盖到达、连续缩放与 1/1.5/2.25/3 倍渐隐、曲面/斜视/背面、混排中点、坐标、长名、连续搜索、取消/重置、后台过期、上下文中断、释放、本地字体 HTTP503。普通生命周期约 3500/3503ms，减少动态约 2992ms；连续缩放记录 139/115/91 帧。
- 实际 GPU shader 与新 glyph 属性的 transform feedback：675 顶点，桌面长名称最大下弯约 392.55m，WGS84 计算残差约 0.000078m；前景遮挡检查通过。数值仅证明计算路径，不能当作地图或显示设备精度。
- 同地点同相机的前/后各 **24 组**（桌面/手机 × 暗林地/明亮沙漠/街道 × 中文/英文/混排/长名）。基线是修改前保留的 A 方案网页资产；所有地理 position/quaternion 完全相同，实际查看了前后及完整手机截图。真实上游样本本地重复回放作配色检查，非真实城市全景；最初海洋样本为白色空瓦片，已排除，最终暗底使用真实 EOX 林地样本。
- 生产包另通过手机首次 UI 搜索、延迟字体响应/减少动态；没有提前等待测试用字体 Promise。字重、glyph 高度、覆盖与 SHA-256 均核对，字体实际本地加载；Cinzel 367 / CJK 44,520 码点，仅空格重叠。
- `npm run android:sync` 成功；两 WOFF 源文件与 Android assets 哈希一致，旧 Source Serif WOFF 不再同步。**未生成 APK、未做 Android 设备检验、未提交/推送 Git**。全局说明与历史替代关系由 Luna 收尾。

### 证据与复现

证据在 Git 忽略的 `artifacts/search-label-cinzel/`：

- 中文：[之前](../artifacts/search-label-cinzel/before-desktop-dark-chinese-detail.png) / [之后](../artifacts/search-label-cinzel/after-desktop-dark-chinese-detail.png)；英文：[之前](../artifacts/search-label-cinzel/before-desktop-dark-english-detail.png) / [之后](../artifacts/search-label-cinzel/after-desktop-dark-english-detail.png)。
- 手机混排：[之前](../artifacts/search-label-cinzel/before-phone-bright-mixed-detail.png) / [之后](../artifacts/search-label-cinzel/after-phone-bright-mixed-detail.png)；[手机长名称完整画面](../artifacts/search-label-cinzel/after-phone-street-long.png)。
- [前后量化对比](../artifacts/search-label-cinzel/comparison.json)、[浏览器矩阵](../artifacts/search-label-cinzel/results.json)、[GPU 曲面与遮挡](../artifacts/search-label-cinzel/surface-gpu.json)、[字体证据](../artifacts/search-label-cinzel/font-evidence.json)、[生产检查](../artifacts/search-label-cinzel/production.json)、[同步日志](../artifacts/search-label-cinzel/android-sync.log)、[同步哈希](../artifacts/search-label-cinzel/android-assets.json)。

复现：启动 `npm run dev -- --port 4295 --strictPort`，设置 `EARTH_TEST_URL=http://127.0.0.1:4295`，运行 `node scripts/search-label-3d-check.mjs`；配色对比入口为 `scripts/search-label-cinzel-visual.mjs`，依赖上述本机样本。字体重建与许可见 `public/fonts/README.md`。

限制：后台与上下文事件为合成浏览器检查，未替代原生系统验收；复杂影像局部对比度仍受邻域采样影响。新增布局适配基于锁定的 Troika API/geometry 数据，升级时需重跑排版与 shader 检查。中文字库约16.69 MiB，尚未做真实慢网络或 Android 性能验收；极长名称在窄屏仍会小于默认字号。
