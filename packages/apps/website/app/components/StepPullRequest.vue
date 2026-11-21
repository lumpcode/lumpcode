<script setup lang="ts">
defineProps<{
  pr: {
    title: string
    branch: string
    stats: string
    events: readonly { kind: string; text: string }[]
    footer: string
  }
}>()
</script>

<template>
  <div class="code-window step-visual step-pr">
    <div class="code-window-bar">
      <span>pull request</span>
      <span class="pr-merged anim-line" :style="{ '--d': pr.events.length + 1 }">Merged</span>
    </div>
    <div class="pr-body">
      <p class="pr-title">{{ pr.title }}</p>
      <p class="pr-meta">
        <code>{{ pr.branch }}</code>
        <span class="pr-stats">{{ pr.stats }}</span>
      </p>
      <ol class="pr-events">
        <li
          v-for="(event, index) in pr.events"
          :key="index"
          class="pr-event anim-line"
          :data-kind="event.kind"
          :style="{ '--d': index + 1 }"
        >
          <span class="pr-icon" aria-hidden="true" />
          <span>{{ event.text }}</span>
        </li>
      </ol>
    </div>
    <p class="branch-footer anim-line" :style="{ '--d': pr.events.length + 2 }">{{ pr.footer }}</p>
  </div>
</template>
