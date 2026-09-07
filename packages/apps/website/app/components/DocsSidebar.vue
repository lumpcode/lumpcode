<script setup lang="ts">
const route = useRoute()
const { open, closeSidebar } = useDocsSidebar()
const { openSearch } = useDocsSearch()
const searchHotkey = ref('⌘K')

watch(
  () => route.path,
  () => {
    closeSidebar()
  },
)

onMounted(() => {
  searchHotkey.value = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'
})
</script>

<template>
  <aside id="docs-sidebar" class="docs-sidebar" :data-open="open">
    <div class="docs-sidebar-head">
      <p class="docs-sidebar-kicker">Docs</p>
      <button
        class="docs-sidebar-close"
        type="button"
        aria-label="Close documentation menu"
        @click="closeSidebar"
      >
        <svg class="docs-nav-burger" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M5 5l8 8M13 5l-8 8" />
        </svg>
      </button>
    </div>
    <button class="docs-sidebar-search" type="button" @click="openSearch">
      Search
      <kbd>{{ searchHotkey }}</kbd>
    </button>
    <nav class="docs-nav" aria-label="Documentation">
      <section v-for="section in docsNav" :key="section.title" class="docs-nav-section">
        <h2>{{ section.title }}</h2>
        <ul>
          <li v-for="item in section.items" :key="item.path">
            <NuxtLink
              :to="item.path"
              class="docs-nav-link"
              :class="{ 'is-active': isDocsNavActive(item.path, route.path) }"
            >
              {{ item.title }}
            </NuxtLink>
          </li>
        </ul>
      </section>
    </nav>
  </aside>
  <button
    v-if="open"
    class="docs-sidebar-backdrop"
    type="button"
    aria-label="Close documentation menu"
    @click="closeSidebar"
  />
</template>
