# 中国网络地图：2026-10-01 验证记录

## 范围与环境

本轮在 Windows 本机、Edge 154.0.4258.37（无头模式）运行。生产服务为 `npm run serve`，地址 `http://127.0.0.1:4173`；另检查 Vite dev `5173` 和 preview `4174`。浏览器瓦片全部由本地 256 px 夹具应答，配置接口也由测试夹具控制；没有访问真实地图站点。直连构建只用了假的公开测试 token，测试后恢复默认同源构建。视口包含桌面 1440×1000、移动 390×844 / DPR 2 与 DPR 3。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `npm test` | 111/111 通过 | 命令输出 |
| `npm run test:relay` | 15/15 通过 | 命令输出 |
| `npm run build` | 类型检查及构建通过；Three.js 分包仍有 500 kB 提示 | 命令输出 |
| 设置 `EARTH_TEST_URL=http://127.0.0.1:4173`、`EARTH_ARTIFACT_DIR=artifacts/china-network` 后运行 `npm run test:browser` | 基础 11、故障 5、城市 7、中国网络 10，全部通过 | [基础](./smoke-results.json)、[故障](./failure-results.json)、[城市](./city-smoke-results.json)、[网络](./network-results.json) |
| 假公开 token 的直连生产构建 | 1/1 通过；没有请求 `__earth/network` | [直连结果](./direct-results.json) |
| `scripts/selection-audit.mjs` | 3,360 组视口/纬度/高度/DPR，失败 0；最大数学覆盖 27,060 片，没有数量截断 | [选择审计](./selection-audit.json) |
| dev、preview、serve 路由 | 三者的 `__earth/network` 均只返回 `chinaAvailable` 与 `region`；非法瓦片坐标均返回 400 | 手动 HTTP 检查 |

受控浏览器覆盖：手动选择持久化、`auto` 提示组合、非法/禁用存储、无 Network Information API、慢网 4 槽与正常 8 槽、不变的 DPR 与 LOD、配置 404/非 JSON/3.5 秒超时、手动与在线恢复重读、街道底图及独立注记、卫星独立图层、父图保留、备用来源稳定与冷却后手动恢复、两方署名和日期变更线。转发测试覆盖请求合并、取消、缓存策略及 304、64 MiB 有界缓存的缩小版淘汰测试、`Retry-After` 秒数/日期、拒绝响应和跨天地图图层的冷却。

本机 PowerShell 复现：先运行 `npm test`、`npm run test:relay`、`npm run build`，另开终端运行 `npm run serve`，随后设置 `$env:EARTH_TEST_URL='http://127.0.0.1:4173'` 和 `$env:EARTH_ARTIFACT_DIR='artifacts/china-network'`，运行 `npm run test:browser` 与 `node scripts/selection-audit.mjs`。浏览器脚本需要本机 Edge。

截图：[中国街道与透明注记夹具](./china-streets-fixture.png)、[中国卫星夹具](./china-satellite-fixture.png)、[直连街道](./direct-streets.png)、[直连卫星](./direct-satellite.png)、[150 m 街区](./city-fixture-150m.png)、[父图覆盖](./city-fixture-parent-cover.png)、[DPR 3 移动端](./city-fixture-mobile.png)。人工复核了受控画面：透明注记之外仍能看见底图，切换卫星后状态与署名正确。这些是夹具画面，不能代表天地图真实画质或真实注记效果。

## 修复

- 网络质量属性变化现在只影响队列并发和超时，不清空已经稳定选中的备用来源；用户更改网络偏好仍会重新评估来源。
- 离线启动期间若配置请求还在进行，恢复在线会中止旧请求并重新读取配置。
- 同源模式在配置返回前不会把公开浏览器 token 误当作服务端天地图可用性的依据。
- 转发缓存对 `If-Modified-Since` 返回正确的 304；新增并行取消、缓存策略与供应商冷却回归测试。
- 更新受控夹具，明确提供中国来源配置并拦截 `t0`–`t3` WMTS；`cva` 使用独立透明 PNG。旧城市测试改按实际并发上限与冷却规则断言。测试结果独立写入本目录。

## 未完成的真实网络验收

当前生产配置接口返回 `{"chinaAvailable":false,"region":"auto"}`，工作目录没有 `.env.local`，因此没有可用于服务端 WMTS 的用户凭据，也没有可公开的浏览器授权凭据。没有执行带 Key 的真实瓦片请求；北京、上海、广州、成都在 12,000 m / 600 m 的首张可见时间、95% 覆盖时间、最终成功率、流量、运营商与家庭/移动网络对照均为**未测**。不能据夹具结果声称 p95≤5 秒或成功率≥98%。

天地图[官方服务页](https://lbs.tianditu.gov.cn/server/MapService.html)本次读取超时；[官方站托管的 WMTS 适配文档](https://heilongjiang.tianditu.gov.cn/iportal/iClient/forJavaScript/docs/openlayers/ol.source.Tianditu.html)可核对 `vec`/`img`、`tiles` 格式与 3857 网格，但未单独证实当前 `cva_w`、256 px、z1–18 的全部能力和具体授权。真实 Key 的产品权限、配额、实际 Referer、全球覆盖、北京/上海道路对齐、注记透明度与正式发布标识仍需用户授权环境下的小量固定视图核验。DNS/连接/TLS 分解没有内置采集，也没有实测数据。
