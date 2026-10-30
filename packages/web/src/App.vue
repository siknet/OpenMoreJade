<template>
  <div class="min-h-screen flex flex-col bg-slate-50/80 text-slate-800 dark:bg-slate-950 dark:text-slate-100 font-sans selection:bg-violet-500 selection:text-white transition-colors duration-200 bg-grid-pattern">
    <!-- 顶部常驻导航 -->
    <Header
      :siteName="report?.site.name"
      :tagline="report?.site.tagline"
      :editions="editions"
      :selectedDate="currentDate"
      :today="todayDate"
      v-model:searchQuery="searchQuery"
      @change-date="loadDailyData"
      @reset-board="onResetBoard"
    />

    <!-- 板块快速切换栏 -->
    <BoardNav
      v-if="boards.length > 0"
      :boards="boards"
      :activeBoardId="activeBoardId"
      @select-board="onSelectBoard"
    />

    <!-- 核心主体内容 -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <!-- 骨架屏 / 加载中状态 -->
      <div v-if="loading" class="py-12 space-y-6">
        <div class="h-10 bg-slate-200/70 dark:bg-slate-800/60 rounded-xl w-64 animate-pulse"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
          <div v-for="i in 6" :key="i" class="h-48 bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 animate-pulse flex flex-col justify-between">
            <div class="space-y-3">
              <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
              <div class="h-6 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
              <div class="h-16 bg-slate-100 dark:bg-slate-800/50 rounded-lg"></div>
            </div>
            <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
          </div>
        </div>
      </div>

      <!-- 加载失败错误提示 -->
      <div v-else-if="error" class="text-center py-20 bg-white dark:bg-slate-900/50 rounded-3xl border border-red-500/20 p-8 max-w-xl mx-auto shadow-lg shadow-red-500/5">
        <span class="text-4xl mb-3 block">⚠️</span>
        <h3 class="text-lg font-bold text-red-500 dark:text-red-400 mb-2">获取日报数据失败</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">{{ error }}</p>
        <button
          @click="loadDailyData(currentDate)"
          class="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          重新尝试加载
        </button>
      </div>

      <!-- 数据正常呈现 -->
      <div v-else-if="currentBoard" class="space-y-6">
        <!-- 板块头部看板：标题、精炼描述、子分类胶囊切换 -->
        <div class="bg-white/90 dark:bg-slate-900/40 border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs backdrop-blur-xs">
          <div>
            <div class="flex items-center gap-2.5 mb-1">
              <h2 class="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {{ currentBoard.name }}
              </h2>
              <span class="text-xs font-mono font-bold text-violet-700 bg-violet-50 border border-violet-200/80 dark:text-violet-300 dark:bg-violet-950/40 dark:border-violet-500/30 px-2.5 py-0.5 rounded-full">
                {{ displayedItems.length }} 精选
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ getBoardDescription(currentBoard.id) }}
            </p>
          </div>

          <!-- 子频道切换胶囊（如 HN: TOP / SHOW / BEST，Dev.to: 最新 / 开源） -->
          <div 
            v-if="currentBoard.channels && currentBoard.channels.length > 0" 
            class="flex items-center gap-1.5 bg-slate-100/90 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200/90 dark:border-slate-800 self-start sm:self-auto overflow-x-auto max-w-full"
          >
            <button
              v-for="ch in currentBoard.channels"
              :key="ch.id"
              @click="activeSubChannelId = ch.id"
              :class="[
                activeSubChannelId === ch.id
                  ? 'bg-white text-slate-900 font-bold shadow-xs dark:bg-violet-500/20 dark:text-violet-200 dark:border dark:border-violet-500/30'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                'px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap'
              ]"
            >
              <span>{{ ch.name }}</span>
              <span class="text-[10px] opacity-70 font-mono font-normal">({{ ch.items?.length || 0 }})</span>
            </button>
          </div>
        </div>

        <!-- 搜索无结果提示 -->
        <div v-if="displayedItems.length === 0" class="text-center py-20 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900/30 rounded-3xl border border-slate-200/80 dark:border-slate-800/50 p-8">
          <span class="text-4xl mb-3 block">🔍</span>
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">未找到匹配内容</h4>
          <p class="text-xs text-slate-400 mb-4">没有与关键词 "{{ searchQuery }}" 相关的前沿资讯</p>
          <button 
            @click="searchQuery = ''" 
            class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            清空过滤词
          </button>
        </div>

        <!-- 卡片流网格（双列，大屏体验优雅） -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
          <ItemCard
            v-for="(item, index) in displayedItems"
            :key="item.id || index"
            :item="item"
            :index="index"
          />
        </div>
      </div>
    </main>

    <!-- 极简高质感页脚 -->
    <footer class="mt-auto border-t border-slate-200/90 dark:border-slate-900 bg-white/80 dark:bg-slate-950/80 py-8 text-xs text-slate-500 dark:text-slate-400">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <span class="text-violet-600 dark:text-violet-400 font-bold flex items-center gap-1">
            <span>⚡</span>
            <span>{{ report?.site.name || '摸玉日报' }}</span>
          </span>
          <span class="text-slate-300 dark:text-slate-700">·</span>
          <span>科技与开源每日雷达</span>
        </div>
        <div class="flex items-center gap-3 font-mono text-[11px]">
          <span v-if="report?.updatedAt">更新于 {{ formatDate(report.updatedAt) }}</span>
          <span class="text-slate-300 dark:text-slate-700">·</span>
          <a href="https://github.com/siknet/OpenMoreJade" target="_blank" class="hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            GitHub Repo
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Header from './components/Header.vue'
import BoardNav from './components/BoardNav.vue'
import ItemCard from './components/ItemCard.vue'
import type { DailyReport, BoardData, Item } from './types.ts'

const report = ref<DailyReport | null>(null)
const editions = ref<string[]>([])
const currentDate = ref<string>('')
const todayDate = ref<string>('')
const activeBoardId = ref<string>('')
const activeSubChannelId = ref<string>('')
const searchQuery = ref<string>('')
const loading = ref<boolean>(true)
const error = ref<string | null>(null)

const boards = computed<BoardData[]>(() => report.value?.boards || [])

const currentBoard = computed<BoardData | undefined>(() => {
  return boards.value.find((b) => b.id === activeBoardId.value) || boards.value[0]
})

function getBoardDescription(boardId: string): string {
  switch (boardId) {
    case 'repos': return '官方今日标准总榜，洞察全球顶尖开发者今日最新力作与 Star 飙升趋势'
    case 'news': return '硅谷黑客与极客精神风向标，汇集当下最硬核的技术讨论与行业焦点'
    case 'devto': return '实战经验、架构设计、开源心得与开发者日常工程实践'
    case 'lobsters': return '资深系统工程师与极客社群，专注于精炼的技术架构与版本发布'
    case 'producthunt': return '今日全球新奇产品与 AI 工具首发首秀，抢先探索创新生产力'
    default: return '精选科技资讯与技术雷达'
  }
}

function onResetBoard() {
  if (boards.value.length > 0) {
    onSelectBoard(boards.value[0].id)
  }
  searchQuery.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function onSelectBoard(id: string) {
  activeBoardId.value = id
  const target = boards.value.find((b) => b.id === id)
  if (target?.channels && target.channels.length > 0) {
    activeSubChannelId.value = target.channels[0].id
  } else {
    activeSubChannelId.value = ''
  }
}

// 统一过滤与计算当前展示条目（包含子分类筛选和搜索关键词过滤）
const displayedItems = computed<Item[]>(() => {
  if (!currentBoard.value) return []

  let rawList: Item[] = []
  if (currentBoard.value.channels && currentBoard.value.channels.length > 0) {
    const ch = currentBoard.value.channels.find((c) => c.id === activeSubChannelId.value)
    rawList = ch ? ch.items || [] : currentBoard.value.channels[0]?.items || []
  } else {
    rawList = currentBoard.value.items || []
  }

  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    return rawList
  }

  return rawList.filter((item) => {
    return (
      item.title?.toLowerCase().includes(query) ||
      item.titleZh?.toLowerCase().includes(query) ||
      item.summary?.toLowerCase().includes(query) ||
      item.summaryZh?.toLowerCase().includes(query) ||
      item.author?.toLowerCase().includes(query) ||
      item.tags?.some((t) => t.toLowerCase().includes(query))
    )
  })
})

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

async function loadDailyData(date?: string) {
  loading.value = true
  error.value = null

  try {
    // 1. 获取刊期历史
    try {
      const editionsRes = await fetch('/data/editions.json')
      if (editionsRes.ok) {
        editions.value = await editionsRes.json()
      }
    } catch {}

    // 2. 确定加载哪个日期
    let targetDate = date
    if (!targetDate) {
      if (editions.value.length > 0) {
        targetDate = editions.value[0]
      } else {
        const d = new Date()
        targetDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d)
      }
    }

    currentDate.value = targetDate
    todayDate.value = editions.value[0] || targetDate

    // 3. 读取该日期的 JSON（优先尝试按日期读取，回退到 latest.json）
    let dataRes = await fetch(`/data/daily/${targetDate}.json`)
    if (!dataRes.ok) {
      dataRes = await fetch('/data/latest.json')
    }

    if (!dataRes.ok) {
      throw new Error(`无法获取刊期数据 (${dataRes.status})`)
    }

    report.value = await dataRes.json()

    // 默认激活第一个栏目
    if (!activeBoardId.value && boards.value.length > 0) {
      onSelectBoard(boards.value[0].id)
    } else if (activeBoardId.value) {
      onSelectBoard(activeBoardId.value)
    }
  } catch (err: any) {
    error.value = err.message || '加载日报失败，请检查数据文件是否存在。'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadDailyData()
})
</script>
