<script setup lang="ts">
defineProps<{
  current: 'run' | 'daemon'
}>()
</script>

<template>
  <nav class="path-nav" aria-label="Getting started path">
    <NuxtLink
      to="/get-started"
      class="path-card"
      :class="{ 'is-current': current === 'run' }"
    >
      <strong>One run</strong>
      <span>Shared mode on your laptop. First PR by hand.</span>
    </NuxtLink>
    <NuxtLink
      to="/get-started/daemon"
      class="path-card"
      :class="{ 'is-current': current === 'daemon' }"
    >
      <strong>Dedicated daemon</strong>
      <span>A worker clone ticks every lump. You merge.</span>
    </NuxtLink>
  </nav>
</template>
