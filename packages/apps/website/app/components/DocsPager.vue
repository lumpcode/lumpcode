<script setup lang="ts">
const props = defineProps<{
  path: string
}>()

const neighbors = computed(() => docsNeighbors(props.path))
</script>

<template>
  <nav v-if="neighbors.previous || neighbors.next" class="docs-pager" aria-label="Next pages">
    <NuxtLink
      v-if="neighbors.previous"
      class="docs-pager-link"
      :to="neighbors.previous.path"
    >
      <span>Previous</span>
      <strong>{{ neighbors.previous.title }}</strong>
    </NuxtLink>
    <span v-else />
    <NuxtLink
      v-if="neighbors.next"
      class="docs-pager-link docs-pager-next"
      :to="neighbors.next.path"
    >
      <span>Next</span>
      <strong>{{ neighbors.next.title }}</strong>
    </NuxtLink>
  </nav>
</template>
