<script setup lang="ts">
defineProps<{
  current: 'run' | 'worker'
}>()
</script>

<template>
  <nav class="path-nav path-nav-sequence" aria-label="Getting started path">
    <NuxtLink
      to="/get-started"
      class="path-card"
      :class="{ 'is-current': current === 'run' }"
    >
      <strong>First PR</strong>
      <span>One campaign on the laptop, by hand.</span>
    </NuxtLink>
    <span class="path-nav-arrow" aria-hidden="true">→</span>
    <NuxtLink
      to="/get-started/worker"
      class="path-card"
      :class="{ 'is-current': current === 'worker' }"
    >
      <strong>Leave a worker running</strong>
      <span>A clone you never edit. You merge.</span>
    </NuxtLink>
  </nav>
</template>
