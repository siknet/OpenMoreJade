import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { resolve, extname, join } from 'node:path'
import { runPipeline } from './packages/pipeline/src/engine.ts'
import { loadConfig } from './packages/pipeline/src/config.ts'

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const DIST_DIR = resolve(process.cwd(), 'packages/web/dist')
const DATA_DIR = resolve(process.cwd(), 'packages/web/public/data')

// 极简高性能静态文件服务
const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  let pathname = decodeURIComponent(url.pathname)

  // 1. 手动触发更新 API
  if (pathname === '/api/trigger' && req.method === 'POST') {
    res.writeHead(202, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Pipeline task triggered in background' }))
    console.log('[Server] Pipeline triggered via POST /api/trigger')
    runPipeline().catch((err) => console.error('[Server] Triggered pipeline failed:', err))
    return
  }

  // 2. /data 路由：实时指向最新抓取的数据目录
  if (pathname.startsWith('/data/')) {
    const relPath = pathname.slice('/data/'.length)
    const filePath = join(DATA_DIR, relPath)
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.json'] || 'application/json',
        'Cache-Control': 'no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      })
      createReadStream(filePath).pipe(res)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Data file not found')
    return
  }

  // 3. 静态前端资源文件服务（SPA Fallback 到 index.html）
  let filePath = join(DIST_DIR, pathname)
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html')
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback
    filePath = join(DIST_DIR, 'index.html')
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    })
    createReadStream(filePath).pipe(res)
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
})

// 简易通用 Cron 时间匹配器
function matchCronField(value, fieldExpr) {
  if (fieldExpr === '*') return true
  const parts = fieldExpr.split(',')
  for (const part of parts) {
    if (part.includes('/')) {
      const [base, step] = part.split('/')
      const s = Number(step)
      const b = base === '*' ? 0 : Number(base)
      if ((value - b) % s === 0 && value >= b) return true
    } else if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number)
      if (value >= start && value <= end) return true
    } else if (Number(part) === value) {
      return true
    }
  }
  return false
}

function shouldRunAtTime(hour, minute, cronExpr) {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length < 2) return false
  const minuteExpr = parts[0]
  const hourExpr = parts[1]
  return matchCronField(minute, minuteExpr) && matchCronField(hour, hourExpr)
}

// 定时任务调度器（基于北京时间准点触发）
function startCronScheduler() {
  const config = loadConfig()
  if (!config.schedule?.enabled) {
    console.log('[Scheduler] Schedule is disabled in config.yaml.')
    return
  }

  const cronExpr = config.schedule.cron || '0 8,16 * * *'
  const timezone = config.site.timezone || 'Asia/Shanghai'
  console.log(`[Scheduler] Active! Scheduled cron: "${cronExpr}". Timezone: ${timezone}`)

  let lastRunMinute = -1

  // 每 30 秒检查一次当前系统时间
  setInterval(async () => {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
    })

    const parts = formatter.formatToParts(now)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value)
    const minute = Number(parts.find((p) => p.type === 'minute')?.value)

    const currentMinuteKey = hour * 60 + minute

    if (currentMinuteKey === lastRunMinute) {
      return
    }

    if (shouldRunAtTime(hour, minute, cronExpr)) {
      lastRunMinute = currentMinuteKey
      console.log(`\n⏰ [Scheduler] Triggering scheduled pipeline at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (${timezone})...`)
      try {
        await runPipeline()
        console.log(`✅ [Scheduler] Pipeline completed and refreshed to public data!`)
      } catch (err) {
        console.error('❌ [Scheduler] Pipeline execution failed:', err)
      }
    }
  }, 30000)
}

server.listen(PORT, HOST, async () => {
  console.log(`\n======================================================`)
  console.log(`⚡ OpenMoreJade Server is running!`)
  console.log(`🌐 Web UI: http://${HOST}:${PORT}`)
  console.log(`📂 Data directory: ${DATA_DIR}`)
  console.log(`======================================================\n`)

  // 检查是否已有数据，若无则首次自动抓取一次
  const latestFile = resolve(DATA_DIR, 'latest.json')
  if (!existsSync(latestFile)) {
    console.log('🚀 [Init] No existing daily data found. Running initial pipeline...')
    try {
      await runPipeline()
    } catch (err) {
      console.error('❌ [Init] Initial pipeline failed:', err)
    }
  } else {
    console.log('✅ [Init] Existing daily data detected.')
  }

  // 启动内置定时器
  startCronScheduler()
})
