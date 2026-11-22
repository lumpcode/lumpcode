// Generates public/wordmark.svg: "lumpcode" in Poppins SemiBold (SIL OFL) as outlines, with three letters
// rebuilt from Poppins' own shapes to match the original raster wordmark:
// - "l" curves into a short tail: the left part of the "u" with its stem raised to ascender height;
// - "p" and "d" are a full circle (the "o") with a stem that stops at its middle, so there is no square
//   corner where stem meets bowl;
// - "u" is a symmetric U (the u's left half and its mirror) and "m" is two of those U
//   upside down, sharing the middle stem, so neither has a square corner (ROUND_UM=0 keeps Poppins' own u and m).
// Run once when the wordmark changes; the SVG is committed. TAIL, TRACKING, ROUND_UM and OUT override the defaults.
//
//   mkdir /tmp/wm && cd /tmp/wm && npm i opentype.js@1.3.4 @fontsource/poppins@5.0.14
//   NODE_PATH=/tmp/wm/node_modules node brand/wordmark.mjs \
//     /tmp/wm/node_modules/@fontsource/poppins/files/poppins-latin-600-normal.woff
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(process.env.NODE_PATH ?? '.', 'x.js'))
const opentype = require('opentype.js')

const fontFile = process.argv[2]
if (!fontFile) {
  console.error('Usage: node brand/wordmark.mjs <poppins-600.woff>')
  process.exit(1)
}

const fontSize = 100
// Width of the l's foot, in stem widths (the part of the "u" kept after the cut).
const tail = Number(process.env.TAIL ?? 1.9)
// Tighter than the font's default spacing, like the original.
const tracking = Number(process.env.TRACKING ?? -4)
const roundUm = process.env.ROUND_UM !== '0'

const font = opentype.loadSync(fontFile)
const scale = fontSize / font.unitsPerEm
const round = (n) => Math.round(n * 100) / 100

// The "l": a "u" clipped after its left stem's curve, plus a stem from ascender to x-height.
const lGlyph = font.charToGlyph('l')
const uGlyph = font.charToGlyph('u')
const lBox = lGlyph.getPath(0, 0, fontSize).getBoundingBox()
const stem = lBox.x2 - lBox.x1
const uBox = uGlyph.getPath(0, 0, fontSize).getBoundingBox()
// Put the u's left stem exactly where the l's stem is.
const lPath = uGlyph.getPath(lBox.x1 - uBox.x1, 0, fontSize).toPathData(2)
const clipWidth = stem * tail
const lStem = { x: lBox.x1, y: lBox.y1, width: stem, height: uBox.y1 - lBox.y1 + 1 }
let x = lBox.x1 + clipWidth + (lGlyph.advanceWidth * scale - lBox.x2) + tracking

// The rest of the word, glyph by glyph so the tracking applies.
const oGlyph = font.charToGlyph('o')
const oBox = oGlyph.getPath(0, 0, fontSize).getBoundingBox()
const oMiddle = (oBox.y1 + oBox.y2) / 2
const pBox = font.charToGlyph('p').getPath(0, 0, fontSize).getBoundingBox()
const dBox = font.charToGlyph('d').getPath(0, 0, fontSize).getBoundingBox()
// The rounded U, drawn at the origin: the u's left half and its mirror.
const uWidth = uBox.x2 - uBox.x1
const uMiddle = (uBox.y1 + uBox.y2) / 2
const uAtOrigin = uGlyph.getPath(-uBox.x1, 0, fontSize).toPathData(2)
// The two halves overlap past the middle so each cut edge sits inside the other half's solid stroke;
// with a hairline overlap both anti-aliased edges land in one pixel and a faint seam shows.
const seamOverlap = 3
const mGlyph = font.charToGlyph('m')
const mBox = mGlyph.getPath(0, 0, fontSize).getBoundingBox()
const uses = []
const parts = []
const stems = []
for (const char of 'umpcode') {
  if (roundUm && char === 'u') {
    uses.push(`<use href="#wordmark-u" x="${round(x + uBox.x1)}"/>`)
    x += uGlyph.advanceWidth * scale + tracking
    continue
  }
  if (roundUm && char === 'm') {
    const left = x + mBox.x1
    for (const offset of [0, uWidth - stem]) {
      uses.push(`<use href="#wordmark-u" transform="translate(${round(left + offset)} 0) rotate(180 ${round(uWidth / 2)} ${round(uMiddle)})"/>`)
    }
    x += mBox.x1 + 2 * uWidth - stem + (mGlyph.advanceWidth * scale - mBox.x2) + tracking
    continue
  }
  if (char === 'p' || char === 'd') {
    parts.push(oGlyph.getPath(x, 0, fontSize).toPathData(2))
    stems.push(
      char === 'p'
        ? { x: x + oBox.x1, y: oMiddle, width: stem, height: pBox.y2 - oMiddle }
        : { x: x + oBox.x2 - stem, y: dBox.y1, width: stem, height: oMiddle - dBox.y1 },
    )
    x += oGlyph.advanceWidth * scale + tracking
    continue
  }
  const glyph = font.charToGlyph(char)
  parts.push(glyph.getPath(x, 0, fontSize).toPathData(2))
  x += glyph.advanceWidth * scale + tracking
}
const rest = parts.join('')
const rect = (r) => `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.width)}" height="${round(r.height)}"/>`

const box = font.getPath('lumpcode', 0, 0, fontSize).getBoundingBox()
const minX = Math.floor(lBox.x1)
const minY = Math.floor(lBox.y1)
const width = Math.ceil(x - tracking - minX)
const height = Math.ceil(box.y2 - minY)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="lumpcode">
  <!-- Generated by brand/wordmark.mjs from Poppins SemiBold (SIL Open Font License). -->
  <defs>
    <clipPath id="wordmark-l-foot"><rect x="${round(lBox.x1)}" y="${minY - 10}" width="${round(clipWidth)}" height="${height + 20}"/></clipPath>${roundUm ? `
    <clipPath id="wordmark-u-half"><rect x="-1" y="${minY - 10}" width="${round(uWidth / 2 + 1 + seamOverlap)}" height="${height + 20}"/></clipPath>
    <path id="wordmark-u-left" clip-path="url(#wordmark-u-half)" d="${uAtOrigin}"/>
    <g id="wordmark-u"><use href="#wordmark-u-left"/><use href="#wordmark-u-left" transform="translate(${round(uWidth)} 0) scale(-1 1)"/></g>` : ''}
  </defs>
  <g fill="#eef4f6">
    <path clip-path="url(#wordmark-l-foot)" d="${lPath}"/>
    ${uses.join('\n    ')}
    ${[lStem, ...stems].map(rect).join('\n    ')}
    <path d="${rest}"/>
  </g>
</svg>
`
const out = process.env.OUT ?? join(dirname(fileURLToPath(import.meta.url)), '../public/wordmark.svg')
writeFileSync(out, svg)
console.log(`Wrote ${out} (${width} x ${height})`)
