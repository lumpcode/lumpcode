<script setup lang="ts">
const route = useRoute()
const url = computed(() => `${siteUrl}${route.path === '/' ? '' : route.path}`)

useHead(() => ({
  link: [{ rel: 'canonical', href: url.value }],
  meta: [{ property: 'og:url', content: url.value }],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
