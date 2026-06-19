import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSea } from 'node:sea';

import Ajv, { type ErrorObject } from 'ajv';
import { failure, type Failure, success, type Success } from '@lumpcode/core';

const LUMP_CONFIG_SCHEMA = 'lumpConfig.schema.json';

let validateFn: ReturnType<Ajv['compile']> | null = null;

function resolveSchemaPath(): string {
    if (isSea()) {
        return path.join(path.dirname(process.execPath), 'schemas', LUMP_CONFIG_SCHEMA);
    }
    const bundled = path.join(__dirname, 'schemas', LUMP_CONFIG_SCHEMA);
    if (fs.existsSync(bundled)) return bundled;
    return path.join(__dirname, '../../schemas', LUMP_CONFIG_SCHEMA);
}

function getValidator() {
    if (validateFn) return validateFn;
    const schema = JSON.parse(fs.readFileSync(resolveSchemaPath(), 'utf-8'));
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
