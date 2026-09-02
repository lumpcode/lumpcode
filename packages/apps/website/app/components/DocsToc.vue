<script setup lang="ts">
import type { DocsHeading } from '~/utils/renderMarkdown'

defineProps<{
  headings: DocsHeading[]
}>()
</script>

<template>
  <nav v-if="headings.length > 0" class="docs-toc" aria-label="On this page">
    <p class="docs-toc-label">On this page</p>
    <ol>
      <li v-for="heading in headings" :key="heading.id" :data-depth="heading.depth">
        <a :href="`#${heading.id}`">{{ heading.text }}</a>
      </li>
    </ol>
  </nav>
</template>
