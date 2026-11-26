<script setup lang="ts">
const theme = ref<'light' | 'dark'>('light')

function apply(next: 'light' | 'dark') {
  theme.value = next
  document.documentElement.dataset.theme = next
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', next === 'light' ? themeColorLight : themeColorDark)
}

function toggle() {
  const next = theme.value === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(themeStorageKey, next)
  } catch {
    // Storage can be blocked; the choice still applies to this page.
  }
  document.documentElement.classList.add('theme-switching')
  apply(next)
  window.setTimeout(() => {
    document.documentElement.classList.remove('theme-switching')
  }, 400)
}

onMounted(() => {
  theme.value = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
})
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    :data-theme-state="theme"
    @click="toggle"
  >
    <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </svg>
    <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8Z" />
    </svg>
  </button>
</template>
