export function resolvePresetExtraArgs({ lumpVariables = {}, stepVariables = {} }) {
    const chosen = stepVariables.extraArgs !== undefined
        ? stepVariables.extraArgs
        : lumpVariables.extraArgs;

    if (chosen === undefined) {
        return [];
    }

    if (!Array.isArray(chosen) || !chosen.every((entry) => typeof entry === 'string')) {
        throw new Error('extraArgs must be an array of strings');
    }

    return chosen;
}
