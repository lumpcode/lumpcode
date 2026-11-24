import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { docsPrerenderRoutes, docsRedirects } from './app/utils/docsNav'
import { siteDescription, siteTitle, siteUrl, themeBootScript, themeColorLight } from './app/utils/site'
import { generateSeoFiles } from './seo/generateSeoFiles'

const websiteRoot = dirname(fileURLToPath(import.meta.url))
const publicSchemaDir = join(websiteRoot, 'public/schemas')
mkdirSync(publicSchemaDir, { recursive: true })
const schemaCopies: Array<{ fromDir: string; name: string }> = [
  { fromDir: join(websiteRoot, '../cli/src/schemas'), name: 'lumpConfig.schema.json' },
  { fromDir: join(websiteRoot, '../cli/src/schemas'), name: 'daemonConfig.schema.json' },
  { fromDir: join(websiteRoot, '../cli/src/schemas'), name: 'projectConfig.schema.json' },
  { fromDir: join(websiteRoot, '../cli/src/schemas'), name: 'localConfig.schema.json' },
  { fromDir: join(websiteRoot, '../../recipes/schemas'), name: 'backlogDesc.schema.json' },
  { fromDir: join(websiteRoot, '../../recipes/schemas'), name: 'featureBacklogDesc.schema.json' },
]
for (const { fromDir, name } of schemaCopies) {
  copyFileSync(join(fromDir, name), join(publicSchemaDir, name))
}

generateSeoFiles({ websiteRoot })

// Cloudflare Pages/Workers parse status as a number. Netlify's `301!` is ignored and /docs 404s.
writeFileSync(
  join(websiteRoot, 'public/_redirects'),
  `${docsRedirects.map(({ from, to }) => `${from} ${to} 301`).join('\n')}\n`,
)
const title = siteTitle
const description = siteDescription

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
        // Unhead places an inline head script at weight 50 and a plain meta at 100,
        // so the boot script would run before this tag exists. 40 keeps the light
        // color ahead of the script, which then rewrites it when a stored theme is dark.
        { name: 'theme-color', content: themeColorLight, tagPriority: 40 },
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
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/logo-mark.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
        },
      ],
      script: [
        { innerHTML: themeBootScript, tagPosition: 'head' },
        ...(process.env.NODE_ENV === 'production'
          ? [
              {
                src: 'https://static.cloudflareinsights.com/beacon.min.js?token=ac58ed5f0ef24c40a2dfc24e153c64c7',
                type: 'module' as const,
                tagPosition: 'bodyClose' as const,
              },
            ]
          : []),
      ],
    },
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', ...docsPrerenderRoutes],
    },
  },
  routeRules: Object.fromEntries(
    docsRedirects.map(({ from, to }) => [
      from,
      { redirect: { to, statusCode: 301 }, prerender: false },
    ]),
  ),
})
