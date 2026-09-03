<script setup lang="ts">
const { toggleSidebar } = useDocsSidebar()
const { openSearch } = useDocsSearch()
const searchHotkey = ref('⌘K')

function onWindowKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
  }
}

onMounted(() => {
  searchHotkey.value = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'
  window.addEventListener('keydown', onWindowKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKey)
})
</script>

<template>
  <div>
    <a class="skip-link" href="#main">Skip to content</a>
    <AppHeader />
    <div class="docs-shell">
      <DocsSidebar />
      <div class="docs-frame">
        <div class="docs-toolbar">
          <button class="docs-toolbar-btn" type="button" @click="toggleSidebar">
            Menu
          </button>
          <button class="docs-toolbar-btn docs-toolbar-search" type="button" @click="openSearch">
            Search
            <kbd>{{ searchHotkey }}</kbd>
          </button>
        </div>
        <main id="main" class="docs-main">
          <slot />
        </main>
      </div>
    </div>
    <AppFooter />
    <DocsSearch />
  </div>
</template>
