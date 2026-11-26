# Learnings

## Expected
`desc.yml` (`directImpl`, no `dependsOn`): a first visit with no stored choice paints the website light, not dark and not the OS preference. A stored `lumpcode-theme` value and the toggle still win. The head boot script in `packages/apps/website/app/utils/site.ts` resolves first paint to light and syncs the theme-color meta. `nuxt.config.ts` starts theme-color on the light color. `main.css` drops the system-preference listener and the "dark is the default" comments. The dark `:root` token block and the dashboard `ROOT_CSS` copy stay as they are. The no-JS fallback stays dark.

No `requirements.md`, `testPlan.md`, or `expect.yml` on this item. No parent item has copies.

The directImpl prompt also asks for tests that cover the change, and for the lump validation command to pass (`npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli`).

## Landed
Working tree only. No marker commit yet.

- `packages/apps/website/app/utils/site.ts`: the boot script reads `lumpcode-theme`, uses `light` or `dark` when that value is stored, otherwise `light`, sets `data-theme`, and sets theme-color to `#f3f8f8` or `#000514`. It does not call `matchMedia`.
- `packages/apps/website/nuxt.config.ts`: theme-color content is the light color, with `tagPriority: 40` so the meta is parsed before the inline script. Without that, the script runs first and cannot update the tag.
- `packages/apps/website/app/assets/css/main.css`: the token comment now says a first visit paints light and that the `:root` block is the dark no-JS fallback. The `:root` tokens are unchanged.
- `packages/apps/website/app/components/ThemeToggle.vue`: the control starts on light and writes the same two theme-color values. A click still stores `lumpcode-theme` and applies it; `onMounted` still adopts the boot script's `data-theme`, so a stored dark choice wins. `desc.yml` did not name this file.
- `packages/apps/website/app/utils/themeBoot.unit.test.ts`, `packages/apps/website/vitest.config.ts`, and a `test` script in `packages/apps/website/package.json`. `desc.yml` did not name these.
- `packages/apps/dashboard/src/page.ts` is unchanged.
- `learnings.md` (this file).

`npm run test -w=@lumpcode/website` passed (8). `npm run test -w=@lumpcode/dashboard -- src/page.unit.test.ts` passed (6), so the dashboard still copies the dark `:root` block. `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` passed (1367 tests).
