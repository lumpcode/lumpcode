<script setup lang="ts">
// The wordmark is outlined text (brand/wordmark.mjs). Inlined so it takes the current text colour;
// hidden from assistive tech because every link around it carries the "Lumpcode" label.
import wordmarkSvg from '~~/public/wordmark.svg?raw'

const wordmark = wordmarkSvg.replace('role="img" aria-label="lumpcode"', 'aria-hidden="true" focusable="false"')
</script>

<template>
  <span class="brand-mark">
    <Lumpfish class="brand-fish" />
    <span class="brand-word" v-html="wordmark" />
  </span>
</template>
