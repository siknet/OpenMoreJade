# AI-Resonance 项目交接文档

更新时间：2026-10-10

## 一、项目概况

这是一个 pnpm + TypeScript monorepo 的静态 AI / 技术资讯雷达。Pipeline 定时抓取外部数据，写入快照并生成静态 JSON；Web 是 Preact/Vite SPA/PWA；Channels 提供 API client、MCP 工具、邮件和 HTML 报告。

### 目录职责
- `packages/schema`：共享 Board、Item、Daily/Weekly API 类型契约与评分模型。
- `packages/pipeline`：配置读取、数据源抓取、分类去重、跨源共振（Resonance）、刊期切分、透明打分、趋势跟踪、LLM 润色（enrichment）、静态数据发布。
- `packages/web`：Today 首页、榜单卡片、搜索与归档、设置（Settings）、交付订阅（Delivery）、健康检查、PWA。
- `packages/channels`：静态 API 客户端、MCP 服务器、自动化邮件发送与离线 HTML 报告渲染。
- `config.yaml`：站点全局配置、抓取源参数、板块评分权重、LLM 与邮件服务配置。
- `data/`：运行时快照、缓存和状态（已被 `.gitignore` 忽略，数据同步至分支 `data`）。

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

## 二、最新改动清单（2026-10-10）

本日工作核心解决：**新增 Dev.to 与 Lobste.rs 资讯源及多 Tab 支持**、**GitHub Actions 每日流水线校验修复**、**前端运行时白屏崩溃根本原因排查与修复**、**分类器免过滤与候选条目扩容**。

### 1. 资讯源扩充（Dev.to 与 Lobste.rs 多 Tab 支持）
1. **Dev.to 独立频道接入**：
   - 抓取接口：Dev.to 官方 API（`/api/articles`）。
   - **默认 Tab（最新精选）**：展示按热度评分与 AI 关键词筛选出的最新 15 条开发热帖。
   - **第二个 Tab（TAG=开源精选）**：专门抓取 `tag=opensource` 的条目，直接翻译标题和简介，不设硬性关键词门槛。
2. **Lobste.rs 独立频道接入**：
   - 抓取接口：Lobste.rs 官方 JSON Feed（`release.json`、`ai.json`、`show.json`）。
   - **严格按照顺序呈现 3 个 Tab**：
     - **Release（默认 Tab）**：展示前 15 条技术框架与语言版本发布。
     - **AI**：AI 相关技术议题。
     - **Show**：社区作品展示。
3. **前端国际化与交互**：
   - 在 `packages/web/src/views/board.tsx` 中为资讯板块新增 Dev.to 与 Lobste.rs 的二级频道切换选项。
   - 完善中英文翻译映射（`en.ts` / `zh.ts`），确保 i18n 字典对齐测试 100% 通过。

### 2. GitHub Actions 校验与流水线修复
1. **修复 `showRank` 校验致命错误**：
   - 现象：`publish: daily/2026-10-06.json failed validation X Too small: expected number to be >0 at boards.news.top[0].news.showRank`
   - 根因：Show HN 中包含 0 序号，而 Schema 校验原设为 `.positive()`（要求 >0）。
   - 修复：在 `packages/pipeline/src/validate.ts` 中将 `showRank` 修改为 `.nonnegative()`，兼容 0 及正整数。
2. **清理过期工作流引用**：
   - 移除了 `.github/workflows/daily.yml` 中对已删除 `mail.yml` 的调用，避免 Action 报错。

### 3. 前端白屏崩溃排查与修复（Uncaught TypeError 彻底根除）
1. **白屏根本原因分析**：
   - Action 构建完全成功且退出码为 0，快照也已正常发布。
   - 真正的白屏崩溃原因出在 `packages/web/src/views/board.tsx`：
     代码中直接使用了 `it.sources.includes('hacker-news')`，而发布后的静态条目（`Item`）规范中**并不包含 `sources` 属性**（`it.sources` 为 `undefined`，只有 `key` 与 `tags`）。
     浏览器端在 Preact 初次渲染资讯板块时直接抛出：
     `TypeError: Cannot read properties of undefined (reading 'includes')`
     导致整棵组件树挂起崩溃，呈现纯白屏。
2. **前端修复措施**：
   - 改用基于 `key` 前缀与 `tags` 的安全类型守卫（`isDevTo`、`isLobsters`、`isHn`）。
   - 对发布时间解析（`toTime`）、`points` 与 `comments` 添加空值保护，杜绝任何 NaN 导致的排序异常。

### 4. 分类器免过滤（byConstruction）与容量截断优化
1. **Lobste.rs 与 Dev.to 条目全军覆没的根因**：
   - 原分类器（`packages/pipeline/src/classify.ts`）默认要求 `minRelevance: 0.35`（需命中预设的 AI 强关键词）。
   - Lobste.rs 的 `release`（如 Python 3.15、Curl 8.5 等发布）与 Dev.to 开源项目属于通用开发者内容，标题不包含 AI 关键词，在采集阶段全部被当作噪音丢弃。
   - 修复：在 `byConstruction` 中将 `lobsters` 和 `dev-to` 显式设为免过滤受信任频道，100% 完整保留。
2. **板块候选条目扩容**：
   - `config.yaml` 中的 `candidatesPerBoard` 原本为 60。增加两大源后，资讯板块原始条目达到 100+ 条，导致低点赞的条目被截断。现将其扩容至 180 条。

### 5. 组件与单元测试修复
- 在 `packages/web/src/items/card.tsx` 中补齐卡片底部挂载的 `<ItemActions>` 与 `<ResonanceMark>`，使卡片相关 15 项测试及全库 322 个管道测试全部绿灯通过。

---

### 三、历史核心改动清单（2026-10-05）

1. **架构与源清理**：彻底移除旧 Papers 学术模块（HF 确立为核心 Board）；移除 Reddit 渠道；移除 Labs 配置。
2. **Hacker News 双 Tab**：支持 SHOW（默认）与 BEST 频道；修复排序升序逻辑。
3. **前端与设置简化**：设置面板瘦身，移除冗余配置；默认搜索引擎切为 Google。
4. **卡片交互优化**：移除右侧抽屉弹窗改直跳外链；简介与入选理由平铺内联展示；消除浮层半透明文字重叠。

---

## 四、前瞻探索：决策模型（JEV / Cloudflare CELF / 非自回归决策模型）在本项目中的应用构想

### 1. 技术背景
当前业内最新的决策模型（如 **JEV** 以及 Cloudflare 推出的 **CELF** / 非自回归 System 1 决策引擎）正在改变传统 LLM 的用法：
- **传统大模型（Auto-regressive）**：逐 Token 生成，推理时延长（1~5秒/次），并发成本极高，容易因速率限制（HTTP 429）拖慢整个流水线。
- **决策模型（Single Forward Pass / Non-autoregressive）**：
  在**单次前向传播**中直接输出类型化分类、多标签打分和是/否二元判定（如 `[Is-Relevant: Yes, Score: 0.88, Category: infra]`）。耗时通常只需几毫秒到几十毫秒，成本不到自回归大模型的 1/50。

### 2. 在本资讯雷达全渠道的落地场景与奇特价值

| 渠道 / 板块 | 现状痛点 | 决策模型带来的突破作用 |
| :--- | :--- | :--- |
| **全渠道初筛 (`classify`)**<br>（GitHub、HN、HF、Dev.to、Lobste.rs） | 目前依靠正则关键词匹配（`classify.ts`），容易产生误伤（漏掉不带 AI 词的新技术）或误判（带 AI 词的招聘/广告水贴）。 | **全语义多维相关性判定**：输入标题+简介，10ms 内输出精准的置信度。既不漏掉有价值的前沿技术，又能彻底排除假借 AI 名义的垃圾贴。 |
| **开源项目趋势 (`repos`)** | 仅按 Stars 增量打分，老项目容易霸榜，真正极具潜力的新项目在早期 Star 很少。 | **项目潜力与黑马指数预测（Virality Scoring）**：模型根据项目 README 结构、解决的问题痛点及初期 Star 增速，评估其“技术深度”与“未来爆发力”，打造真正的黑马雷达。 |
| **资讯热议板块 (`news`)**<br>（HN、Dev.to、Lobste.rs） | 不同社区点赞基数差异巨大（HN 上百分，Lobste.rs 仅几分），难以横向比较。 | **社区共振与价值归一化（Normalized Value）**：决策模型评估讨论内容的技术含金量，为 Dev.to 经验分享和 Lobste.rs 技术发布赋予客观的价值系数。 |
| **智能多标签路由 (`categorize`)** | 依靠手动规则将条目归类为 `tool`、`model`、`infra`、`framework` 等。 | **端到端多标签即时分类**：单次前向同时完成板块归类与多级领域打标，完全免除额外的大模型分类请求。 |
| **CI / 边缘架构** | 依赖外部大模型 API（Groq/Ollama），易受网络抖动、密钥失效和速率限制影响。 | **边缘端/本地端 100% 离线运行**：CELF 类的轻量级决策模型可直接打包在 GitHub Actions runner 本地环境或 Cloudflare Workers 边缘函数上，实现零成本、零 API 依赖、秒级全量处理。 |

---

## 五、当前全仓库验证状态

- **TypeScript 类型检查 (`pnpm typecheck`)**：全仓库 0 错误通过。
- **管道单元测试 (`pnpm -F @resonance/pipeline test`)**：34 个测试文件、322 个测试用例全部通过。
- **前端构建 (`pnpm -F @resonance/web build`)**：Vite 打包耗时 ~500ms，静态产物打包无错误。

---

## 六、跨机器接手与运行注意事项

### 1. 办公机环境准备
- **Node.js**：建议使用 Node.js >= 20（当前开发环境为 Node.js v24.16.0 / v22.20.0）。
- **pnpm**：全局安装 pnpm（`npm install -g pnpm`）。
- **同步与安装**：
  ```bash
  git pull origin main
  pnpm install
  ```

### 2. 敏感配置与 `.env`
- 敏感 API Key（如 Groq、HF、GitHub Token）切勿提交至代码仓库。
- 本地调试流水线时，在根目录 `.env` 中添加对应提供商凭据即可触发 LLM 摘要：
  ```env
  Groq1_apikey=gsk_...
  ```

### 3. 运行流水线与本地预览
- 运行每日构建：
  ```bash
  pnpm daily
  ```
- 启动前端热重载预览：
  ```bash
  pnpm dev
  ```
