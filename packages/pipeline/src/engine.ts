import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { findWorkspaceRoot, loadConfig } from './config.ts'
import { fetchBoard } from './sources/index.ts'
import { LlmService } from './llm.ts'
import type { BoardData, DailyReport, Item, PipelineConfig } from './types.ts'

function getTodayString(timezone = 'Asia/Shanghai'): string {
  const d = new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export async function runPipeline(customConfig?: PipelineConfig): Promise<DailyReport> {
  const config = customConfig || loadConfig()
  const today = getTodayString(config.site.timezone)
  const nowIso = new Date().toISOString()

  console.log(`\n======================================================`)
  console.log(`🚀 Starting Daily Pipeline: [${today}] at ${nowIso}`)
  console.log(`======================================================\n`)

  const llm = new LlmService(config.llm)
  const boardDataList: BoardData[] = []

  for (const boardCfg of config.boards) {
    if (!boardCfg.enabled) {
      console.log(`⏩ Skipping disabled board: ${boardCfg.name} (${boardCfg.id})`)
      continue
    }

    console.log(`\n📡 Fetching board [${boardCfg.name}] (source: ${boardCfg.source})...`)
    const startTime = Date.now()

    try {
      const { items, channels } = await fetchBoard(boardCfg)

      let enrichedItems = items
      let enrichedChannels = channels

      // 是否需要进行 LLM 翻译与提炼
      if (boardCfg.translate) {
        // 汇集当前 board 的所有待翻译项目去重，严禁重复翻译
        const uniqueItemsMap = new Map<string, Item>()
        for (const item of items) {
          uniqueItemsMap.set(item.id, item)
        }
        if (channels) {
          for (const ch of channels) {
            for (const item of ch.items) {
              if (!uniqueItemsMap.has(item.id)) {
                uniqueItemsMap.set(item.id, item)
              }
            }
          }
        }

        const uniqueItems = Array.from(uniqueItemsMap.values())
        const enrichedUnique = await llm.enrichItems(uniqueItems)
        const enrichedMap = new Map<string, Item>(enrichedUnique.map((it) => [it.id, it]))

        // 回填到 items
        enrichedItems = items.map((it) => enrichedMap.get(it.id) || it)

        // 回填到 channels
        if (channels && channels.length > 0) {
          enrichedChannels = channels.map((ch) => ({
            ...ch,
            items: ch.items.map((it) => enrichedMap.get(it.id) || it),
          }))
        }
      }

      const boardData: BoardData = {
        id: boardCfg.id,
        name: boardCfg.name,
        source: boardCfg.source,
        items: enrichedItems,
        channels: enrichedChannels,
        updatedAt: new Date().toISOString(),
      }

      boardDataList.push(boardData)
      const count = enrichedItems.length
      console.log(`✅ Board [${boardCfg.name}] completed with ${count} items (${Date.now() - startTime}ms)`)
    } catch (err: any) {
      console.error(`❌ Failed to process board ${boardCfg.id}: ${err.message}`)
      boardDataList.push({
        id: boardCfg.id,
        name: boardCfg.name,
        source: boardCfg.source,
        items: [],
        channels: [],
        updatedAt: new Date().toISOString(),
      })
    }
  }

  const report: DailyReport = {
    date: today,
    updatedAt: nowIso,
    site: {
      name: config.site.name,
      tagline: config.site.tagline,
    },
    boards: boardDataList,
  }

  // 严格基于工作区根目录定位输出目录，杜绝多层嵌套路径 bug
  const workspaceRoot = findWorkspaceRoot()
  const outDir = resolve(workspaceRoot, config.site.outputDir || 'packages/web/public/data')
  const dailyDir = resolve(outDir, 'daily')

  mkdirSync(dailyDir, { recursive: true })

  const dayFile = resolve(dailyDir, `${today}.json`)
  const latestFile = resolve(outDir, 'latest.json')
  const editionsFile = resolve(outDir, 'editions.json')

  const reportJson = JSON.stringify(report, null, 2)
  writeFileSync(dayFile, reportJson, 'utf-8')
  writeFileSync(latestFile, reportJson, 'utf-8')

  // 更新历史刊期索引
  let editions: string[] = []
  if (existsSync(editionsFile)) {
    try {
      editions = JSON.parse(readFileSync(editionsFile, 'utf-8'))
    } catch {
      editions = []
    }
  }
  if (!editions.includes(today)) {
    editions.unshift(today)
    editions.sort((a, b) => b.localeCompare(a))
    writeFileSync(editionsFile, JSON.stringify(editions, null, 2), 'utf-8')
  }

  console.log(`\n🎉 Pipeline completed successfully!`)
  console.log(`📂 Saved to: ${dayFile}`)
  console.log(`📂 Saved to: ${latestFile}`)

  return report
}
