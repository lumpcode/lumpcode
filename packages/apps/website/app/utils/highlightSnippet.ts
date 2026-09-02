function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function withInterp(text: string): string {
  return escapeHtml(text).replace(
    /@?\{[A-Z][A-Z0-9_]*\}/g,
    '<span class="tok-interp">$&</span>',
  )
}

function highlightJson(code: string): string {
  return code.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|[{}[\],]/g,
    (match, str: string | undefined, colon: string | undefined) => {
      if (str === undefined) {
        return `<span class="tok-punct">${match}</span>`
      }
      if (colon !== undefined) {
        return `<span class="tok-key">${escapeHtml(str)}</span>${colon}`
      }
      return `<span class="tok-string">${withInterp(str)}</span>`
    },
  )
}

function highlightShell(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      const match = /^(\s*)(\S+)(.*)$/.exec(line)
      if (match === null) {
        return ''
      }
      const indent = match[1] ?? ''
      const cmd = match[2] ?? ''
      const rest = match[3] ?? ''
      const coloredRest = rest.replace(/(\s+)(\S+)/g, (_all, space: string, token: string) => {
        const klass = token.startsWith('-') ? 'tok-flag' : 'tok-string'
        return `${space}<span class="${klass}">${escapeHtml(token)}</span>`
      })
      return `${indent}<span class="tok-cmd">${escapeHtml(cmd)}</span>${coloredRest}`
    })
    .join('\n')
}

function highlightTree(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      const withComment = /^([├└│─\s]*)(\S+)(\s{2,})(.*)$/.exec(line)
      if (withComment !== null) {
        const prefix = withComment[1] ?? ''
        const name = withComment[2] ?? ''
        const gap = withComment[3] ?? ''
        const comment = withComment[4] ?? ''
        return `<span class="tok-punct">${escapeHtml(prefix)}</span><span class="tok-key">${escapeHtml(name)}</span>${gap}<span class="tok-comment">${escapeHtml(comment)}</span>`
      }
      if (line.endsWith('/')) {
        return `<span class="tok-key">${escapeHtml(line)}</span>`
      }
      return escapeHtml(line)
    })
    .join('\n')
}

type SnippetLang = 'json' | 'shell' | 'tree' | 'code' | 'yaml' | 'plain'

const CODE_KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'interface',
  'keyof',
  'let',
  'new',
  'null',
  'of',
  'private',
  'protected',
  'public',
  'readonly',
  'return',
  'satisfies',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'using',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

function highlightCode(code: string): string {
  let i = 0
  let out = ''
  while (i < code.length) {
    const char = code[i] ?? ''
    const next = code[i + 1] ?? ''
    if (char === '/' && next === '/') {
      const end = code.indexOf('\n', i)
      const slice = end === -1 ? code.slice(i) : code.slice(i, end)
      out += `<span class="tok-comment">${escapeHtml(slice)}</span>`
      i += slice.length
      continue
    }
    if (char === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2)
      const slice = end === -1 ? code.slice(i) : code.slice(i, end + 2)
      out += `<span class="tok-comment">${escapeHtml(slice)}</span>`
      i += slice.length
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (code[j] === char) {
          j += 1
          break
        }
        j += 1
      }
      out += `<span class="tok-string">${withInterp(code.slice(i, j))}</span>`
      i = j
      continue
    }
    if (/[A-Za-z_$]/.test(char)) {
      let j = i + 1
      while (j < code.length && /[\w$]/.test(code[j] ?? '')) {
        j += 1
      }
      const word = code.slice(i, j)
      out += CODE_KEYWORDS.has(word)
        ? `<span class="tok-cmd">${escapeHtml(word)}</span>`
        : escapeHtml(word)
      i = j
      continue
    }
    out += escapeHtml(char)
    i += 1
  }
  return out
}

function highlightYaml(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      const commentAt = line.indexOf('#')
      const codePart = commentAt === -1 ? line : line.slice(0, commentAt)
      const comment = commentAt === -1 ? '' : line.slice(commentAt)
      const coloredCode = codePart.replace(
        /^(\s*)([^:#\n][^:\n]*?)(:)(\s*)(.*)$/,
        (_all, indent: string, key: string, colon: string, space: string, value: string) =>
          `${indent}<span class="tok-key">${escapeHtml(key)}</span>${colon}${space}<span class="tok-string">${withInterp(value)}</span>`,
      )
      const coloredComment =
        comment === '' ? '' : `<span class="tok-comment">${escapeHtml(comment)}</span>`
      return coloredCode === codePart ? `${escapeHtml(codePart)}${coloredComment}` : `${coloredCode}${coloredComment}`
    })
    .join('\n')
}

function snippetLang(filename: string): SnippetLang {
  if (filename.endsWith('.json')) {
    return 'json'
  }
  if (filename === 'terminal') {
    return 'shell'
  }
  if (filename === 'your-repo') {
    return 'tree'
  }
  return 'plain'
}

function fenceLang(language: string): SnippetLang {
  const lang = language.toLowerCase()
  if (lang === 'json' || lang === 'jsonc') {
    return 'json'
  }
  if (lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh' || lang === 'terminal') {
    return 'shell'
  }
  if (lang === 'ts' || lang === 'typescript' || lang === 'js' || lang === 'javascript' || lang === 'mjs' || lang === 'cjs') {
    return 'code'
  }
  if (lang === 'yaml' || lang === 'yml') {
    return 'yaml'
  }
  if (lang === 'text' || lang === 'txt' || lang === 'tree') {
    return 'tree'
  }
  return 'plain'
}

function highlightByLang(code: string, lang: SnippetLang): string {
  switch (lang) {
    case 'json':
      return highlightJson(code)
    case 'shell':
      return highlightShell(code)
    case 'tree':
      return highlightTree(code)
    case 'code':
      return highlightCode(code)
    case 'yaml':
      return highlightYaml(code)
    case 'plain':
      return withInterp(code)
    default: {
      const _exhaustive: never = lang
      return _exhaustive
    }
  }
}

export function highlightSnippet(code: string, filename: string): string {
  return highlightByLang(code, snippetLang(filename))
}

export function highlightFence(code: string, language: string): string {
  return highlightByLang(code, fenceLang(language))
}
