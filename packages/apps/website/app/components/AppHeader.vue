<script setup lang="ts">
const route = useRoute()
const path = computed(() => withoutTrailingSlash(route.path))
const isDocs = computed(() => path.value.startsWith('/docs'))
const { open, toggleSidebar } = useDocsSidebar()
</script>

<template>
  <header class="site-header">
    <div class="wrap site-header-inner">
      <NuxtLink class="brand" to="/" aria-label="Lumpcode">
        <img
          class="brand-lockup"
          src="/logo-lockup.png"
          alt=""
          width="142"
          height="38"
        >
      </NuxtLink>
      <nav class="nav" aria-label="Primary">
        <NuxtLink
          :to="docs.firstPr"
          :class="{
            'router-link-active':
              path === docs.firstPr || path === docs.worker,
          }"
        >
          Get started
        </NuxtLink>
        <NuxtLink
          :to="docs.overview"
          :class="{ 'router-link-active': path.startsWith('/docs') }"
        >
          Docs
        </NuxtLink>
        <a class="nav-optional" :href="githubRepoUrl">GitHub</a>
        <button
          v-if="isDocs"
          class="docs-nav-toggle"
          type="button"
          aria-label="Documentation menu"
          aria-controls="docs-sidebar"
          :aria-expanded="open"
          @click="toggleSidebar"
        >
          <svg class="docs-nav-burger" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 5h12M3 9h12M3 13h12" />
          </svg>
        </button>
      </nav>
    </div>
  </header>
</template>
