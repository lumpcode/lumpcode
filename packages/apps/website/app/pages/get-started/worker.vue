<script setup lang="ts">
const route = useRoute()
await navigateTo(
  { path: docs.worker, query: route.query, hash: route.hash },
  { redirectCode: 301 },
)
</script>
