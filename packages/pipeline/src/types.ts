export interface ItemMetrics {
  points?: number
  comments?: number
  stars?: number
  forks?: number
  starsToday?: number
  votes?: number
  upvotes?: number
}

export interface Item {
  id: string
  title: string
  titleZh?: string
  url: string
  summary: string
  summaryZh?: string
  source: string
  subChannel?: string
  publishedAt?: string
  author?: string
  avatar?: string
  tags?: string[]
  metrics?: ItemMetrics
  extra?: Record<string, any>
}

export interface SubChannelData {
  id: string
  name: string
  items: Item[]
}

export interface BoardData {
  id: string
  name: string
  source: string
  items?: Item[]
  channels?: SubChannelData[]
  updatedAt: string
}

export interface DailyReport {
  date: string
  updatedAt: string
  site: {
    name: string
    tagline: string
  }
  boards: BoardData[]
}

export interface BoardConfig {
  id: string
  name: string
  source: string
  enabled: boolean
  limit?: number
  translate?: boolean
  options?: Record<string, any>
}

export interface LlmProviderConfig {
  name: string
  baseUrl: string
  model: string
  apiKeyEnv: string
  timeoutMs?: number
}

export interface PipelineConfig {
  site: {
    name: string
    tagline: string
    timezone: string
    outputDir: string
  }
  schedule?: {
    enabled: boolean
    cron: string
  }
  llm?: {
    enabled: boolean
    batchSize?: number
    concurrentWorkers?: number
    timeoutMs?: number
    providers?: LlmProviderConfig[]
    provider?: string
    baseUrl?: string
    apiKeyEnv?: string
    model?: string
  }
  boards: BoardConfig[]
}
