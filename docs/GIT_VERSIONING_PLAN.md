# Git 版本管理建立计划

更新时间：2026-10-09  
状态：本地仓库已在 `main` 初始化；远程仓库尚未配置。

## 目标

- 为网页、Android App 和项目文档建立可追溯历史，方便比较、回滚和协作。
- 让每个 APK 都能对应到明确的源码提交、网页构建和 App 配置。
- 不把 API 凭据、签名密钥、机器相关 SDK 路径或生成产物提交到版本库。

## 当前状态

- 项目声明使用 Vite `^7.3.1`；`package-lock.json` 锁定依赖解析结果。
- 网页与 App 共用同一套 Vite、TypeScript、Three.js 源码。`build:android` 使用 `vite build --mode android`，`android:sync` 将该模式生成的 `dist/` 同步进 Capacitor Android 工程。
- 网页和 App 使用同一前端代码，但 API 地址在构建时注入；网站可以使用同源服务，APK 必须配置正式 HTTPS API。Vite 支持按 mode 加载 `.env.[mode]` 配置，`VITE_` 变量会进入客户端包，不能存放秘密。
- 当前工作目录已初始化本地 `.git`，主分支为 `main`；本机已安装 Git，尚无远程仓库。
- `.gitignore` 忽略 `node_modules/`、`dist/`、所有非示例环境文件、签名文件、Android SDK 本机路径、Gradle 缓存/构建输出及 APK/AAB。项目文档引用的中国网络验证报告和三张阶段截图保留在版本管理中，其余生成型 artifacts 忽略。

## 建仓前整理

1. **固定工作区状态**：记录当前 APK、源码、测试和文档状态；盘点未归档改动，避免初始化或首提交流程遗漏文件。（已完成）
2. **完善忽略规则**：忽略 `node_modules/`、`dist/`、`android/.gradle/`、`android/local.properties`、`android/**/build/`、同步生成的 Android 网页资源、调试/发布 APK、日志和 IDE 本机状态。保留 Android 工程配置、Gradle Wrapper、Capacitor 配置和 `package-lock.json`。（已完成）
3. **核查秘密与报告**：只跟踪 `.env.example`、`.env.android.example` 等空白模板；排除 `.env.local`、`.env.android.local`、`TIANDITU_TOKEN`、ArcGIS Key、`.jks` / `.keystore` 和密码文件。检查 Git 忽略的 `artifacts/`；把有长期价值的文字报告纳入 `docs/`，生成截图、浏览器日志留在忽略目录。
4. **显式审核首批文件**：已查看 `git status --short --ignored`；首批暂存后再次检查暂存清单与 staged diff，确认不含真实凭据、密钥、`node_modules`、`dist`、APK 或不应公开的个人数据。

## 初始化与提交策略

1. 在项目根目录初始化本地仓库，主分支命名为 `main`。（已完成）
2. 以当前可复现状态创建首个基线提交，提交说明：`chore: establish Earth Observatory baseline`。（已完成，`3528449`）
3. 主分支保持可构建；功能或修复通过短期工作分支完成，合并前运行对应测试和构建。
4. 提交说明使用简单前缀，例如 `feat:`、`fix:`、`docs:`、`build:`、`test:`；一个提交聚焦一个可回滚的变化。
5. 暂不创建远程仓库或推送。待确定 GitHub、GitLab 或私有托管位置，以及仓库公开/私有范围后再配置 `origin`。

## App 与 Web 版本对应

- 每次网页或 Android 代码变更都先提交源码、配置模板和文档，再生成网页或 APK；不要把 `dist/` 或 APK 二进制当作源码版本提交。
- 发布记录需包含 Git 提交哈希、App `versionName` / `versionCode`、Vite mode、API 服务版本和构建时间。若网页与 APK 使用同一 API，记录该服务版本，便于重现地图数据行为。
- Android 本地或 CI 构建分别使用 `.env.android.local` 或受保护的构建变量配置 `VITE_API_BASE_URL`。该变量是公开 API 地址，会进入 App 包；`TIANDITU_TOKEN` 留在 API 服务端密钥存储，不进入 Git 或 `VITE_` 变量。
- 后续可增加 CI：安装锁文件依赖，运行单元测试和网页构建，执行 `android:sync` 与 Android debug 构建。正式签名使用受保护的密钥管理流程，不将 release keystore 写入仓库。
- 正式发布用不可变 tag（如 `v1.0.0`）标记源码基线；APK/AAB 作为发布产物附加到相应版本，不提交至源码历史。

## 推荐实施顺序

1. 核对 `.gitignore`、`artifacts/` 报告和仓库内是否残留真实密钥。
2. 补充 Android 与本机生成产物的忽略规则。
3. 初始化 `main`，审核首批暂存文件并建立基线提交。
4. 选择远程托管平台和仓库可见范围，再设置远程备份与访问权限。
5. 逐步加入自动化测试/构建检查及带源码哈希的 APK 发布记录。

## 本轮边界

本轮只创建本地 Git 仓库与基线提交，并完善 `.gitignore`；没有创建远程仓库、推送或配置任何凭据。

## 2026-10-09 后续归档：Android 启动与自适应

- 基于 `main` 的 `3528449` 基线，归档 Astra 完成的深色启动页、原生首帧衔接、系统动态偏好、安全区、自适应布局、验证脚本及交付文档。
- 提交说明为 `feat: improve Android launch and adaptive layout`；提交后可用 `git log -1 --format=fuller` 查询完整提交哈希。
- 本次提交前重新运行 `npm test`（8 个文件、130 项通过）、`npx tsc --noEmit` 和 `npm run build`，均成功；构建仍有现有的 500 kB 分包提示。暂存内容通过 `git diff --cached --check`。
- APK、Android 本机 SDK 路径、非示例环境文件、`dist/` 及 `artifacts/android16/` 保持忽略。Android 构建与设备结果沿用 [交付记录](./ANDROID16_VALIDATION.md)，本次未重新生成 APK 或运行设备验收。
- 现有 debug APK 在源码提交前构建，未嵌入 Git 哈希；其 SHA-256 见交付记录。后续重新构建时应记录完整源码哈希、构建模式和 App 版本，不能把本次网页构建视为重新验证该 APK。
- 当前没有远程地址，本次保存到本地 `main`；没有发行 tag。
