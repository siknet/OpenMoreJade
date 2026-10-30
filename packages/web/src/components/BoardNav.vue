<template>
  <div class="border-b border-slate-200/90 dark:border-slate-800/80 bg-white/70 dark:bg-slate-950/70 sticky top-16 z-40 backdrop-blur-md transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <nav class="flex space-x-1.5 sm:space-x-2.5 overflow-x-auto py-2.5 no-scrollbar" aria-label="Boards">
        <button
          v-for="board in boards"
          :key="board.id"
          @click="$emit('select-board', board.id)"
          :class="[
            activeBoardId === board.id
              ? 'bg-slate-900 text-white shadow-sm dark:bg-violet-500/20 dark:text-violet-200 dark:border-violet-500/40 border-slate-900 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border-transparent dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900/60 font-medium',
            'whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs sm:text-sm border flex items-center gap-2 transition-all duration-150 cursor-pointer select-none group'
          ]"
        >
          <!-- 图标 -->
          <span class="text-sm transition-transform duration-150 group-hover:scale-110">
            {{ getIcon(board.source) }}
          </span>

          <!-- 板块名称 -->
          <span>{{ board.name }}</span>

          <!-- 数量徽章 -->
          <span
            :class="[
              activeBoardId === board.id
                ? 'bg-white/20 text-white dark:bg-violet-500/30 dark:text-violet-200'
                : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
              'text-[10px] font-mono px-1.5 py-0.5 rounded-md font-semibold transition-colors'
            ]"
          >
            {{ getItemCount(board) }}
          </span>
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BoardData } from '../types.ts'

defineProps<{
  boards: BoardData[]
  activeBoardId: string
}>()

defineEmits<{
  (e: 'select-board', id: string): void
}>()

function getIcon(source: string) {
  switch (source) {
    case 'github': return '⭐'
    case 'hackernews': return '🔥'
    case 'devto': return '📝'
    case 'lobsters': return '🦞'
    case 'producthunt': return '🚀'
    default: return '📌'
  }
}

function getItemCount(board: BoardData) {
  if (board.channels && board.channels.length > 0) {
    return board.channels.reduce((sum, ch) => sum + (ch.items?.length || 0), 0)
  }
  return board.items?.length || 0
}
</script>
