/** Loads and validates `config.yaml`. Misconfiguration fails loudly here, never halfway through a run. */
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { z } from 'zod'

const localized = z.object({ en: z.string().optional(), zh: z.string().optional(), orig: z.string().optional() })

const signal = z.object({
  key: z.string().min(1),
  weight: z.number().nonnegative(),
  cap: z.number().positive(),
  curve: z.enum(['log', 'linear', 'sqrt']),
})

const board = z.object({
  size: z.number().int().min(1).max(50).default(10),
  runnersUp: z.number().int().min(0).max(50).default(10),
  signals: z.array(signal).min(1),
  /** Transparent diversity rules applied after scoring, e.g. `{ perAuthor: 2 }`. Keys are board-specific. */
  caps: z.record(z.string(), z.number().int().min(1)).default({}),
})

const feed = z.object({ id: z.string().min(1), name: z.string().min(1), url: z.url() })
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM')
const timeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}, 'unknown IANA timezone')

const xAccount = z.object({
  handle: z.string().min(1),
  /** Numeric user id; handles change (xai → SpaceXAI), ids do not. Resolved and cached on first use when absent. */
  id: z.string().regex(/^\d+$/).optional(),
  group: z.enum(['lab', 'person']),
  /** Company id this account speaks for (joins the labs board for de-duplication). */
  org: z.string().optional(),
  weight: z.number().min(0).max(2).default(1),
  note: z.string().optional(),
})


export const llmProviderSchema = z.object({
  name: z.string().optional(),
  baseUrl: z.string(),
  model: z.string(),
  apiKey: z.string().default(''),
  apiKeyEnv: z.string().optional(),
  timeoutMs: z.number().int().min(1000).default(60000),
})
export type LlmProviderConfig = z.infer<typeof llmProviderSchema>

export const configSchema = z.object({
  site: z.object({
    name: z.string().min(1),
    tagline: localized.default({}),
    repoUrl: z.string().default(''),
    /** Public URL of the deployed site, e.g. https://wzznne.github.io/AI-Resonance/ (CI derives it when empty). */
    siteUrl: z.string().default(''),
    defaultLang: z.enum(['en', 'zh']).default('en'),
    theme: z
      .object({ preset: z.string().default('titanium'), accent: z.string().default('') })
      .default({ preset: 'titanium', accent: '' }),
  }),
  /** What "a day" means. See DESIGN §6a. */
  edition: z.object({
    timezone: timeZone.default('America/Los_Angeles'),
    cutoff: hhmm.default('00:00'),
    /** Hours after the cutoff when engagement is re-read and the edition is marked settled. */
    settleHours: z.number().min(0).max(48).default(8),
  }),
  retention: z.object({
    days: z.number().int().min(7).max(400).default(183),
    candidatesPerBoard: z.number().int().min(10).max(500).default(60),
  }),
  topic: z.object({
    minRelevance: z.number().min(0).max(1).default(0.35),
    strongKeywords: z.array(z.string()).default([]),
    weakKeywords: z.array(z.string()).default([]),
    githubTopics: z.array(z.string()).default([]),
    domains: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
  }),
  sources: z.object({
    githubTrending: z.object({
      enabled: z.boolean().default(true),
      since: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
      languages: z.array(z.string()).default(['']),
    }),
    githubSearch: z.object({
      enabled: z.boolean().default(true),
      queries: z.array(z.string()).default([]),
      perQuery: z.number().int().min(1).max(100).default(30),
    }),
    hfTrending: z
      .object({
        enabled: z.boolean().default(true),
        limit: z.number().int().min(1).max(100).default(10),
        prior: z.number().min(0).max(1).default(1),
      })
      .default({ enabled: true, limit: 10, prior: 1 }),
    hfPapers: z
      .object({
        enabled: z.boolean().default(false),
        days: z.number().int().min(1).max(7).default(4),
        prior: z.number().min(0).max(1).default(1),
      })
      .default({ enabled: false, days: 4, prior: 1 }),
    arxiv: z
      .object({
        enabled: z.boolean().default(false),
        categories: z.array(z.string()).default(['cs.AI']),
        max: z.number().int().min(10).max(1000).default(200),
        prior: z.number().min(0).max(1).default(0.3),
      })
      .default({ enabled: false, categories: ['cs.AI'], max: 200, prior: 0.3 }),
    journals: z
      .object({
        enabled: z.boolean().default(false),
        prior: z.number().min(0).max(1).default(0.8),
        feeds: z.array(feed).default([]),
      })
      .default({ enabled: false, prior: 0.8, feeds: [] }),
    hackerNews: z.object({
      enabled: z.boolean().default(true),
      hours: z.number().int().min(6).max(96).default(48),
      minPoints: z.number().int().min(0).default(10),
    }),
    x: z.object({
      enabled: z.boolean().default(true),
      /**
       * `auto` picks the first provider whose secret is set (xapi → twitterapi_io → socialdata) and otherwise falls back
       * to the free `syndication` provider (org accounts only). See docs/VERIFIED.md › v2 › X for costs.
       */
      provider: z.enum(['auto', 'xapi', 'twitterapi_io', 'socialdata', 'syndication']).default('auto'),
      /** Free, always on when X is enabled or not: X posts linked from HN / labs are resolved via oEmbed. */
      linked: z.boolean().default(true),
      excludeReplies: z.boolean().default(true),
      excludeReposts: z.boolean().default(true),
      minLikes: z.number().int().min(0).default(0),
      maxPostsPerRun: z.number().int().min(10).max(2000).default(300),
      /** Soft monthly budget in USD for paid providers; the source stops fetching once the month's estimate reaches it. */
      monthlyUsdCap: z.number().min(0).default(20),
      accounts: z.array(xAccount).default([]),
    }),
    labs: z
      .object({
        enabled: z.boolean().default(false),
        lookbackDays: z.number().int().min(1).max(30).default(7),
        companies: z.record(z.string(), z.number().min(0).max(1.5)).default({
          anthropic: 1.0,
          openai: 1.0,
          google: 1.0,
          deepseek: 1.0,
          xai: 1.0,
          zhipu: 0.9,
          kimi: 0.9,
          qwen: 0.9,
          meta: 0.8,
          mistral: 0.8,
          minimax: 0.8,
        }),
        hidePatchReleases: z.boolean().default(true),
        extraFeeds: z.array(z.object({ company: z.string(), name: z.string(), url: z.url() })).default([]),
      })
      .default({
        enabled: false,
        lookbackDays: 7,
        companies: {
          anthropic: 1.0,
          openai: 1.0,
          google: 1.0,
          deepseek: 1.0,
          xai: 1.0,
          zhipu: 0.9,
          kimi: 0.9,
          qwen: 0.9,
          meta: 0.8,
          mistral: 0.8,
          minimax: 0.8,
        },
        hidePatchReleases: true,
        extraFeeds: [],
      }),
  }),
  boards: z.object({
    repos: board,
    hf: board,
    news: board,
    social: board,
    labs: board.default({
      size: 10,
      runnersUp: 10,
      signals: [
        { key: 'kind', weight: 25, cap: 1, curve: 'linear' },
        { key: 'release', weight: 10, cap: 0.7, curve: 'linear' },
        { key: 'freshness', weight: 30, cap: 1, curve: 'linear' },
        { key: 'echo', weight: 20, cap: 1.5, curve: 'linear' },
        { key: 'company', weight: 10, cap: 1.5, curve: 'linear' },
        { key: 'surface', weight: 5, cap: 0.2, curve: 'linear' },
      ],
      caps: { perCompany: 3 },
    }),
  }),
  enrich: z.object({
    enabled: z.boolean().default(true),
    languages: z.array(z.enum(['en', 'zh'])).default(['en', 'zh']),
    batchSize: z.number().int().min(1).max(50).default(20),
    baseUrl: z.string().default('https://developer.amd.com.cn/radeon/api/v1'),
    model: z.string().default('Qwen3.8-Flash-Next'),
    timeoutMs: z.number().int().default(30000),
    fallback: z
      .object({
        baseUrl: z.string().default('https://ai-gateway.vercel.sh'),
        model: z.string().default('alibaba/qwen3.7-flash'),
        timeoutMs: z.number().int().default(60000),
      })
      .optional(),
    providers: z.array(llmProviderSchema).default([]),
    maxItemsPerRun: z.number().int().min(0).max(400).default(120),
    /** 并发工作线程数（默认 5，同时并发向不同 LLM 渠道发送请求） */
    concurrency: z.number().int().min(1).max(20).default(5),
    /** Write an edition brief and a weekly brief. */
    briefs: z.boolean().default(true),
  }),
  pricing: z.object({ enabled: z.boolean().default(true) }),
  /**
   * E-mail defaults. The live values come from the repository variable RESONANCE_MAIL (JSON, same keys), which the web
   * app's Settings › Delivery writes; credentials are repository secrets (MAIL_TO, SMTP_USER, SMTP_PASS or RESEND_API_KEY).
   */
  mail: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['daily', 'weekly', 'both']).default('daily'),
    /** ISO weekday for weekly mail, 1 = Monday. */
    weekday: z.number().int().min(1).max(7).default(2),
    time: hhmm.default('08:30'),
    timezone: timeZone.default('Asia/Shanghai'),
    lang: z.enum(['en', 'zh']).default('zh'),
    provider: z.enum(['smtp', 'resend']).default('smtp'),
    /** SMTP preset; `custom` uses host/port/secure. */
    preset: z.enum(['qq', '163', 'gmail', 'custom']).default('qq'),
    host: z.string().default(''),
    port: z.number().int().min(1).max(65535).default(465),
    secure: z.boolean().default(true),
    attach: z.boolean().default(true),
    /** Minutes after the send time during which a late cron run still sends. */
    graceMinutes: z.number().int().min(30).max(720).default(240),
    /** Top items per board in the e-mail body (the attached report has everything). */
    perBoard: z.number().int().min(1).max(10).default(5),
  }),
})

export type Config = z.infer<typeof configSchema>
export type BoardConfig = Config['boards']['repos']
export type MailConfig = Config['mail']

export async function loadConfig(path: string): Promise<Config> {
  const raw = parse(await readFile(path, 'utf8'))
  const result = configSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`Invalid ${path}:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
