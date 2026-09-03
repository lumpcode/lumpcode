<script setup lang="ts">
const route = useRoute()
await navigateTo(
  { path: docs.firstPr, query: route.query, hash: route.hash },
  { redirectCode: 301 },
)
</script>
