<script setup lang="ts">
const props = defineProps<{
  html: string
}>()

const root = ref<HTMLElement | null>(null)

function bindCopyButtons(el: HTMLElement) {
  for (const block of el.querySelectorAll('.docs-code')) {
    if (block.querySelector('.copy-btn')) {
      continue
    }
    const pre = block.querySelector('pre')
    const bar = block.querySelector('.docs-code-bar')
    if (pre === null || bar === null) {
      continue
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'copy-btn'
    button.textContent = 'Copy'
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText)
        button.textContent = 'Copied'
        button.dataset.copied = 'true'
        window.setTimeout(() => {
          button.textContent = 'Copy'
          delete button.dataset.copied
        }, 1600)
      } catch {
        button.textContent = 'Copy'
      }
    })
    bar.append(button)
  }
}

onMounted(() => {
  if (root.value) {
    bindCopyButtons(root.value)
  }
})

watch(
  () => props.html,
  async () => {
    await nextTick()
    if (root.value) {
      bindCopyButtons(root.value)
    }
  },
)
</script>

<template>
  <div ref="root" class="docs-prose" v-html="html" />
</template>
