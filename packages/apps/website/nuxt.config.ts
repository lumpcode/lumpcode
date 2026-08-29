const siteUrl = 'https://lumpcode.com'
const title = 'Lumpcode — write the loop once'
const description =
  'Write an agent loop once. Lumpcode runs the next slice on your repo, you review the PR. Progress lives in git.'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-29',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title,
      titleTemplate: '%s · Lumpcode',
      meta: [
        { name: 'description', content: description },
        { name: 'theme-color', content: '#000514' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Lumpcode' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: siteUrl },
        { property: 'og:image', content: `${siteUrl}/og.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: `${siteUrl}/og.png` },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/logo-mark.png' },
        { rel: 'apple-touch-icon', href: '/logo-mark.png' },
        { rel: 'canonical', href: siteUrl },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
        },
      ],
    },
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/get-started', '/get-started/daemon'],
    },
  },
})
