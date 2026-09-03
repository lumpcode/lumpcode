<script setup lang="ts">
const props = defineProps<{
  filename: string
  code: string
}>()

const highlighted = computed(() => highlightSnippet(props.code, props.filename))

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
    <pre><code v-html="highlighted"></code></pre>
  </div>
</template>
