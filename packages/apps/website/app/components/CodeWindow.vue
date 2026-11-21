<script setup lang="ts">
const props = defineProps<{
  filename: string
  code: string
  /** Wrap each line in a span so wrapped lines keep a hanging indent (see .code-lines). */
  lines?: boolean
}>()

const highlighted = computed(() => {
  const html = highlightSnippet(props.code, props.filename)
  if (!props.lines) {
    return html
  }
  // Highlighted tokens never span a newline for the snippets that use this (JSON, trees).
  return html
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => {
      const indent = /^ */.exec(line.replace(/<[^>]+>/g, ''))?.[0].length ?? 0
      return `<span class="code-line" style="--indent:${indent}ch">${line || ' '}</span>`
    })
    .join('')
})

const copied = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    copied.value = false
  }
}

onBeforeUnmount(() => {
  clearTimeout(resetTimer)
})
</script>

<template>
  <div class="code-window">
    <div class="code-window-bar">
      <span>{{ filename }}</span>
      <button
        class="copy-btn"
        type="button"
        :data-copied="copied"
        @click="copy"
      >
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </div>
    <pre :class="{ 'code-lines': lines }"><code v-html="highlighted"></code></pre>
  </div>
</template>
