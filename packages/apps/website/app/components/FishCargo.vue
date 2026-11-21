<script setup lang="ts">
import type { Cargo } from '~/utils/fishCargo'

defineProps<{ cargo: Cargo }>()
</script>

<template>
  <span class="cargo" :data-cargo="cargo.kind === 'treat' ? cargo.treat : cargo.kind">
    <span v-if="cargo.kind === 'file'" class="cargo-file" :style="{ '--ext': cargo.color }">
      <span class="cargo-file-lines" />
      <span class="cargo-file-ext">{{ cargo.label }}</span>
    </span>

    <span v-else-if="cargo.kind === 'patch'" class="cargo-file cargo-patch">
      <span class="patch-line is-ctx" />
      <span class="patch-line is-del" />
      <span class="patch-line is-add" />
      <span class="patch-line is-add is-short" />
      <span class="patch-line is-ctx is-short" />
    </span>

    <svg v-else-if="cargo.treat === 'cake'" class="cargo-treat" viewBox="0 0 40 44">
      <path class="cake-flame" d="M20 2c2.4 3 3 5 1.6 6.6a2.2 2.2 0 0 1-3.2 0C17 7 17.6 5 20 2Z" />
      <rect fill="#8fd1f0" x="18.6" y="9" width="2.8" height="9" rx="1" />
      <rect fill="#f7a8c4" x="6" y="18" width="28" height="9" rx="3" />
      <path fill="#fff6ee" d="M6 22c3 3 5 3 7 0s4-3 7 0 4 3 7 0 4-3 7 0v-1.5H6Z" />
      <rect fill="#c98a5a" x="3" y="27" width="34" height="11" rx="3" />
      <path fill="#fff6ee" d="M3 31c3.5 3 6 3 8.5 0s5-3 8.5 0 5-3 8.5 0 5-3 8.5 0v-2H3Z" />
      <rect fill="#dfe8ec" x="0" y="38" width="40" height="3" rx="1.5" />
    </svg>

    <svg v-else-if="cargo.treat === 'burger'" class="cargo-treat" viewBox="0 0 40 36">
      <path fill="#e9a54b" d="M4 14C4 6 11 2 20 2s16 4 16 12Z" />
      <g fill="#fff3d6">
        <ellipse cx="13" cy="7" rx="1.3" ry="0.8" />
        <ellipse cx="21" cy="5.4" rx="1.3" ry="0.8" />
        <ellipse cx="28" cy="8" rx="1.3" ry="0.8" />
        <ellipse cx="17" cy="10" rx="1.3" ry="0.8" />
      </g>
      <path fill="#6cc04a" d="M2 15h36l-3 3-3-2-3 2-3-2-3 2-3-2-3 2-3-2-3 2-3-2-3 2Z" />
      <path fill="#f6c343" d="M4 18h32l-4 4-4-3H8Z" />
      <rect fill="#7a3f22" x="3" y="20" width="34" height="6" rx="3" />
      <path fill="#e9a54b" d="M4 27h32c0 4-3 7-7 7H11c-4 0-7-3-7-7Z" />
    </svg>

    <svg v-else class="cargo-treat" viewBox="0 0 40 40">
      <path fill="#e9a54b" d="M3 6C14 0 26 0 37 6l-2.6 4C25 5 15 5 5.6 10Z" />
      <path fill="#f6c343" d="M5.6 10C15 5 25 5 34.4 10L20 38Z" />
      <path fill="#f9d977" d="M8 11.5c7-3 17-3 24 0" stroke="#f9d977" stroke-width="1" />
      <g fill="#d8493a">
        <circle cx="15" cy="13" r="2.8" />
        <circle cx="24" cy="15" r="2.6" />
        <circle cx="19" cy="23" r="2.4" />
        <circle cx="21" cy="30" r="1.8" />
      </g>
      <g fill="#5a9e3a">
        <ellipse cx="20" cy="11" rx="1.4" ry="0.8" />
        <ellipse cx="16.5" cy="19" rx="1.2" ry="0.7" />
        <ellipse cx="23" cy="22" rx="1.2" ry="0.7" />
      </g>
    </svg>
  </span>
</template>
