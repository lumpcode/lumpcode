<script setup lang="ts">
definePageMeta({
  layout: 'docs',
})

const route = useRoute()

const redirectTo = docsRedirectTarget(route.path)
if (redirectTo !== undefined) {
  await navigateTo(
    { path: redirectTo, query: route.query, hash: route.hash },
    { redirectCode: 301 },
  )
}

const page = computed(() => getDocPage(route.path))
if (page.value === undefined && redirectTo === undefined) {
  throw createError({ statusCode: 404, statusMessage: 'Docs page not found' })
}

useHead(() =>
  page.value === undefined
    ? {}
    : {
        title: page.value.title,
        meta: [
          { name: 'description', content: page.value.description },
          { property: 'og:title', content: `${page.value.title} · Lumpcode` },
          { property: 'og:description', content: page.value.description },
        ],
      },
)
</script>

<template>
  <DocsPageShell
    v-if="page"
    :title="page.title"
    :description="page.description"
    :path="page.path"
    :headings="page.headings"
    :source-path="page.sourcePath"
  >
    <DocsMarkdown :html="page.html" />
  </DocsPageShell>
</template>
