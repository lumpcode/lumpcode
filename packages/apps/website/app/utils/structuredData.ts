import { docsNav, withoutTrailingSlash } from './docsNav'
import { githubRepoUrl, npmCliUrl, siteDescription, siteUrl } from './site'
import { cliVersion } from './version'

// schema.org JSON-LD, so search engines and answer engines read Lumpcode as one entity:
// an organization that publishes an open-source developer application, with docs about it.

const organizationId = `${siteUrl}/#organization`
const websiteId = `${siteUrl}/#website`
const applicationId = `${siteUrl}/#software`

const organization = {
  '@type': 'Organization',
  '@id': organizationId,
  name: 'Lumpcode',
  url: siteUrl,
  logo: `${siteUrl}/logo-mark.png`,
  sameAs: [githubRepoUrl, 'https://github.com/lumpcode', npmCliUrl],
}

const website = {
  '@type': 'WebSite',
  '@id': websiteId,
  name: 'Lumpcode',
  url: siteUrl,
  description: siteDescription,
  publisher: { '@id': organizationId },
  inLanguage: 'en',
}

const application = {
  '@type': 'SoftwareApplication',
  '@id': applicationId,
  name: 'Lumpcode',
  alternateName: '@lumpcode/cli',
  description: siteDescription,
  url: siteUrl,
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Software factory',
  operatingSystem: 'Any system with Node.js 22 or later',
  softwareVersion: cliVersion,
  license: 'https://www.apache.org/licenses/LICENSE-2.0',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  downloadUrl: npmCliUrl,
  installUrl: `${siteUrl}/docs/start/first-pr`,
  softwareHelp: { '@type': 'CreativeWork', url: `${siteUrl}/docs/start/overview` },
  sameAs: [githubRepoUrl, npmCliUrl],
  image: `${siteUrl}/og.png`,
  publisher: { '@id': organizationId },
  keywords:
    'software factory, coding agent, agent loop, Claude Code, Codex, Cursor, Copilot CLI, OpenCode, codemod, migration, backlog automation, git',
}

function jsonLdScript(data: Record<string, unknown>) {
  return {
    key: 'structured-data',
    type: 'application/ld+json' as const,
    // `<` escaped so page text can never close the script tag.
    innerHTML: JSON.stringify({ '@context': 'https://schema.org', ...data }).replaceAll('<', '\\u003c'),
  }
}

export function homeStructuredData() {
  return jsonLdScript({ '@graph': [organization, website, application] })
}

export function docsStructuredData({
  path,
  title,
  description,
}: {
  path: string
  title: string
  description: string
}) {
  const url = `${siteUrl}${withoutTrailingSlash(path)}`
  const section = docsNav.find((entry) => entry.items.some((item) => item.path === withoutTrailingSlash(path)))
  const sectionStart = section?.items[0]?.path
  const crumbs = [
    { name: 'Docs', url: `${siteUrl}/docs/start/overview` },
    ...(section === undefined || sectionStart === undefined
      ? []
      : [{ name: section.title, url: `${siteUrl}${sectionStart}` }]),
    { name: title, url },
  ]
  return jsonLdScript({
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: title,
        description,
        url,
        inLanguage: 'en',
        isPartOf: { '@id': websiteId },
        publisher: { '@id': organizationId },
        about: { '@id': applicationId },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.name,
          item: crumb.url,
        })),
      },
    ],
  })
}
