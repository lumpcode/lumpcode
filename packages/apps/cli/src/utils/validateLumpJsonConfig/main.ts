import * as fs from 'node:fs';
import * as path from 'node:path';

import Ajv, { type ErrorObject } from 'ajv';
import { failure, type Failure, success, type Success } from '@lumpcode/core';

import { resolveBundledAssetPath } from '../resolveBundledAssetPath';

const LUMP_CONFIG_SCHEMA = 'lumpConfig.schema.json';

let validateFn: ReturnType<Ajv['compile']> | null = null;

function getValidator() {
    if (validateFn) return validateFn;
    const schemaPath = resolveBundledAssetPath(
        __dirname,
        path.join('schemas', LUMP_CONFIG_SCHEMA),
        path.join('../../schemas', LUMP_CONFIG_SCHEMA),
    );
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    validateFn = ajv.compile(schema);
    return validateFn;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
    if (!errors?.length) return 'Invalid lump config JSON';
    return errors
        .map((e) => {
            const loc = e.instancePath || '/';
            return `${loc}: ${e.message ?? 'invalid'}`;
        })
        .join('; ');
}

export function validateLumpJsonConfig(
    jsonConfig: unknown,
): Success<void> | Failure<string> {
    const validate = getValidator();
    if (!validate(jsonConfig)) {
        return failure(formatAjvErrors(validate.errors));
    }
    return success(undefined);
}
