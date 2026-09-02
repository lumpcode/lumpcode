<script setup lang="ts">
import type { DocsHeading } from '~/utils/renderMarkdown'

const props = withDefaults(
  defineProps<{
    title: string
    description: string
    path: string
    headings?: DocsHeading[]
    sourcePath?: string
    kicker?: string
  }>(),
  {
    headings: () => [],
  },
)

const kickerText = computed(() => props.kicker ?? docsKicker(props.path))
const sourceUrl = computed(() =>
  props.sourcePath === undefined ? undefined : `${githubRepoUrl}/blob/main/${props.sourcePath}`,
)
</script>

<template>
  <div class="docs-columns">
    <div class="docs-article-wrap">
      <article class="docs-article">
        <header class="docs-article-head">
          <p class="section-kicker">{{ kickerText }}</p>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
          <slot name="intro" />
        </header>
        <details v-if="headings.length > 0" class="docs-toc-mobile">
          <summary>On this page</summary>
          <ol>
            <li
              v-for="heading in headings"
              :key="heading.id"
              :data-depth="heading.depth"
            >
              <a :href="`#${heading.id}`">{{ heading.text }}</a>
            </li>
          </ol>
        </details>
        <slot />
        <p v-if="sourceUrl" class="docs-source">
          <a :href="sourceUrl">Edit this page</a>
        </p>
      </article>
      <DocsPager :path="path" />
    </div>
    <DocsToc :headings="headings" />
  </div>
</template>
