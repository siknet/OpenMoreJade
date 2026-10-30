import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import type { PipelineConfig } from './types.ts'

export function findWorkspaceRoot(): string {
  let curr = process.cwd()
  while (curr) {
    if (existsSync(resolve(curr, 'pnpm-workspace.yaml'))) {
      return curr
    }
    const parent = resolve(curr, '..')
    if (parent === curr) break
    curr = parent
  }
  return resolve(import.meta.dirname, '../../..')
}

export function loadEnv(): void {
  const root = findWorkspaceRoot()
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(root, '.env'),
    resolve(import.meta.dirname, '../../../.env'),
  ]

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        if (typeof (process as any).loadEnvFile === 'function') {
          ;(process as any).loadEnvFile(p)
        } else {
          const lines = readFileSync(p, 'utf-8').split(/\r?\n/)
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const eqIdx = trimmed.indexOf('=')
            if (eqIdx > 0) {
              const k = trimmed.slice(0, eqIdx).trim()
              const v = trimmed.slice(eqIdx + 1).trim()
              if (!process.env[k]) {
                process.env[k] = v
              }
            }
          }
        }
      } catch {
        // ignore load errors
      }
      break
    }
  }
}

export function loadConfig(configPath?: string): PipelineConfig {
  loadEnv()

  const root = findWorkspaceRoot()
  const candidates = [
    configPath,
    resolve(process.cwd(), 'config.yaml'),
    resolve(root, 'config.yaml'),
    resolve(import.meta.dirname, '../../../config.yaml'),
  ].filter(Boolean) as string[]

  let foundPath: string | null = null
  for (const p of candidates) {
    if (existsSync(p)) {
      foundPath = p
      break
    }
  }

  if (!foundPath) {
    throw new Error(`config.yaml not found in candidate paths: ${candidates.join(', ')}`)
  }

  const raw = readFileSync(foundPath, 'utf-8')
  const parsed = parse(raw) as PipelineConfig

  // Fallbacks
  parsed.site = parsed.site || {
    name: '摸玉日报',
    tagline: '无聊时随便看点什么',
    timezone: 'Asia/Shanghai',
    outputDir: 'packages/web/public/data',
  }

  return parsed
}
