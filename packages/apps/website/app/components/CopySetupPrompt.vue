<script setup lang="ts">
import installPrompt from '../assets/install-prompt.md?raw'

const copySetupLabel = 'Copy setup prompt'
const copyLabel = ref(copySetupLabel)
const copyStatus = ref('')
let copyTimer: ReturnType<typeof setTimeout> | undefined

function resetCopyLabel() {
  copyLabel.value = copySetupLabel
  copyStatus.value = ''
}

function showCopyState(label: 'Copied' | 'Copy failed') {
  copyLabel.value = label
  copyStatus.value = label
  clearTimeout(copyTimer)
  copyTimer = setTimeout(resetCopyLabel, 1600)
}

async function copySetupPrompt() {
  try {
    await navigator.clipboard.writeText(installPrompt)
    showCopyState('Copied')
  } catch {
    showCopyState('Copy failed')
  }
}

onBeforeUnmount(() => {
  clearTimeout(copyTimer)
})
</script>

<template>
  <button type="button" class="btn btn-primary install-copy-btn" @click="copySetupPrompt">
    <span class="install-copy-sizer" aria-hidden="true">{{ copySetupLabel }}</span>
    <span class="install-copy-label">{{ copyLabel }}</span>
  </button>
  <span class="install-copy-status" aria-live="polite">{{ copyStatus }}</span>
</template>
