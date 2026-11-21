function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Landing copy may wrap identifiers in backticks; render them as <code>. */
export function inlineCode(text: string): string {
  return text
    .split('`')
    .map((part, index) => (index % 2 === 1 ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part)))
    .join('')
}
