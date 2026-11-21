/** What a decorative lumpfish can carry across the page. */
export type Treat = 'cake' | 'burger' | 'pizza'

export type Cargo =
  | { kind: 'file'; label: string; color: string }
  | { kind: 'patch' }
  | { kind: 'treat'; treat: Treat }

const fileTypes = [
  { label: '.ts', color: '#3178c6' },
  { label: '.tsx', color: '#3178c6' },
  { label: '.js', color: '#d4a417' },
  { label: '.mjs', color: '#d4a417' },
] as const

const treats: readonly Treat[] = ['cake', 'burger', 'pizza']

const treatChance = 0.06

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T
}

/** Mostly a diff or a JS/TS file; once in a while a treat. */
export function randomCargo(): Cargo {
  if (Math.random() < treatChance) {
    return { kind: 'treat', treat: pick(treats) }
  }
  if (Math.random() < 0.5) {
    return { kind: 'patch' }
  }
  const file = pick(fileTypes)
  return { kind: 'file', label: file.label, color: file.color }
}
