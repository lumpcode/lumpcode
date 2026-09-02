import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { docsPrerenderRoutes, docsRedirects } from './app/utils/docsNav'

const websiteRoot = dirname(fileURLToPath(import.meta.url))
const siteUrl = 'https://www.lumpcode.com'
const publicSchemaDir = join(websiteRoot, 'public/schemas')
mkdirSync(publicSchemaDir, { recursive: true })
copyFileSync(
  join(websiteRoot, '../cli/src/schemas/lumpConfig.schema.json'),
  join(publicSchemaDir, 'lumpConfig.schema.json'),
)

const sitemapPaths = ['/', ...docsPrerenderRoutes]
writeFileSync(
  join(websiteRoot, 'public/sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths.map((path) => `  <url><loc>${siteUrl}${path === '/' ? '' : path}</loc></url>`).join('\n')}
</urlset>
`,
)
writeFileSync(
  join(websiteRoot, 'public/_redirects'),
  `${docsRedirects.map(({ from, to }) => `${from} ${to} 301!`).join('\n')}\n`,
)
const title = 'Lumpcode — run your coding agent across a whole codebase'
const description =
  'Lumpcode is an open-source CLI that runs your coding agent over a list of files or tickets, giving each one its own branch and pull request. Everything it needs lives in git.'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-29',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css', '~/assets/css/docs.css'],
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
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
        },
      ],
      script: [
        {
          src: 'https://static.cloudflareinsights.com/beacon.min.js?token=ac58ed5f0ef24c40a2dfc24e153c64c7',
          type: 'module',
          tagPosition: 'bodyClose',
        },
      ],
    },
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/docs/start/overview', '/docs/start/first-pr', '/docs/start/worker', ...docsPrerenderRoutes],
    },
  },
  routeRules: Object.fromEntries(
    docsRedirects.map(({ from, to }) => [
      from,
      { redirect: { to, statusCode: 301 }, prerender: false },
    ]),
  ),
})
