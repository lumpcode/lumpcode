<script setup lang="ts">
defineProps<{
  lines: readonly { tag: string; text: string; tone: string }[]
}>()
</script>

<template>
  <div class="code-window step-visual step-terminal">
    <div class="code-window-bar">
      <span>worker clone</span>
    </div>
    <div class="term-body">
      <p
        v-for="(line, index) in lines"
        :key="index"
        class="term-line"
        :class="{ 'term-cmd': line.tone === 'cmd', 'anim-line': index > 0 }"
        :data-tone="line.tone"
        :style="{ '--d': index }"
      >
        <span :class="line.tone === 'cmd' ? 'term-prompt' : 'term-tag'">{{ line.tag }}</span>
        <span class="term-text">{{ line.text }}</span>
      </p>
      <span class="term-caret anim-line" :style="{ '--d': lines.length }" aria-hidden="true" />
    </div>
  </div>
</template>
