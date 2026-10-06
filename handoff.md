# AI-Resonance 项目交接文档

更新时间：2026-10-05

## 一、项目概况

这是一个 pnpm + TypeScript monorepo 的静态 AI 信息雷达。Pipeline 定时抓取外部数据，写入快照并生成静态 JSON；Web 是 Preact/Vite SPA/PWA；Channels 提供 API client、MCP 工具、邮件和 HTML 报告。

### 目录职责
- `packages/schema`：共享 Board、Item、Daily/Weekly API 类型契约与评分模型。
- `packages/pipeline`：配置读取、数据源抓取、分类去重、跨源共振（Resonance）、刊期切分、透明打分、趋势跟踪、LLM 润色（enrichment）、静态数据发布。
- `packages/web`：Today 首页、榜单卡片、搜索与归档、设置（Settings）、交付订阅（Delivery）、健康检查、PWA。
- `packages/channels`：静态 API 客户端、MCP 服务器、自动化邮件发送与离线 HTML 报告渲染。
- `config.yaml`：站点全局配置、抓取源参数、板块评分权重、LLM 与邮件服务配置。
- `data/`：运行时快照、缓存和状态（已被 `.gitignore` 忽略）。

### 常用命令
```bash
# 执行完整流程（收集、打分、润色、发布）
pnpm daily

# 启动 Web 前端本地开发
pnpm dev

# 全仓库构建
pnpm build

# 全仓库类型检查
pnpm typecheck

# 全仓库单元测试
pnpm test
```

Web 开发服务器默认配置在 `0.0.0.0:5173`，支持局域网或 `http://127.0.0.1:5173` 访问。

---

## 二、今日（2026-10-05）完整改动清单

今日所有的核心工作集中在：**架构与源清理（移除学术与 Reddit/Labs）**、**HN 多 Tab 升级与排序修复**、**前端设置简化与默认搜索引擎调整**、以及**卡片交互体验重构（去抽屉弹窗/直链外跳/信息平铺/解决浮层半透明与重叠问题）**。

### 1. 架构与源清理
1. **彻底移除学术（Papers）模块**：
   - 将 Hugging Face (`hf`) 确立为核心 Board，彻底删除了旧 `papers`（arXiv、HF Daily Papers、期刊）的代码与配置。
2. **移除 Reddit 抓取渠道与相关逻辑**：
   - 清理所有抓取 reddit 相关代码与 `config.yaml` 对应配置。
3. **强化 LLM 润色与批量翻译**：
   - 优化 Prompt，严格要求输入多少条就必须输出对应且完整的 JSON 条目，杜绝批量处理中的遗漏条目现象。
4. **移除 Labs 的所有配置项与相关代码**：
   - 移除 Labs 板块定义及配置，默认榜单不再包含 Labs。

### 2. Hacker News 渠道重构与修复
1. **HN 双 Tab 支持**：
   - 参考 GitHub 的日/周/月趋势 Tab 设计，在 Hacker News 板块支持双频道切换：
     - **SHOW（最新/展示项目，设为默认频道）**
     - **BEST（高分精选）**
   - 保持通过 Algolia 高性能 API 获取。
2. **修复排序倒序/乱序缺陷**：
   - 解决 SHOW 板块条目未严格按照序号升序展示的问题，确保抓取和切片后的排序从 01 到 10 严格升序。

### 3. 前端设置与搜索简化
1. **设置（Settings）面板瘦身**：
   - 榜单配置中去掉了“社区动态（social）”与“官方动态（labs）”，点击“恢复默认榜单”也仅包含核心板块。
   - 移除了普通用户无需配置的“模型（models）”、“凭据（credentials）”、“搜索引擎（search）”配置标签与前端界面，避免冗余。
2. **搜索引擎调整**：
   - 默认搜索引擎变更为 **Google**。
   - 移除了右上角/更多菜单中的搜索引擎切换设置与冗余前端逻辑。

### 4. 卡片交互重构与 Hover 体验优化
1. **移除右侧抽屉弹窗，改为直接外链跳转**：
   - 原先点击项目卡片会在屏幕右侧滑出抽屉弹窗（Drawer）；现彻底移除该弹窗拦截，点击卡片标题或行直接打开对应来源外链或项目源地址（支持配置新标签页打开）。
2. **卡片信息内联平铺（无掉帧）**：
   - 将原抽屉弹窗中的“项目简介”与“为什么值得关注（Why it matters）”直接以内联卡片形式（`.card__why`）平铺在卡片主体中。
   - 带有左侧主题色强调边框（`border-left: 3px solid var(--signal)`）和轻微色块背景，文字对比度清晰，杜绝卡顿与掉帧（保持 60fps 平滑滚动）。
3. **解决 Hover 背景半透明与文字重叠问题**：
   - **根本原因**：`hud.css` 的 `.board` 玻璃拟物材质将 `--surface-3` 映射为透明度仅 6%~9% 的半透明遮罩（`var(--tint-3)`），导致浮动卡片背景全透并与下方内容文字重叠。
   - **解决方案**：
     - 主卡片彻底去除浮动 `.card__peek`，信息直接内联展示。
     - 候补条目（`.runner__peek`）强制使用 100% 不透明实底（深色模式为 `var(--bg-2)` / `#0e131b`，浅色模式为 `#ffffff`），配合多重实色阴影，彻底消除重叠透字现象。

---

## 三、当前全仓库验证状态

- **TypeScript 类型检查 (`pnpm typecheck`)**：
  - `@resonance/schema`：0 错误通过
  - `@resonance/pipeline`：0 错误通过
  - `@resonance/channels`：0 错误通过
  - `@resonance/web`：0 错误通过
- **自动化测试 (`pnpm test`)**：
  - `@resonance/web` 测试全部通过（含 `test/items/card.test.tsx` 15/15 通过、`test/core/settings.test.ts`、`test/search/defaults.test.ts` 等）。
- **生产构建 (`pnpm --filter @resonance/web build`)**：
  - Vite 生产构建打包成功，产物正常生成。

---

## 四、跨机器接手与运行注意事项

### 1. 环境准备
- **Node.js**：建议使用 Node.js >= 20（当前开发环境为 Node.js v22.20.0）。
- **pnpm**：全局安装 pnpm（如 `npm install -g pnpm`）。
- **Windows 环境执行**：
  若在 Windows PowerShell 下遇到找不到 `pnpm` 命令，可将 npm 全局目录加入 PATH：
  ```powershell
  $env:Path = "C:\Users\<YourUser>\AppData\Roaming\npm;$env:Path"
  ```
- **拉取与依赖安装**：
  ```bash
  git pull
  pnpm install
  ```

### 2. 敏感配置与 `.env`
- 确保不要把 API Key、大模型密钥或 SMTP 密码提交到 Git 仓库。
- 本地开发若需要调用 LLM 润色或第三方 API，在项目根目录创建 `.env`：
  ```env
  # 可选：LLM 服务配置
  LLM_BASE_URL=https://api.openai.com/v1
  LLM_API_KEY=your_api_key_here
  LLM_MODEL=gpt-4o-mini
  
  # 可选：邮件投递 SMTP 配置
  SMTP_HOST=smtp.example.com
  SMTP_PORT=465
  SMTP_USER=user@example.com
  SMTP_PASS=password
  ```

### 3. 数据与缓存
- `data/` 目录用于存储各数据源的抓取快照与评分缓存，初次执行 `pnpm daily` 会进行冷启动抓取。
- 如果需要生成本地前端 mock 数据：
  ```bash
  pnpm --filter @resonance/web run mock:api
  ```
