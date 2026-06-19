import { describe, it, expect } from 'vitest';
import { extractPattern } from './main';
import camelCase from 'lodash/camelCase';
import kebabCase from 'lodash/kebabCase';
import snakeCase from 'lodash/snakeCase';
import upperFirst from 'lodash/upperFirst';

describe('extractPattern', () => {
    it('should extract values from a URL pattern', () => {
        const result = extractPattern(
            'https://my-link/{USER_ID}/{PROJECT_ID}',
            'https://my-link/user-1234/project-1234'
        );
        expect(result).toEqual({
            USER_ID: 'user-1234',
            PROJECT_ID: 'project-1234',
        });
    });

    it('should extract a single placeholder', () => {
        const result = extractPattern(
            'Hello {NAME}!',
            'Hello World!'
        );
        expect(result).toEqual({ NAME: 'World' });
    });

    it('should extract multiple placeholders', () => {
        const result = extractPattern(
            '{GREETING}, {NAME}! Welcome to {PLACE}.',
            'Hi, John! Welcome to Paris.'
        );
        expect(result).toEqual({
            GREETING: 'Hi',
            NAME: 'John',
            PLACE: 'Paris',
        });
    });

    it('should return empty object when pattern does not match', () => {
        const result = extractPattern(
            'https://my-link/{USER_ID}',
            'https://other-link/user-1234'
        );
        expect(result).toEqual({});
    });

    it('should return empty object when no placeholders in pattern', () => {
        const result = extractPattern(
            'https://my-link/static',
            'https://my-link/static'
        );
        expect(result).toEqual({});
    });

    it('should handle patterns with special regex characters', () => {
        const result = extractPattern(
            'file.{EXT}?query={VALUE}',
            'file.txt?query=123'
        );
        expect(result).toEqual({
            EXT: 'txt',
            VALUE: '123',
        });
    });

    it('should handle adjacent placeholders', () => {
        const result = extractPattern(
            '{FIRST}{SECOND}',
            'abc'
        );
        // With non-greedy matching, first gets 'a', second gets 'b'
        expect(result).toEqual({
            FIRST: 'a',
            SECOND: 'bc',
        });
    });

    it('should handle placeholder at the end', () => {
        const result = extractPattern(
            'prefix-{SUFFIX}',
            'prefix-my-value'
        );
        expect(result).toEqual({ SUFFIX: 'my-value' });
    });

    it('should handle placeholder at the start', () => {
        const result = extractPattern(
            '{PREFIX}-suffix',
            'my-value-suffix'
        );
        expect(result).toEqual({ PREFIX: 'my-value' });
    });

    it('should handle empty input string when pattern expects content', () => {
        const result = extractPattern(
            '{VALUE}',
            ''
        );
        expect(result).toEqual({});
    });

    it('should work well with modifiers', () => {
        const result = extractPattern(
            'src/components/{COMPNAME}/$upperFirst{COMPNAME}.tsx',
            'src/components/button/Button.tsx',
            {
                upperFirst,
            }
        );
        expect(result).toEqual({
            COMPNAME: 'button',
        });

        const result2 = extractPattern(
            'src/components/{COMPNAME}/$kebabCase{COMPNAME}.ts',
            'src/components/importantForm/important-form.ts',
            {
                kebabCase,
            }
        );
        expect(result2).toEqual({
            COMPNAME: 'importantForm',
        });

        const result3 = extractPattern(
            'src/components/$snakeCase{COMPNAME}/{COMPNAME}.ts',
            'src/components/other_form/other-form.ts',
            {
                snakeCase,
            }
        );
        expect(result3).toEqual({
            COMPNAME: 'other-form',
        });

        const result4 = extractPattern(
            'src/components/{COMPONENT_NAME}/$pascalCase{COMPONENT_NAME}.tsx',
            'src/components/button/Button.tsx',
            {
                pascalCase: x => upperFirst(camelCase(x)),
            }
        );
        expect(result4).toEqual({
            COMPONENT_NAME: 'button',
        });
    })
});
