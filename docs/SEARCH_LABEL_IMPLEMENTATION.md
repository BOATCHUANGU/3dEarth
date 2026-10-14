# 搜索临时名称交付记录

> 历史快照（2026-10-12）。此处 DOM 投影文字实现已被 [2026-10-14 Cinzel WGS84 曲面文字](./SEARCH_LABEL_CINZEL_PLAN.md)替代；本页的 `textContent`、字号和渐隐参数不描述当前版本。

2026-10-12：实现、Web 检查、Android 同步/构建和维护文档整理已完成，并一并提交至本地 `main`；未配置远程或推送 Git。产品操作说明见 [README](../README.md)，项目进度见 [PROJECT_PLAN 第 20 节](../PROJECT_PLAN.md)，扩展说明见 [EXTENDING](../EXTENDING.md)，原始设计及完成记录见[主计划](./SEARCH_LABEL_SIMPLIFICATION_PLAN.md)。

## 实现

- 删除 `MarkerLayer.ts`、五个常驻点/名称、点击事件、markers 图层类型/默认配置、面板开关和死样式；五城建议及全球城市数据保留。
- 新增 `SearchLabelLayer.ts`，始终最多一个纯文本名称，使用 `textContent`。跟随地理投影；背面、视口外或与主要控件重叠时隐藏，不贴边、不接收指针事件。长名称限宽省略。
- 搜索建议、全球城市和坐标结果均通过 `EarthRenderer.focusLocation` 定位；城市只显示匹配名称，坐标显示紧凑经纬度。未点击搜索结果时不创建名称。
- 相机增加开始/到达/取消通知：真正到达后停留 3000 ms，再以 220 ms 淡出；淡入 180 ms。下一次飞行、重置、拖动取消和销毁移除旧状态。减少动态即时显示/移除。使用绝对时间与现有绘制循环，没有额外定时器或动画队列；隐藏页面立即隐藏名称，恢复绘制前清理过期状态。
- 自转基础系数 `0.12 → 0.06`，原有高度衰减和近地暂停不变。云层、光照、飞行时长、地图数据链路及 Logo 没有调整。

## 已执行检查

- `npm test`：9 个文件、138 项通过，含新增 8 项行为测试。覆盖长飞行到达计时、替换/清理、背面与视口外、后台过期、减少动态、销毁及相机飞行通知。实测相机满速约 0.36°/秒，近地保持暂停。
- `npm run build`：TypeScript 与 Web 生产构建通过。
- `node scripts/search-label-check.mjs`：Edge 155.0.4283.45 实际浏览器，DPR 2，桌面 1440×1000、手机 393×852、横屏 852×393、减少动态手机四组全部通过，页面异常 0。
- 四组检查：初始无点/名称/开关；五城建议；上海到达后停留；纽约→东京连续替换；返回首页清理；全球 Paris 搜索；坐标定位；过期恢复；普通模式背面隐藏及真实鼠标拖动取消。后台行为通过合成 visibilitychange 暂停真实渲染器核验，不冒充操作系统后台实测；销毁行为另有单元测试。
- 从观察到到达至 DOM 移除分别为 3305、3291、3298、3080 ms（含轮询误差；最后一组无淡出）。普通模式 2650 ms 检查时仍完整显示。
- `git diff --check` 通过。没有执行全部历史浏览器/网络回归；旧 `scripts/smoke-test.mjs` 仍引用此前已移除的地点卡、信息栏与波形 UI，本次未把这些旧检查当作验收证据。`city-smoke.mjs` 仅移除已不存在的 markers API 调用。

浏览器使用受控瓦片夹具，因此截图中的重复街区图案是测试素材，不是真实上海地图。普通 Web 横屏沿用可滚动最小高度布局，截图滚动到地球中心检查名称，未扩大为横屏布局改造。

## 证据

本机 `artifacts/search-labels/` 为 Git 忽略目录，不随仓库发布。四组机器可读结果文件为 `web-results.json`；相关截图包括 `desktop-initial.png`、`desktop-arrival.png`、`desktop-expired.png`、`phone-arrival.png`、`landscape-arrival.png` 和 `reduced-arrival.png`。截图使用受控瓦片夹具，重复街区图案不是实际城市地图。

复现：先 `npm run build`，用 `PORT=4281` 启动 `npm run serve`，再运行 `node scripts/search-label-check.mjs`；可用 `EARTH_TEST_URL` 指向其他本地端口。

## Android：仅同步与构建，未检验

Web 检查通过后执行 `npm run android:apk`，完成 Android 前端构建、Capacitor 资源同步和 Gradle debug APK 打包。使用 JDK 21 / SDK 36。保留原生启动及 Logo 资源；现有大包/flatDir 提示不阻塞构建。

- 新版 debug APK 位于本机 Git 忽略路径 `android/app/build/outputs/apk/debug/app-debug.apk`：43,676,149 字节。
- SHA-256：`A653A651B4094502734288DE4DF56B1A4B0BAF3256496B8FD01D9CCEA344DC77`。
- 构建日志为 `artifacts/search-labels/android-build.log`，也位于本机忽略目录。

**没有运行 adb、模拟器、真机或 Android 检验脚本。构建成功不等于设备验收通过；旧 APK 同路径已被覆盖，不能套用旧校验值和设备结果。** 后续待验原生 WebView 的投影位置、触摸取消、旋转/后台生命周期与系统减少动画。

实现位于 App、EarthRenderer、CameraController、SearchLabelLayer 及 CSS；测试脚本同步清理了已删除的地点标记 API 调用。没有修改网络、瓦片或材质算法。历史阶段文档保留其当时的地点标记描述，不作为当前操作说明。
