<script setup lang="ts">
import { randomCargo, type Cargo } from '~/utils/fishCargo'

/**
 * Decorative background: a school of lumpfish crosses once on load,
 * then a few slow drifters and bubbles keep the water alive.
 * Fixed values keep server and client markup identical.
 */
// `schoolPlays`: whether the school crosses on this page view, decided once by the page (claimSchoolPass)
// so every layer agrees. It only matters on the client.
const props = withDefaults(defineProps<{ layer?: 'back' | 'school'; schoolPlays?: boolean }>(), {
  layer: 'back',
  schoolPlays: true,
})

// The school leaves the DOM once it has crossed, so nothing keeps animating.
const schoolDoneAfterMs = 9000
const showSchool = ref(true)
let schoolTimer: ReturnType<typeof setTimeout> | undefined

type Tint = 'teal' | 'aqua' | 'ocean' | 'deep' | 'coral' | 'amber' | 'violet' | 'olive'

// size in rem; small fish read as farther away (dimmer, softer).
const schoolFish: readonly { top: number; size: number; delay: number; duration: number; bob: number }[] = [
  { top: 22, size: 3, delay: 0.9, duration: 4.6, bob: 1.1 },
  { top: 31, size: 4.6, delay: 1.05, duration: 4.3, bob: 1.3 },
  { top: 27, size: 1.4, delay: 1.25, duration: 5.6, bob: 0.8 },
  { top: 40, size: 3.4, delay: 0.95, duration: 4.5, bob: 1.2 },
  { top: 47, size: 2.3, delay: 1.35, duration: 5, bob: 1 },
  { top: 35, size: 6.4, delay: 1.15, duration: 3.9, bob: 1.5 },
  { top: 54, size: 2.8, delay: 1.5, duration: 4.8, bob: 1.1 },
  { top: 16, size: 1.2, delay: 1.6, duration: 6, bob: 0.8 },
  { top: 44, size: 1.8, delay: 1.75, duration: 5.4, bob: 1 },
  { top: 30, size: 1.5, delay: 1.9, duration: 5.8, bob: 0.8 },
  { top: 60, size: 1.1, delay: 2.05, duration: 6.2, bob: 0.7 },
  { top: 20, size: 2.1, delay: 2.2, duration: 5.2, bob: 0.9 },
]

// The school always has the same colour mix; only who wears which colour is random.
// Cold shades only: warm colours are for the slow background fish, easier on the eye.
const schoolPalette: readonly Tint[] = [
  'teal', 'teal', 'teal', 'teal', 'teal', 'teal', 'teal', 'teal',
  'aqua', 'ocean', 'ocean', 'deep',
]

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

// Server markup uses the palette order; the client shuffles before the school appears.
const schoolTints = ref<Tint[]>([...schoolPalette])

// `start` is seconds after the water opens: once the school has mostly crossed, or right after load
// when it does not play. The first drifter always carries a diff on its first pass.
// `top` is % of the section; `topNarrow` is in screen heights, used in the hero on narrow screens,
// where the stacked hero is so tall that a % puts fish far below the first screen.
const drifters: readonly {
  top: number
  topNarrow: number
  size: number
  start: number
  duration: number
  reverse: boolean
  tint: Tint
}[] = [
  { top: 70, topNarrow: 62, size: 6, start: 0, duration: 46, reverse: false, tint: 'teal' },
  { top: 28, topNarrow: 30, size: 1.4, start: 3, duration: 60, reverse: true, tint: 'deep' },
  { top: 12, topNarrow: 18, size: 3.2, start: 5, duration: 58, reverse: true, tint: 'coral' },
  { top: 56, topNarrow: 84, size: 4, start: 8, duration: 50, reverse: false, tint: 'ocean' },
  { top: 44, topNarrow: 45, size: 1.8, start: 11, duration: 64, reverse: false, tint: 'amber' },
  { top: 92, topNarrow: 110, size: 2.2, start: 14, duration: 56, reverse: true, tint: 'aqua' },
  { top: 84, topNarrow: 135, size: 2.6, start: 17, duration: 52, reverse: true, tint: 'violet' },
  { top: 34, topNarrow: 160, size: 3, start: 23, duration: 54, reverse: false, tint: 'olive' },
]

const waterOpensAfterSchool = 6
const waterOpensWithoutSchool = 1.9
// Drifters swim from 14vw plus their own width off one edge to 12vw past the other (see drift-right).
// Skip the part of that run spent off screen, so each fish reaches the edge when its turn comes.
const edgeMarginPx = 4

function drifterDelays(opensAt: number, viewportPx: number): number[] {
  const remPx = 16
  return drifters.map((fish) => {
    const sizePx = fish.size * remPx
    const runPx = 1.26 * viewportPx + sizePx
    const hiddenPx = (fish.reverse ? 0.12 * viewportPx : 0.14 * viewportPx) - edgeMarginPx
    return opensAt + fish.start - fish.duration * Math.max(0, hiddenPx) / runPx
  })
}

// Server markup assumes the school plays on a desktop-width screen; the client corrects both.
const drifterDelay = ref(drifterDelays(waterOpensAfterSchool, 1440))

// Cargo is picked on the client only, so prerendered markup stays stable.
const drifterCargo = ref<(Cargo | null)[]>(drifters.map(() => null))

function maybeCargo(chance: number): Cargo | null {
  return Math.random() < chance ? randomCargo() : null
}

function onDrifterLoop(index: number, event: AnimationEvent) {
  if (!event.animationName.startsWith('drift-')) {
    return
  }
  drifterCargo.value[index] = drifters[index]!.size >= 2 ? maybeCargo(0.6) : null
}

onMounted(() => {
  const { schoolPlays } = props
  if (props.layer === 'school') {
    if (!schoolPlays) {
      showSchool.value = false
      return
    }
    schoolTimer = setTimeout(() => {
      showSchool.value = false
    }, schoolDoneAfterMs)
  }
  schoolTints.value = shuffled(schoolPalette)
  drifterDelay.value = drifterDelays(
    schoolPlays ? waterOpensAfterSchool : waterOpensWithoutSchool,
    window.innerWidth,
  )
  drifterCargo.value = drifters.map((fish, index) =>
    index === 0 ? { kind: 'patch' } : fish.size >= 2 ? maybeCargo(0.6) : null,
  )
})

onBeforeUnmount(() => {
  clearTimeout(schoolTimer)
})

function fishClass(size: number, tint: Tint) {
  return {
    [`fish-${tint}`]: tint !== 'teal',
    'is-far': size < 2,
    'is-near': size > 5,
  }
}

const bubbles = [
  { left: 8, size: 0.5, delay: 0, duration: 11 },
  { left: 17, size: 0.3, delay: 4, duration: 9 },
  { left: 29, size: 0.45, delay: 7, duration: 13 },
  { left: 46, size: 0.35, delay: 2, duration: 10 },
  { left: 58, size: 0.55, delay: 9, duration: 14 },
  { left: 71, size: 0.3, delay: 5, duration: 9.5 },
  { left: 83, size: 0.45, delay: 1, duration: 12 },
  { left: 93, size: 0.35, delay: 6, duration: 10.5 },
] as const
</script>

<template>
  <div v-if="layer === 'school' && showSchool" class="aquarium aquarium-front" aria-hidden="true">
    <div
      v-for="(fish, index) in schoolFish"
      :key="`school-${index}`"
      class="aq-fish aq-school"
      :class="fishClass(fish.size, schoolTints[index] ?? 'teal')"
      :style="{
        '--top': `${fish.top}%`,
        '--size': `${fish.size}rem`,
        '--delay': `${fish.delay}s`,
        '--duration': `${fish.duration}s`,
        '--bob': `${fish.bob}s`,
      }"
    >
      <div class="aq-bob">
        <Lumpfish animated />
      </div>
    </div>
  </div>
  <div v-else-if="layer === 'back'" class="aquarium" aria-hidden="true">
    <div class="aquarium-rays" />
    <div
      v-for="(fish, index) in drifters"
      :key="`drift-${index}`"
      class="aq-fish aq-drifter"
      :class="[fishClass(fish.size, fish.tint), { 'is-reverse': fish.reverse }]"
      :style="{
        '--top': `${fish.top}%`,
        '--top-narrow': `${fish.topNarrow}svh`,
        '--size': `${fish.size}rem`,
        '--delay': `${drifterDelay[index]}s`,
        '--duration': `${fish.duration}s`,
      }"
      @animationiteration="onDrifterLoop(index, $event)"
    >
      <div class="aq-bob">
        <Lumpfish animated />
        <FishCargo v-if="drifterCargo[index]" :cargo="drifterCargo[index]!" />
      </div>
    </div>
    <span
      v-for="(bubble, index) in bubbles"
      :key="`bubble-${index}`"
      class="aq-bubble"
      :style="{
        left: `${bubble.left}%`,
        '--size': `${bubble.size}rem`,
        '--delay': `${bubble.delay}s`,
        '--duration': `${bubble.duration}s`,
      }"
    />
  </div>
</template>
