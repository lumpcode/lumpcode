<script setup lang="ts">
const { open, closeSearch } = useDocsSearch()
const query = ref('')
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)

const hits = computed(() => searchDocs(query.value))

watch(open, async (isOpen) => {
  if (isOpen) {
    query.value = ''
    active.value = 0
    await nextTick()
    input.value?.focus()
  }
})

watch(hits, () => {
  active.value = 0
})

function go(path: string) {
  closeSearch()
  void navigateTo(path)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeSearch()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(active.value + 1, Math.max(hits.value.length - 1, 0))
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(active.value - 1, 0)
    return
  }
  if (event.key === 'Enter') {
    const hit = hits.value[active.value]
    if (hit) {
      go(hit.path)
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="docs-search" role="dialog" aria-modal="true" aria-label="Search docs">
      <button class="docs-search-backdrop" type="button" aria-label="Close search" @click="closeSearch" />
      <div class="docs-search-panel" @keydown="onKey">
        <input
          ref="input"
          v-model="query"
          class="docs-search-input"
          type="search"
          placeholder="Search the docs"
          autocomplete="off"
          spellcheck="false"
        >
        <p v-if="query.trim() === ''" class="docs-search-empty">
          Try “context”, “worker”, or “lump-plan”.
        </p>
        <p v-else-if="hits.length === 0" class="docs-search-empty">
          No matches.
        </p>
        <ul v-else class="docs-search-hits">
          <li v-for="(hit, index) in hits" :key="hit.path">
            <button
              class="docs-search-hit"
              type="button"
              :data-active="index === active"
              @mouseenter="active = index"
              @click="go(hit.path)"
            >
              <strong>{{ hit.title }}</strong>
              <span>{{ hit.description }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
