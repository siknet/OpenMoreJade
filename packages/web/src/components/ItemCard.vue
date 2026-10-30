<template>
  <div class="group relative rounded-2xl bg-white hover:bg-white border border-slate-200/90 hover:border-violet-500/50 hover:shadow-xl hover:shadow-violet-500/5 dark:bg-slate-900/60 dark:hover:bg-slate-900/90 dark:border-slate-800/80 dark:hover:border-violet-500/40 p-5 sm:p-5.5 transition-all duration-200 flex flex-col justify-between">
    <!-- 上半部分：元信息、标题、中文摘要提炼 -->
    <div>
      <!-- 顶部信息行：序号、来源徽章、发布时间 -->
      <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3">
        <div class="flex items-center gap-2">
          <!-- 序号 -->
          <span class="font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/90 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700/60 shadow-2xs">
            #{{ String(index + 1).padStart(2, '0') }}
          </span>

          <!-- 来源/作者 -->
          <div v-if="item.author" class="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
            <img 
              v-if="item.avatar" 
              :src="item.avatar" 
              class="w-4 h-4 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700" 
              loading="lazy"
            />
            <span class="text-xs truncate max-w-[120px] sm:max-w-[180px]">{{ item.author }}</span>
          </div>
        </div>

        <!-- 相对发布时间 -->
        <span class="text-[11px] font-mono text-slate-400 dark:text-slate-500">
          {{ formatDate(item.publishedAt) }}
        </span>
      </div>

      <!-- 主标题（中文标题或原标题） -->
      <h3 class="text-[15px] sm:text-base font-bold text-slate-900 group-hover:text-violet-600 dark:text-slate-100 dark:group-hover:text-violet-400 transition-colors duration-150 leading-snug mb-2">
        <a :href="item.url" target="_blank" rel="noopener noreferrer" class="inline-flex items-start gap-1.5 hover:underline">
          <span>{{ item.titleZh || item.title }}</span>
          <svg class="w-3.5 h-3.5 mt-1 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </h3>

      <!-- 英文原标题对照（有中文标题且不相同时显示） -->
      <p v-if="item.titleZh && item.title !== item.titleZh" class="text-xs text-slate-500 dark:text-slate-400 font-mono mb-3 line-clamp-1 opacity-80">
        {{ item.title }}
      </p>

      <!-- 中文核心亮点提炼（淡雅淡紫色系微简报风格，左侧淡紫 Accent 强调线） -->
      <div 
        v-if="item.summaryZh" 
        class="mb-4 text-xs leading-relaxed text-slate-800 dark:text-violet-100/95 bg-violet-50/80 border-l-3 border-violet-500 dark:bg-violet-950/25 dark:border-violet-500/70 rounded-r-lg px-3 py-2.5 shadow-2xs"
      >
        {{ item.summaryZh }}
      </div>

      <!-- 原文摘要/描述（未汉化时呈现） -->
      <p v-else-if="item.summary" class="text-xs leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-3 mb-4">
        {{ item.summary }}
      </p>
    </div>

    <!-- 底部指标栏与标签 -->
    <div class="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2 flex-wrap">
      <!-- 标签 Tags -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <span
          v-for="tag in (item.tags || []).slice(0, 3)"
          :key="tag"
          class="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/80 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700/50"
        >
          #{{ tag }}
        </span>
      </div>

      <!-- Metrics 指标高亮 -->
      <div class="flex items-center gap-3 text-xs font-mono ml-auto">
        <!-- 今日新增 Stars (GitHub) -->
        <span v-if="item.metrics?.starsToday" class="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-md border border-amber-200/80 dark:border-amber-500/20" title="今日新增 Stars">
          <span>⚡ +{{ formatNumber(item.metrics.starsToday) }}</span>
        </span>

        <!-- 总 Stars (GitHub) -->
        <span v-if="item.metrics?.stars" class="text-slate-600 dark:text-slate-400 flex items-center gap-1" title="总 Stars 收藏">
          <span>⭐ {{ formatNumber(item.metrics.stars) }}</span>
        </span>

        <!-- HN 得分 (Hacker News) -->
        <span v-if="item.metrics?.points" class="text-violet-700 dark:text-violet-300 font-bold flex items-center gap-1 bg-violet-50 dark:bg-violet-950/30 px-2 py-0.5 rounded-md border border-violet-200/80 dark:border-violet-500/20" title="Community Points">
          <span>▲ {{ item.metrics.points }}</span>
        </span>

        <!-- 评论数 (Comments) -->
        <span v-if="item.metrics?.comments !== undefined && item.metrics?.comments > 0" class="text-slate-500 dark:text-slate-400 flex items-center gap-1" title="热评数">
          <span>💬 {{ item.metrics.comments }}</span>
        </span>

        <!-- 投票 (Product Hunt) -->
        <span v-if="item.metrics?.votes" class="text-orange-600 dark:text-orange-400 font-bold flex items-center gap-1 bg-orange-50 dark:bg-orange-950/30 px-2 py-0.5 rounded-md border border-orange-200/80 dark:border-orange-500/20" title="产品投票数">
          <span>🔥 {{ item.metrics.votes }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Item } from '../types.ts'

defineProps<{
  item: Item
  index: number
}>()

function formatNumber(num?: number): string {
  if (!num) return '0'
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return num.toString()
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours <= 0) return '刚刚'
    if (hours < 24) return `${hours}h 前`
    const days = Math.floor(hours / 24)
    return `${days}d 前`
  } catch {
    return ''
  }
}
</script>
