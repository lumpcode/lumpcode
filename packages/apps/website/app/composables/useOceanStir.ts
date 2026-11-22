import type { Ref } from 'vue'

const stirredRate = 2.2
const rampMs = 500

/**
 * Hovering the worker ocean with a mouse stirs the water: a light follows the pointer
 * (`--mx` / `--my`, drawn in CSS) and the drifters and bubbles speed up, easing back on leave.
 * Nothing changes for touch or reduced motion.
 */
export function useOceanStir(ocean: Ref<HTMLElement | null>) {
  let rate = 1
  let frame = 0

  function applyRate() {
    for (const swimmer of ocean.value?.querySelectorAll<HTMLElement>('.aq-drifter, .aq-bubble') ?? []) {
      // Own animations only: the drift or the rise, not the fish's fins and bob.
      for (const animation of swimmer.getAnimations()) {
        // Skip CSS transitions (the opacity fade); only the swim animations change speed.
        if (animation instanceof CSSAnimation) {
          animation.updatePlaybackRate(rate)
        }
      }
    }
  }

  // Eases the swim speed toward `target` so fish speed up and slow down instead of jumping.
  function setRate(target: number) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    cancelAnimationFrame(frame)
    const from = rate
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / rampMs)
      rate = from + (target - from) * (1 - (1 - t) ** 2)
      applyRate()
      if (t < 1) {
        frame = requestAnimationFrame(step)
      }
    }
    frame = requestAnimationFrame(step)
  }

  function onEnter(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      setRate(stirredRate)
    }
  }

  function onMove(event: PointerEvent) {
    const el = ocean.value
    if (!el || event.pointerType !== 'mouse') {
      return
    }
    const box = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${event.clientX - box.left}px`)
    el.style.setProperty('--my', `${event.clientY - box.top}px`)
  }

  function onLeave() {
    setRate(1)
  }

  onMounted(() => {
    const el = ocean.value
    el?.addEventListener('pointerenter', onEnter)
    el?.addEventListener('pointermove', onMove)
    el?.addEventListener('pointerleave', onLeave)
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    const el = ocean.value
    el?.removeEventListener('pointerenter', onEnter)
    el?.removeEventListener('pointermove', onMove)
    el?.removeEventListener('pointerleave', onLeave)
  })
}
