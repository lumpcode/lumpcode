import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { themeBootScript, themeColorDark, themeColorLight, themeStorageKey } from './site'

type Stored = string | null | 'throw'

function boot(stored: Stored, options?: { meta?: boolean }) {
  const dataset: { theme?: string } = {}
  const classes: string[] = []
  let themeColor: string | null = null
  let matchMediaCalls = 0
  const meta = options?.meta === false
    ? null
    : {
        setAttribute(name: string, value: string) {
          if (name === 'content') themeColor = value
        },
      }
  const sandbox = {
    document: {
      documentElement: {
        dataset,
        classList: {
          add(name: string) {
            classes.push(name)
          },
        },
      },
      querySelector(selector: string) {
        return selector === 'meta[name="theme-color"]' ? meta : null
      },
    },
    localStorage: {
      getItem(key: string) {
        if (stored === 'throw') throw new Error('blocked')
        return key === themeStorageKey ? stored : null
      },
    },
    window: {
      matchMedia() {
        matchMediaCalls += 1
        return {
          matches: true,
          addEventListener() {
            matchMediaCalls += 1
          },
        }
      },
    },
  }
  runInNewContext(themeBootScript, sandbox)
  return { theme: dataset.theme, themeColor, classes, matchMediaCalls }
}

describe('theme boot script', () => {
  it('paints light and syncs theme-color when nothing is stored', () => {
    const result = boot(null)
    expect(result.theme).toBe('light')
    expect(result.themeColor).toBe(themeColorLight)
    expect(result.classes).toEqual(['js'])
    expect(result.matchMediaCalls).toBe(0)
  })

  it('lets a stored lumpcode-theme value win', () => {
    expect(boot('dark')).toMatchObject({ theme: 'dark', themeColor: themeColorDark })
    expect(boot('light')).toMatchObject({ theme: 'light', themeColor: themeColorLight })
  })

  it('treats a missing, invalid, or blocked store as light', () => {
    expect(boot('system').theme).toBe('light')
    expect(boot('').theme).toBe('light')
    expect(boot('throw')).toMatchObject({ theme: 'light', themeColor: themeColorLight })
  })

  it('still sets the theme when the theme-color meta is missing', () => {
    expect(boot(null, { meta: false })).toMatchObject({ theme: 'light', themeColor: null })
    expect(boot('dark', { meta: false })).toMatchObject({ theme: 'dark', themeColor: null })
  })

  it('does not read or follow the system color scheme', () => {
    expect(themeBootScript).not.toContain('matchMedia')
    expect(themeBootScript).not.toContain('prefers-color-scheme')
    expect(themeBootScript).not.toContain('addEventListener')
  })
})

describe('theme defaults outside the boot script', () => {
  it('starts the theme-color meta on the light color', () => {
    const nuxtConfig = readFileSync(fileURLToPath(new URL('../../nuxt.config.ts', import.meta.url)), 'utf8')
    expect(nuxtConfig).toContain('themeColorLight')
    expect(nuxtConfig).toContain('tagPriority: 40')
    expect(nuxtConfig).not.toContain(themeColorDark)
    expect(nuxtConfig).not.toContain('#000514')
  })

  it('keeps the dark token block as the no-JS fallback and drops the old default wording', () => {
    const css = readFileSync(fileURLToPath(new URL('../assets/css/main.css', import.meta.url)), 'utf8')
    expect(css).not.toMatch(/Dark is the default/)
    expect(css).not.toMatch(/or the system/)
    expect(css).not.toContain('prefers-color-scheme')
    const root = css.match(/:root \{[^}]*\}/)?.[0]
    expect(root).toContain('--bg: #000514')
    expect(root).toContain('color-scheme: dark')
    expect(css).toContain(":root[data-theme='light']")
    expect(css).toContain(`--bg: ${themeColorLight}`)
  })

  it('points the toggle at the same theme colors, starting on light', () => {
    const toggle = readFileSync(fileURLToPath(new URL('../components/ThemeToggle.vue', import.meta.url)), 'utf8')
    expect(toggle).toContain("ref<'light' | 'dark'>('light')")
    expect(toggle).toContain('themeColorLight')
    expect(toggle).toContain('themeColorDark')
    expect(toggle).toContain('themeStorageKey')
  })
})
