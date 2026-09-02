<script setup lang="ts">
const route = useRoute()
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
              route.path === docs.firstPr || route.path === docs.worker,
          }"
        >
          Get started
        </NuxtLink>
        <NuxtLink
          :to="docs.overview"
          :class="{ 'router-link-active': route.path.startsWith('/docs') }"
        >
          Docs
        </NuxtLink>
        <a class="nav-optional" :href="githubRepoUrl">GitHub</a>
      </nav>
    </div>
  </header>
</template>
