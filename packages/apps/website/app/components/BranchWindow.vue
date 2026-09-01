<script setup lang="ts">
const props = defineProps<{
  filename: string
  branches: readonly { name: string; state: string; label: string }[]
  footer: string
  loop?: boolean
}>()

const rows = ref(props.branches.map((branch) => ({ ...branch })))

let intervalId: number | undefined

onMounted(() => {
  if (!props.loop) {
    return
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  const index = rows.value.findIndex((branch) => branch.state === 'running')
  const target = index === -1 ? rows.value.length - 1 : index
  intervalId = window.setInterval(() => {
    const row = rows.value[target]
    if (row === undefined) {
      return
    }
    if (row.state === 'running') {
      rows.value[target] = { ...row, state: 'open', label: 'pushed' }
      return
    }
    rows.value[target] = { ...row, state: 'running', label: 'running' }
  }, 3500)
})

onUnmounted(() => {
  if (intervalId !== undefined) {
    window.clearInterval(intervalId)
  }
})
</script>

<template>
  <div class="code-window branch-window">
    <div class="code-window-bar">
      <span>{{ filename }}</span>
    </div>
    <ul class="branch-list">
      <li v-for="branch in rows" :key="branch.name">
        <code>{{ branch.name }}</code>
        <span class="branch-state" :data-state="branch.state">{{ branch.label }}</span>
      </li>
    </ul>
    <p class="branch-footer">{{ footer }}</p>
  </div>
</template>
