import type { RouterConfig } from '@nuxt/schema'

export default {
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return { ...savedPosition, behavior: 'instant' }
    }
    if (to.hash) {
      return {
        el: to.hash,
        behavior: 'smooth',
      }
    }
    return { top: 0, left: 0, behavior: 'instant' }
  },
} satisfies RouterConfig
