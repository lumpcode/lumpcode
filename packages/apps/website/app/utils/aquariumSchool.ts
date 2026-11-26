// The school crosses once per browser session.
const schoolSessionKey = 'lumpcode-school-seen'

/**
 * Whether the school crosses on this page view, marking it as seen. Client only.
 * Call once per page view and share the answer: a second call in the same view says no.
 */
export function claimSchoolPass(): boolean {
  try {
    const seen = sessionStorage.getItem(schoolSessionKey) === '1'
    sessionStorage.setItem(schoolSessionKey, '1')
    return !seen
  } catch {
    // Storage can be blocked; the school then plays on every load.
    return true
  }
}
