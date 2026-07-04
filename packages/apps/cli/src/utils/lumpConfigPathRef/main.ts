const LUMP_CONFIG_PATH_REF_WHITESPACE = /\s/;

const PROMPT_TEMPLATE_FILE_EXTENSIONS = ['.md', '.txt', '.template', '.prompt'] as const;

const COMMAND_MODULE_FILE_EXTENSIONS = ['.ts', '.js'] as const;

function hasAllowedSuffix(value: string, extensions: readonly string[]): boolean {
    return extensions.some((ext) => value.endsWith(ext));
}

function hasLumpConfigPathRefShape(value: string, extensions: readonly string[]): boolean {
    if (LUMP_CONFIG_PATH_REF_WHITESPACE.test(value)) {
        return false;
    }
    return hasAllowedSuffix(value, extensions);
}

export function isPromptTemplateFileRef(value: string): boolean {
    return hasLumpConfigPathRefShape(value, PROMPT_TEMPLATE_FILE_EXTENSIONS);
}

export function isCommandFileRef(value: string): boolean {
    return hasLumpConfigPathRefShape(value, COMMAND_MODULE_FILE_EXTENSIONS);
}
