import { fetchJson } from './http.ts'
import type { Item, LlmProviderConfig, PipelineConfig } from './types.ts'

interface BatchEnrichResponse {
  results: Array<{
    id: string
    titleZh: string
    summaryZh: string
  }>
}

interface ActiveProvider {
  name: string
  url: string
  model: string
  apiKey: string
  timeoutMs: number
}

function normalizeUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, '')
  if (clean.endsWith('/chat/completions')) {
    return clean
  }
  return `${clean}/chat/completions`
}

function parseModelJson(content: string): BatchEnrichResponse | null {
  try {
    let clean = content.trim()
    if (clean.startsWith('```json')) {
      clean = clean.slice(7)
    } else if (clean.startsWith('```')) {
      clean = clean.slice(3)
    }
    if (clean.endsWith('```')) {
      clean = clean.slice(0, -3)
    }
    clean = clean.trim()
    const parsed = JSON.parse(clean)
    if (parsed && Array.isArray(parsed.results)) {
      return parsed
    }
    // 兼容有些模型直接返回了数组形式 [{ id, titleZh, summaryZh }]
    if (Array.isArray(parsed)) {
      return { results: parsed }
    }
  } catch {
    // try regex match for JSON object
    const match = content.match(/\{[\s\S]*"results"[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (parsed && Array.isArray(parsed.results)) {
          return parsed
        }
      } catch {}
    }
  }
  return null
}

export class LlmService {
  private enabled: boolean
  private providers: ActiveProvider[] = []
  private batchSize: number
  private concurrentWorkers: number
  private defaultTimeoutMs: number

  constructor(config: PipelineConfig['llm']) {
    this.enabled = config?.enabled ?? false
    this.batchSize = config?.batchSize || 10
    this.concurrentWorkers = config?.concurrentWorkers || 3
    this.defaultTimeoutMs = config?.timeoutMs || 60000

    if (!this.enabled) return

    const rawList: LlmProviderConfig[] = []
    if (config?.providers && config.providers.length > 0) {
      rawList.push(...config.providers)
    } else if (config?.baseUrl && config?.apiKeyEnv) {
      // Legacy single provider
      rawList.push({
        name: config.provider || 'default',
        baseUrl: config.baseUrl,
        model: config.model || 'qwen-plus',
        apiKeyEnv: config.apiKeyEnv,
        timeoutMs: config.timeoutMs,
      })
    }

    for (const p of rawList) {
      const key = process.env[p.apiKeyEnv]
      if (key && key.trim()) {
        this.providers.push({
          name: p.name,
          url: normalizeUrl(p.baseUrl),
          model: p.model,
          apiKey: key.trim(),
          timeoutMs: p.timeoutMs || this.defaultTimeoutMs,
        })
      } else {
        console.warn(`[LLM Service] Provider [${p.name}] skipped: env ${p.apiKeyEnv} is empty.`)
      }
    }

    if (this.providers.length === 0) {
      console.warn(`[LLM Service] Warning: No active LLM providers with valid API keys found. Translation disabled.`)
      this.enabled = false
    } else {
      console.log(`[LLM Service] Initialized with ${this.providers.length} available providers: ${this.providers.map((p) => p.name).join(', ')}`)
    }
  }

  private shuffle<T>(arr: T[]): T[] {
    const list = [...arr]
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    return list
  }

  private async requestSingleBatch(
    chunk: Item[],
    provider: ActiveProvider,
  ): Promise<Map<string, { titleZh: string; summaryZh: string }>> {
    const promptItems = chunk.map((it) => ({
      id: it.id,
      title: it.title,
      summary: it.summary?.slice(0, 300) || '',
    }))

    const prompt = `你是一个资深科技资讯与开发者日报专家。请对以下技术项目/资讯条目进行中文意译与精炼总结。
要求：
1. titleZh: 准确自然的中文标题（如果原标题包含专有名词可保留）。
2. summaryZh: 1~2句通俗干练的核心亮点/价值解读（60~120字内），突出其实际用途与创新点。
3. 严格返回符合格式的 JSON 对象：
{
  "results": [
    { "id": "...", "titleZh": "...", "summaryZh": "..." }
  ]
}

待处理条目：
${JSON.stringify(promptItems, null, 2)}`

    const response = await fetchJson<any>(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: 'You are a professional tech editor. Output ONLY valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
      timeoutMs: provider.timeoutMs,
    })

    const content = response?.choices?.[0]?.message?.content
    if (!content) {
      throw new Error(`Empty response content from provider ${provider.name}`)
    }

    const parsed = parseModelJson(content)
    if (!parsed || !Array.isArray(parsed.results)) {
      throw new Error(`Failed to parse JSON result from provider ${provider.name}`)
    }

    const resultMap = new Map<string, { titleZh: string; summaryZh: string }>()
    for (const r of parsed.results) {
      if (r.id) {
        resultMap.set(r.id, {
          titleZh: r.titleZh,
          summaryZh: r.summaryZh,
        })
      }
    }
    return resultMap
  }

  async enrichItems(items: Item[]): Promise<Item[]> {
    if (!this.enabled || items.length === 0 || this.providers.length === 0) {
      return items
    }

    const chunks: Item[][] = []
    for (let i = 0; i < items.length; i += this.batchSize) {
      chunks.push(items.slice(i, i + this.batchSize))
    }

    console.log(`[LLM Service] Enriching ${items.length} items across ${chunks.length} batches (${this.batchSize} items/batch)...`)

    const enrichedMap = new Map<string, { titleZh: string; summaryZh: string }>()

    // 将 chunks 封装为任务队列
    // 用户规则：每次翻译按顺序随机挑 3 个 LLM，每次给一个 LLM 送 10 条（最多 3 个并发 = 30 条）
    // 出错了随机找另外的 LLM 顶上重试
    const pendingChunks = chunks.map((chunk, index) => ({
      index: index + 1,
      total: chunks.length,
      chunk,
      triedProviders: new Set<string>(),
    }))

    // 并发控制池：同时允许最多 concurrentWorkers 个任务执行
    const activeWorkers = Math.min(this.concurrentWorkers, this.providers.length)

    const processNext = async (): Promise<void> => {
      while (pendingChunks.length > 0) {
        const task = pendingChunks.shift()
        if (!task) break

        let success = false
        // 随机候选列表
        const candidates = this.shuffle(this.providers)

        for (const provider of candidates) {
          if (task.triedProviders.has(provider.name)) continue
          task.triedProviders.add(provider.name)

          try {
            console.log(`[LLM Service] Batch ${task.index}/${task.total} (${task.chunk.length} items) -> using [${provider.name}] (${provider.model})...`)
            const partialMap = await this.requestSingleBatch(task.chunk, provider)
            for (const [id, val] of partialMap.entries()) {
              enrichedMap.set(id, val)
            }
            console.log(`[LLM Service] Batch ${task.index}/${task.total} completed successfully via [${provider.name}].`)
            success = true
            break
          } catch (err: any) {
            console.warn(`[LLM Service] Batch ${task.index}/${task.total} failed on [${provider.name}]: ${err.message}. Finding replacement LLM...`)
          }
        }

        if (!success) {
          console.error(`[LLM Service] Batch ${task.index}/${task.total} failed after attempting all available providers. Keeping original text.`)
        }
      }
    }

    // 启动指定数量的 worker 并发处理
    const workers = Array.from({ length: activeWorkers }, () => processNext())
    await Promise.all(workers)

    return items.map((it) => {
      const match = enrichedMap.get(it.id)
      if (match) {
        return {
          ...it,
          titleZh: match.titleZh || it.titleZh,
          summaryZh: match.summaryZh || it.summaryZh,
        }
      }
      return it
    })
  }
}
