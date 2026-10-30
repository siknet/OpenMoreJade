# ─────────────────────────────────────────────────────────
# 摸玉日报 (OpenMoreJade) - 官方生产 Dockerfile
# 基于 Node.js 22 LTS 极简 Alpine 镜像，轻量且安全
# ─────────────────────────────────────────────────────────

FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

# 先拷贝依赖声明文件，最大化利用 Docker 构建缓存
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/pipeline/package.json ./packages/pipeline/
COPY packages/web/package.json ./packages/web/

# 安装项目所有依赖
RUN pnpm install --frozen-lockfile || pnpm install

# 拷贝全量源代码
COPY . .

# 构建前端静态产物 (输出到 packages/web/dist)
RUN pnpm --filter @resonance/web run build

# ─────────────────────────────────────────────────────────
# 运行镜像 (生产阶段)
# ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# 配置北京时间时区
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

# 安装 pnpm（用于支持容器内运行特定命令）
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

# 拷贝全量工作区和构建产物
COPY --from=builder /app /app

# 暴露 Web 访问端口
EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# 启动服务：包含静态托管、API 路由及每日准点定时抓取调度
CMD ["node", "--experimental-strip-types", "server.js"]
