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

type SnippetLang = 'json' | 'shell' | 'tree' | 'plain'

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

export function highlightSnippet(code: string, filename: string): string {
  const lang = snippetLang(filename)
  switch (lang) {
    case 'json':
      return highlightJson(code)
    case 'shell':
      return highlightShell(code)
    case 'tree':
      return highlightTree(code)
    case 'plain':
      return escapeHtml(code)
    default: {
      const _exhaustive: never = lang
      return _exhaustive
    }
  }
}
