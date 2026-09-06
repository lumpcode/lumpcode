<script setup lang="ts">
const { openSearch } = useDocsSearch()

const desktopDocsQuery = '(min-width: 861px)'

function onWindowKey(event: KeyboardEvent) {
  if (!window.matchMedia(desktopDocsQuery).matches) {
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
  }
}

onMounted(() => {
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
        <main id="main" class="docs-main">
          <slot />
        </main>
      </div>
    </div>
    <AppFooter />
    <DocsSearch />
  </div>
</template>
