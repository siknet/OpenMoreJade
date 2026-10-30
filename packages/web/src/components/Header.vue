<template>
  <header class="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
      <!-- Logo & 品牌区域 -->
      <div 
        class="flex items-center gap-3 cursor-pointer select-none group" 
        @click="$emit('reset-board')"
        title="返回今日首屏"
      >
        <div class="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-purple-500 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-violet-500/20 group-hover:scale-105 group-hover:shadow-violet-500/30 transition-all duration-200">
          <span class="text-xl">⚡</span>
          <!-- 微光装饰点 -->
          <span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-violet-400 rounded-full ring-2 ring-white dark:ring-slate-950 animate-pulse"></span>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 dark:text-slate-100 font-sans">
              {{ siteName || '摸玉日报' }}
            </h1>
            <span class="text-[10px] font-mono font-semibold tracking-wider px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20">
              RADAR
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 hidden sm:block tracking-normal">
            {{ tagline || '无聊时随便看点什么' }}
          </p>
        </div>
      </div>

      <!-- 全局即时搜索框 -->
      <div class="flex-1 max-w-md hidden md:block">
        <div class="relative group">
          <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-violet-500 transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            ref="searchInputRef"
            :value="searchQuery"
            @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            type="text"
            placeholder="搜索项目、标题、作者或技术标签..."
            class="w-full bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-slate-800 placeholder-slate-400 text-xs rounded-xl pl-10 pr-16 py-2.5 border border-slate-200/90 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:bg-slate-900/60 dark:hover:bg-slate-900/90 dark:focus:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:border-slate-800 dark:focus:border-violet-500/80 dark:focus:ring-violet-500/20 transition-all duration-200"
          />
          <!-- 快捷键徽章 / 清空按钮 -->
          <div class="absolute inset-y-0 right-0 pr-3 flex items-center">
            <button 
              v-if="searchQuery" 
              @click="$emit('update:searchQuery', '')" 
              class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              title="清空搜索"
            >
              ✕
            </button>
            <kbd v-else class="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-xs">
              <span class="text-xs">⌘</span>K
            </kbd>
          </div>
        </div>
      </div>

      <!-- 右侧操作区：刊期切换与主题按钮 -->
      <div class="flex items-center gap-2.5 sm:gap-3">
        <!-- 刊期选择胶囊 -->
        <div class="flex items-center gap-1.5 bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 shadow-xs">
          <span class="text-xs opacity-70">📅</span>
          <select
            :value="selectedDate"
            @change="$emit('change-date', ($event.target as HTMLSelectElement).value)"
            class="bg-transparent text-slate-700 dark:text-slate-200 text-xs font-mono font-medium focus:outline-none cursor-pointer pr-1"
          >
            <option v-for="date in editions" :key="date" :value="date" class="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
              {{ date }} {{ date === today ? '· 今日' : '' }}
            </option>
          </select>
        </div>

        <!-- 亮暗主题切换按钮 -->
        <button
          @click="toggleDark"
          class="p-2 text-slate-500 hover:text-slate-800 bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/90 dark:text-slate-400 dark:hover:text-slate-100 dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:border-slate-800 rounded-xl transition-all duration-200 shadow-xs cursor-pointer"
          :title="isDark ? '切换为清爽白天模式' : '切换为护眼暗色模式'"
        >
          <span v-if="isDark" class="text-amber-400 block text-sm">☀️</span>
          <span v-else class="text-indigo-600 block text-sm">🌙</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{
  siteName?: string
  tagline?: string
  editions: string[]
  selectedDate: string
  today: string
  searchQuery: string
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void
  (e: 'change-date', val: string): void
  (e: 'reset-board'): void
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)
const isDark = ref(false)

// 键盘快捷键监听：Ctrl+K 或 Cmd+K 快速聚焦搜索框
function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  try {
    const saved = localStorage.getItem('site_theme')
    if (saved === 'dark') {
      isDark.value = true
      document.documentElement.classList.add('dark')
    } else {
      isDark.value = false
      document.documentElement.classList.remove('dark')
    }
  } catch {}
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function toggleDark() {
  isDark.value = !isDark.value
  if (isDark.value) {
    document.documentElement.classList.add('dark')
    try {
      localStorage.setItem('site_theme', 'dark')
    } catch {}
  } else {
    document.documentElement.classList.remove('dark')
    try {
      localStorage.setItem('site_theme', 'light')
    } catch {}
  }
}
</script>
