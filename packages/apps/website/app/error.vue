<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const title = computed(() =>
  props.error.statusCode === 404 ? 'Page not found' : 'Something went wrong',
)

useHead({
  title: title.value,
})
</script>

<template>
  <div>
    <a class="skip-link" href="#main">Skip to content</a>
    <AppHeader />
    <main id="main" class="wrap error-page">
      <div>
        <p class="section-kicker">{{ error.statusCode }}</p>
        <h1>{{ title }}</h1>
        <p>That route is not part of this site.</p>
        <NuxtLink class="btn btn-primary" to="/">Back to Lumpcode</NuxtLink>
      </div>
    </main>
    <AppFooter />
  </div>
</template>
