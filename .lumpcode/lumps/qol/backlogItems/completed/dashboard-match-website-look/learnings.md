# Learnings

## Expected
`desc.yml` (`directImpl`, no `dependsOn`): align the read-only worker dashboard (`packages/apps/dashboard/src/page.ts`) with the redesigned website, visuals only. Remove the 3rem grid from the body background and keep the top teal glow, matching website `main.css`. Replace the embedded `logo-mark.png` with a static inline SVG of the website Lumpfish (`packages/apps/website/app/components/Lumpfish.vue`, no animation) for the header mark and the favicon, then delete `logo-mark.png` and `logoMark.ts` if unused. Keep `ROOT_CSS` a verbatim copy of the website's first `:root` block (`page.unit.test.ts` enforces it). Stay dark-only and read-only (no buttons, no forms). Update the page tests that assert the `data:image/png` logo.

No `requirements.md`, `testPlan.md`, or `expect.yml` on this item. No parent item has copies.

The directImpl prompt also asks for tests that cover the change, and for the lump validation command to pass (`npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli`).

## Landed
Working tree only. No marker commit yet.

- `packages/apps/dashboard/src/page.ts`: the body background is the website's two radial gradients (top teal glow and the corner wash) with `background-attachment: fixed`, and the 3rem grid is gone. The header mark is an inline static Lumpfish SVG. The favicon is that same SVG as a `data:image/svg+xml` URL, with the fish token values taken from `ROOT_CSS` so the icon paints without the page stylesheet. `ROOT_CSS` is unchanged. No buttons or forms.
- `packages/apps/dashboard/src/page.unit.test.ts`: drops the png assertion and checks the glow, the Lumpfish paths from `Lumpfish.vue`, and the svg favicon.
- `packages/apps/dashboard/scripts/build.mjs`: `desc.yml` did not name this file. The esbuild plugin only existed to inline `logo-mark.png`, so the bundle step no longer reads that file.
- Deleted `packages/apps/dashboard/src/logo-mark.png` and `packages/apps/dashboard/src/logoMark.ts`.
- `learnings.md` (this file).

`npm run test -w=@lumpcode/dashboard` passed (21). `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` passed (1367 tests).
