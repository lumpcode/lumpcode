/**
 * Extracts values from a string based on a pattern template with placeholders.
 *
 * @param pattern - A pattern string with {PLACEHOLDER} syntax, e.g. "https://my-link/{USER_ID}/{PROJECT_ID}"
 * @param input - The string to extract values from, e.g. "https://my-link/user-1234/project-1234"
 * @param modifiers - An optional record of modifier functions keyed by name, used to validate $modifier{PLACEHOLDER} tokens in the pattern
 * @returns An object mapping placeholder names to their extracted values, e.g. { USER_ID: "user-1234", PROJECT_ID: "project-1234" }
 */
export function extractPattern(
    pattern: ExtractPatternParams[0],
    input: ExtractPatternParams[1],
    modifiers?: ExtractPatternParams[2],
): Record<string, string> {
    const tokenRegex = /\$(\w+)\{([^}]+)\}|\{([^}]+)\}/g;

    const tokens: Array<
        | { type: 'placeholder'; name: string }
        | { type: 'modifierRef'; modifier: string; name: string }
    > = [];

    let match;
    while ((match = tokenRegex.exec(pattern)) !== null) {
        if (match[1] !== undefined && match[2] !== undefined) {
            tokens.push({ type: 'modifierRef', modifier: match[1], name: match[2] });
        } else {
            tokens.push({ type: 'placeholder', name: match[3] });
        }
    }

    if (tokens.length === 0) {
        return {};
    }

    const parts = pattern.split(/\$\w+\{[^}]+\}|\{[^}]+\}/);
    const escapedParts = parts.map((part) =>
        part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );

    let regexStr = escapedParts[0];
    for (let i = 1; i < escapedParts.length; i++) {
        regexStr += '(.+?)' + escapedParts[i];
    }

    const regex = new RegExp(`^${regexStr}$`);
    const result = regex.exec(input);

    if (!result) {
        return {};
    }

    // First pass: extract values from regular placeholders
    const extracted: Record<string, string> = {};
    tokens.forEach((token, index) => {
        const capturedValue = result[index + 1];
        if (capturedValue === undefined) return;

        if (token.type === 'placeholder') {
            extracted[token.name] = capturedValue;
        }
    });

    // Second pass: validate modifier references against extracted values
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== 'modifierRef') continue;

        const capturedValue = result[i + 1];
        const refValue = extracted[token.name];
        const modifierFn = modifiers?.[token.modifier];

        if (!modifierFn || refValue === undefined || capturedValue === undefined) {
            return {};
        }

        if (modifierFn(refValue) !== capturedValue) {
            return {};
        }
    }

    return extracted;
}

export type ExtractPatternModifiers = {
    [modifierKey: string]: (x: string) => string;
};

export type ExtractPatternParams = [
    pattern: string,
    input: string,
    modifiers?: ExtractPatternModifiers,
];
