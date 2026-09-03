export default defineNuxtRouteMiddleware((to) => {
  if (to.path.startsWith('/docs')) {
    setPageLayout('docs')
  }
})
