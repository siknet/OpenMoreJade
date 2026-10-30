# 摸玉日报 (AI & Tech Radar) - 项目交接与重构说明

更新时间：2026-10-30

## 一、本次重构核心成果

针对阿里云服务器部署（无须翻墙）、每天定期抓取、配置解耦与前端现代化的需求，本次重构完成了以下工作：

1. **彻底解耦爬虫规则与配置**：
   - 所有抓取开关、抓取条数、子分类、展示顺序、筛选门槛全部抽离至根目录的 `config.yaml`。
   - 抓取源抽象为插件化微模块（`packages/pipeline/src/sources/`），各自独立无耦合。

2. **五大板块全新排序与规则调整**：
   - **栏目一：GitHub 开源趋势 (`repos`)**
     - 彻底砍掉繁琐的“候补 10 条（runnersUp）”概念，只纯净展示今日 Top 10 开源爆款。
   - **栏目二：Hacker News 科技热点 (`news`)**
     - 彻底移除过去只卡 AI 关键词的严苛正则过滤，杜绝“只剩三五条”的问题。
     - 直接拆分为 3 个独立子频道胶囊：`TOP`（首页实时热榜）、`SHOW`（作者自荐新作品）、`BEST`（历史精选），每个子频道稳定输出前 15 条。
     - 明确跳过 LLM 筛选与处理，原汁原味极速呈现。
   - **栏目三：Dev.to 开发者社区 (`devto`)**
     - 最新精选 + 开源专区（`tag=opensource`）双频道，各 15 条。
   - **栏目四：Lobste.rs 极客社区 (`lobsters`)**
     - `Release` 版本发布 + `AI` 议题 + `Show` 作品三频道，各 15 条。
   - **栏目五：Product Hunt 今日新品 (`producthunt`)**
     - 替换原 HF 趋势，抓取当日新品 Top 15，展示产品投票（Votes）与中英对比。
     - 支持官方 GraphQL API v2 及官方免鉴权公开 Feed 兜底，免 Key 亦可开箱即用。

3. **前端完全重构为现代栈（Vue 3 + Vite + Tailwind CSS）**：
   - 移除原复杂的 Preact、手写 CSS 变量与 Zero-Server 相关的历史包袱（如前端 Token 加密存储、浏览器端调大模型等）。
   - 采用 Vue 3 SFC (`<script setup lang="ts">`) + Tailwind CSS。
   - 打造现代精致科技仪表盘风格：深浅色模式切换、平滑子分类胶囊切换、实时本地模糊搜索过滤、历史刊期日期切换。
   - Vite 构建打包产物 Gzip 仅 ~30KB JS + 4KB CSS，首屏毫秒级秒开。

4. **冗余模块清理**：
   - 删除了 `packages/channels`（MCP Server、邮件模板、DSH 等过度设计）。
   - 删除了根目录的 `test.py`、`test_clef_filter_translate.py` 等历史调试脚本。
   - 彻底废弃 GitHub Actions `data` 分支作为数据库的 Git 冲突隐患，直接本地生成静态 JSON。

---

## 二、项目目录结构

```
OpenMoreJade/
├── config.yaml               # 全局核心配置（抓取开关、条数、顺序、LLM、输出路径）
├── package.json              # 根目录脚本
├── packages/
│   ├── pipeline/             # Node.js 数据采集与 LLM 润色管道
│   │   ├── src/
│   │   │   ├── sources/      # 插件化源模块
│   │   │   │   ├── github.ts       # GitHub Trending (Top 10)
│   │   │   │   ├── hackernews.ts   # HN (TOP / SHOW / BEST 各 15 条)
│   │   │   │   ├── devto.ts        # Dev.to (最新 + 开源)
│   │   │   │   ├── lobsters.ts     # Lobste.rs (Release + AI + Show)
│   │   │   │   ├── producthunt.ts  # Product Hunt (Top 15 新品)
│   │   │   │   └── index.ts        # 统一调度器
│   │   │   ├── config.ts     # 配置读取器
│   │   │   ├── engine.ts     # 管道执行引擎
│   │   │   ├── http.ts       # 超时控制与网络请求
│   │   │   ├── llm.ts        # 通用大模型翻译/提炼服务 (DashScope / DeepSeek / Groq)
│   │   │   ├── types.ts      # 数据类型定义
│   │   │   └── cli.ts        # CLI 执行入口
│   │   └── package.json
│   │
│   └── web/                  # 现代化 Vue 3 前端
│       ├── public/
│       │   └── data/         # 抓取生成的静态数据 (latest.json, daily/YYYY-MM-DD.json)
│       ├── src/
│       │   ├── components/   # Header, BoardNav, ItemCard
│       │   ├── App.vue       # 主页面
│       │   ├── main.ts
│       │   └── style.css     # Tailwind 基础样式
│       ├── tailwind.config.js
│       ├── vite.config.ts
│       └── package.json
```

---

## 三、常用命令

```bash
# 1. 运行数据抓取与构建（生成 latest.json 和当日刊期）
pnpm daily

# 2. 启动前端本地开发调试 (http://localhost:5173)
pnpm dev

# 3. 构建前端静态发布产物 (输出到 packages/web/dist)
pnpm build

# 4. 预览前端构建产物
pnpm preview
```

---

## 四、阿里云服务器部署指南

由于采用 **Static-First 静态优先架构**，部署极其简单轻量：

### 1. 安装 Node.js 与 pnpm
```bash
# 安装 Node.js 22 或 24
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm
```

### 2. 克隆代码与依赖安装
```bash
cd /var/www
git clone <your-repo-url> daily-radar
cd daily-radar
pnpm install
```

### 3. 配置大模型凭据（可选）
如果需要使用通义千问 / DeepSeek / Groq 翻译项目标题与摘要，在服务器环境变量中添加（如在 `/etc/environment` 或通过 `.env`）：
```bash
export DASHSCOPE_API_KEY="sk-..."
```
*注：未配置 Key 时，系统会自动降级保留英文原文，流水线不会报错。*

### 4. 设置每天 2 次定时抓取任务 (Linux Crontab)
编辑当前用户的 crontab：
```bash
crontab -e
```
添加以下定时任务（每天上午 08:30 与晚上 20:00 自动抓取并更新数据）：
```cron
# 每天 08:30 与 20:00 执行抓取
30 8,20 * * * cd /var/www/daily-radar && pnpm daily >> /var/log/daily-radar.log 2>&1
```

### 5. Nginx 静态托管配置
前端构建一次后（`pnpm build`），产物位于 `/var/www/daily-radar/packages/web/dist`。数据文件直接存放在 `dist/data/` 目录。

Nginx 示例配置：
```nginx
server {
    listen 80;
    server_name your-domain.com; # 你的域名或服务器 IP

    root /var/www/daily-radar/packages/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 针对静态 json 数据设置合适的缓存时间
    location /data/ {
        expires 5m;
        add_header Cache-Control "public, no-cache";
    }
}
```
完成后 `sudo nginx -s reload` 即可上线！
