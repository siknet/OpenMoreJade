# 摸玉日报 (OpenMoreJade) - Docker 生产部署与定时任务指南

本文档汇集了本项目在服务器环境下的完整 Docker 部署步骤、定时自动抓取机制以及日常运维命令，方便拉取代码后直接对照操作。

---

## 一、部署前准备

在云服务器的项目根目录下，确保包含以下关键文件：

1. **`.env`（密钥配置文件，敏感文件，不提交公开代码库）**：
   确保填入 8 个免费 LLM 提供商的 API Key：
   ```env
   Groq1_apikey=gsk_...
   Groq2_apikey=gsk_...
   OLLAMA1_apikey=...
   OLLAMA2_apikey=...
   HFACE_apikey=...
   vercel_apikey=...
   amd1_apikey=...
   amd2_apikey=...
   ```

2. **`config.yaml`（全局核心配置）**：
   定时任务已配置为每天两次（北京时间 **08:00** 与 **16:00**）：
   ```yaml
   schedule:
     enabled: true
     cron: "0 8,16 * * *"
   ```

3. **`docker-compose.yml` 与 `Dockerfile`**：已配置多阶段构建、时区校准与数据卷持久化。

---

## 二、一键启动部署（推荐）

在服务器项目根目录下执行以下命令：

### 1. 启动容器
```bash
docker compose up -d --build
```
> **首次运行特性**：如果容器检测到本地尚无数据，会在**启动完成后自动在后台先执行一次完整的抓取与汉化**，无需手动干预。

### 2. 查看容器运行日志
```bash
docker compose logs -f
```
正常启动时将输出如下日志：
```text
======================================================
⚡ OpenMoreJade Server is running!
🌐 Web UI: http://0.0.0.0:3000
📂 Data directory: /app/packages/web/public/data
======================================================
[Init] Existing daily data detected.
[Scheduler] Active! Scheduled cron: "0 8,16 * * *". Timezone: Asia/Shanghai
```

### 3. 访问站点
浏览器直接访问：
```text
http://<你的服务器IP>:3000
```

---

## 三、每日定时抓取与自动更新机制

1. **执行时间**：
   - 每天早上 **08:00**（北京时间）
   - 每天下午 **16:00**（北京时间）
2. **抓取内容**：
   - GitHub 官方今日全语言趋势榜
   - Hacker News 热门/自荐/精选（全量标题与亮点汉化）
   - Dev.to 开发者社区
   - Lobste.rs 极客社区
   - Product Hunt 今日新品
3. **实时热更新**：
   - 抓取完成后数据自动写入 `/app/packages/web/public/data`；
   - 容器内置服务直读磁盘文件，**用户刷新网页即可立即看到最新日报，无需重启容器，也无需重新打包前端**！

---

## 四、常用运维管理命令

| 操作需求 | 执行命令 |
| :--- | :--- |
| **查看实时运行日志** | `docker compose logs -f` |
| **手动立即触发一次抓取** | `curl -X POST http://localhost:3000/api/trigger` |
| **在容器内直接执行流水线** | `docker exec -it open-more-jade pnpm daily` |
| **重启容器服务** | `docker compose restart` |
| **停止并退出容器** | `docker compose down` |
| **修改代码或配置后重新构建** | `docker compose up -d --build` |

---

## 五、进阶：域名与 Nginx 反向代理配置（可选）

若需要绑定自定义域名（如 `radar.yourdomain.com`）并启用 SSL 证书，可以在宿主机 Nginx 添加如下配置：

```nginx
server {
    listen 80;
    server_name radar.yourdomain.com; # 替换成您的域名

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 六、数据持久化说明

在 `docker-compose.yml` 中已经映射了数据卷：
- `./packages/web/public/data:/app/packages/web/public/data`
- `./config.yaml:/app/config.yaml:ro`
- `./.env:/app/.env:ro`

**即使销毁或重新构建 Docker 镜像，所有的历史期数（`YYYY-MM-DD.json`）与本地 API Key 均完整保存在服务器宿主机上，不会丢失。**
