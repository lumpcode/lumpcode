type Env = 'dev' | 'prod';

// Try to import build-time generated values, fall back to process.env for development
let envValue: string;
let apiUrl: string;

try {
    // These values are injected at build time by scripts/build.js
    const generated = require('./generated-env');
    envValue = generated.BUILD_ENV || '';
    apiUrl = generated.BUILD_API_URL || '';
} catch {
    // Fallback for development (when running ts-node or without build)
    const { config } = require('dotenv');
    config();
    envValue = process.env.ENV?.toString() || '';
    apiUrl = process.env.API_URL?.toString() || '';
}

export const env = {
    env: (['dev', 'prod'].includes(envValue) ? envValue : 'dev') as Env,
    apiUrl,
};
