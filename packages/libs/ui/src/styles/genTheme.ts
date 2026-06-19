import type { LumpcodeUiTheme } from "./theme";
import { colors } from './theme';
import * as fs from 'node:fs/promises';

function genCssColorString(themeColors: LumpcodeUiTheme['colors']) {
    const colorVars = Object.entries(themeColors).map(([key, value]) => `--color-${key}: ${value};`);
    const colorVarsString = colorVars.join('\n');
    return colorVarsString;
}

async function genCssTheme(theme: LumpcodeUiTheme) {
    const colorVars = genCssColorString(theme.colors);
    const cssFileContent = `:root {
        ${colorVars}
    }`;
    const cssFile = await fs.writeFile('/Users/dyodio/Documents/Projects/Lumpcode/packages/libs/ui/src/styles/theme.css', cssFileContent, 'utf-8');
    return cssFile;
}

async function main() {
    const cssFile = await genCssTheme({
        colors,
    });
    console.log(cssFile);
}

main();