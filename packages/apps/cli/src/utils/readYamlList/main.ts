import * as fs from 'node:fs/promises';
import { load as loadYaml } from 'js-yaml';

function parseYamlList<T>(raw: string): T[] {
    const doc = loadYaml(raw);
    return Array.isArray(doc) ? (doc as T[]) : [];
}

/** Reads a YAML file as a flat list; returns `[]` when missing or not an array. */
export async function readYamlList<T>(filePath: string): Promise<T[]> {
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return parseYamlList<T>(raw);
    } catch {
        return [];
    }
}
