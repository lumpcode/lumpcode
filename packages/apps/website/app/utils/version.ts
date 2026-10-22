import cliPackage from '../../../cli/package.json'

// The CLI version in this checkout. The deploy workflow also runs when that package.json changes.
export const cliVersion: string = cliPackage.version

export const cliVersionUrl = `https://www.npmjs.com/package/@lumpcode/cli/v/${cliVersion}`
