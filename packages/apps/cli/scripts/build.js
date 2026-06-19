const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
require('dotenv').config();

const isDev = process.argv.includes('--dev');

const envValue = process.env.ENV || '';
const apiUrl = process.env.API_URL || '';

console.log('🔧 Building with environment:');
console.log(`   ENV: ${envValue || '(not set)'}`);
console.log(`   API_URL: ${apiUrl || '(not set)'}`);
console.log(`   Mode: ${isDev ? 'development (source maps, no minify)' : 'production (minify)'}`);

// Generate a temporary env file with hardcoded values
// This ensures the values are inlined at build time
const generatedEnvPath = path.join(__dirname, '..', 'src', 'generated-env.ts');
const generatedEnvContent = `// Auto-generated at build time - DO NOT EDIT
export const BUILD_ENV = ${JSON.stringify(envValue)};
export const BUILD_API_URL = ${JSON.stringify(apiUrl)};
`;

fs.writeFileSync(generatedEnvPath, generatedEnvContent);
console.log('📝 Generated env file with build-time values');

const nccFlags = isDev
    ? '--source-map'
    : '--minify --no-source-map-register';

try {
    // Run ncc to bundle the application
    console.log('📦 Bundling with @vercel/ncc...');
    execSync(`npx ncc build src/root.ts -o dist -e esbuild ${nccFlags}`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
    });
    console.log('✅ Bundle complete: dist/index.js');
    if (isDev) {
        console.log("💡 Readable stack traces: NODE_OPTIONS='--enable-source-maps' node dist/index.js …");
    }

    const cliRoot = path.join(__dirname, '..');
    const schemasSrc = path.join(cliRoot, 'src', 'schemas');
    const schemasDest = path.join(cliRoot, 'dist', 'schemas');
    fs.mkdirSync(schemasDest, { recursive: true });
    for (const name of fs.readdirSync(schemasSrc)) {
        if (name.endsWith('.json')) {
            fs.copyFileSync(path.join(schemasSrc, name), path.join(schemasDest, name));
        }
    }
    console.log('📋 Copied JSON schemas to dist/schemas/');

    const presetsSrc = path.join(cliRoot, 'src', 'presets', 'commands');
    const presetsDest = path.join(cliRoot, 'dist', 'presets', 'commands');
    fs.mkdirSync(presetsDest, { recursive: true });
    for (const name of fs.readdirSync(presetsSrc)) {
        if (name.endsWith('.js')) {
            fs.copyFileSync(path.join(presetsSrc, name), path.join(presetsDest, name));
        }
    }
    const presetsUtilsSrc = path.join(presetsSrc, 'utils');
    if (fs.existsSync(presetsUtilsSrc)) {
        const presetsUtilsDest = path.join(presetsDest, 'utils');
        fs.mkdirSync(presetsUtilsDest, { recursive: true });
        for (const name of fs.readdirSync(presetsUtilsSrc)) {
            if (name.endsWith('.js')) {
                fs.copyFileSync(path.join(presetsUtilsSrc, name), path.join(presetsUtilsDest, name));
            }
        }
    }
    console.log('📋 Copied preset command modules to dist/presets/commands/');

    const installPresetCommandsSrc = path.join(
        cliRoot,
        'src',
        'utils',
        'ensurePresetCommandsInstalled',
        'installPresetCommands.mjs',
    );
    const installPresetCommandsDest = path.join(cliRoot, 'dist', 'installPresetCommands.mjs');
    fs.copyFileSync(installPresetCommandsSrc, installPresetCommandsDest);
    console.log('📋 Copied installPresetCommands.mjs to dist/');
} finally {
    // Clean up the generated file
    if (fs.existsSync(generatedEnvPath)) {
        fs.unlinkSync(generatedEnvPath);
        console.log('🧹 Cleaned up generated env file');
    }
}
