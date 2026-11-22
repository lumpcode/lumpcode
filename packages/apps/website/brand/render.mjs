// Renders the brand images from brand/*.html with a local headless Chrome:
// the social share image, the logo mark and lockup, the Apple touch icon, and the X and LinkedIn banners.
// Usage: npm run brand -w=@lumpcode/website   (override the browser with CHROME_PATH)
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const website = join(here, '..')
const repo = join(website, '../../..')

const targets = [
  { page: 'og.html', out: join(website, 'public/og.png'), width: 1200, height: 630 },
  { page: 'logo.html?layout=mark&fish=448', out: join(website, 'public/logo-mark.png'), width: 512, height: 512, transparent: true },
  { page: 'logo.html?layout=mark&bg=dark&fish=136', out: join(website, 'public/apple-touch-icon.png'), width: 180, height: 180 },
  { page: 'logo.html?layout=lockup&fish=180', out: join(website, 'public/logo-lockup.png'), width: 850, height: 228, transparent: true },
  { page: 'logo.html?layout=mark&bg=dark&fish=720', out: join(repo, 'assets/lumpcode-logo-mark.png'), width: 1024, height: 1024 },
  { page: 'logo.html?layout=lockup&bg=dark&fish=260', out: join(repo, 'assets/lumpcode-logo-lockup.png'), width: 1536, height: 1024 },
  { page: 'banner.html?variant=x', out: join(repo, 'assets/lumpcode-banner-x.png'), width: 1500, height: 500 },
  { page: 'banner.html?variant=linkedin', out: join(repo, 'assets/lumpcode-banner-linkedin.png'), width: 1584, height: 396 },
]

const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const chrome = candidates.find((path) => existsSync(path))
if (!chrome) {
  console.error('No Chrome or Chromium found. Set CHROME_PATH.')
  process.exit(1)
}

for (const { page, out, width, height, transparent } of targets) {
  const [file, query] = page.split('?')
  const url = new URL(pathToFileURL(join(here, file)).href)
  url.search = query ?? ''
  url.searchParams.set('w', String(width))
  url.searchParams.set('h', String(height))
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    ...(transparent ? ['--default-background-color=00000000'] : []),
    // Gives Google Fonts time to load before the capture.
    '--virtual-time-budget=5000',
    `--screenshot=${out}`,
    url.href,
  ], { stdio: 'ignore' })
  console.log(`Wrote ${relative(repo, out)}`)
}
