import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as z from 'zod';

const PASSWORD_OPTION_WARNING =
    'Warning: Passing password via --password is not recommended. Passwords may be visible in process listings and shell history.';
const NON_INTERACTIVE_ERROR =
    'Cannot prompt for password: not running in an interactive terminal. Use the --password option for non-interactive login (not recommended for security).';

import { failure, success } from '@lumpcode/core';

import { env } from '../../env';
import { AUTH_FILE_PATH } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';

const makeLoginHandler: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const {
        loginApiFn = defaultLoginApiFn,
        isAuthenticatedFn = defaultIsAuthenticatedApiFn,
        authFilePath = AUTH_FILE_PATH,
    } = injections || {};

    const existingAuth = await getAuthData(authFilePath);
    const existingToken = existingAuth?.token;
    if (existingToken) {
        const isAuthenticated = await isAuthenticatedFn(existingToken).catch(() => false);
        if (isAuthenticated) {
            return success({
                messages: [
                    `Already logged in as ${existingAuth.user.email}`,
                ],
                data: existingAuth,
            });
        }
    }

    const email = input.options.email?.trim() || await promptText('Email: ');

    let password: string;
    if (input.options.password != null && input.options.password !== '') {
        console.warn(PASSWORD_OPTION_WARNING);
        password = input.options.password;
    } else {
        if (!stdin.isTTY) {
            return failure({
                messages: [NON_INTERACTIVE_ERROR],
            });
        }
        password = await promptPassword('Password: ');
    }

    try {
        const loginApiResponse = await loginApiFn(email, password);

        if (!loginApiResponse.success) {
            return failure({
                messages: ['Login failed'],
                data: loginApiResponse.data,
            });
        }

        const { token, user } = loginApiResponse.data;

        await saveAuthData({ token, user }, authFilePath);

        return success({
            messages: [
                `Login successful!`,
                `Logged in user email: ${user.email}`,
                `Your authentication token has been saved securely.`,
            ],
            data: { token, user },
        });
    } catch (error) {
        return failure({
            messages: ['Login server error'],
            data: error,
        });
    }
}

interface AuthData {
    token: string;
    user: {
        id: string;        
        email: string;
    };
}

export type Output = {
    messages: string[];
    data: AuthData;
};

export const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        email: z.string().trim().min(1).describe('The email address of the user').optional(),
        password: z.string().describe('Password (not recommended: visible in process listings and shell history)').optional(),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

async function saveAuthData(
    authData: AuthData,
    authFilePath: string = AUTH_FILE_PATH
): Promise<void> {
    const authDir = path.dirname(authFilePath);
    await fs.mkdir(authDir, { recursive: true });
    await fs.writeFile(authFilePath, JSON.stringify(authData, null, 2), {
        mode: 0o600, // Read/write only for owner
    });
}

async function getAuthData(authFilePath: string = AUTH_FILE_PATH): Promise<AuthData | null> {
    try {
        const content = await fs.readFile(authFilePath, 'utf-8');
        return JSON.parse(content) as AuthData;
    } catch {
        return null;
    }
}

export interface Injections {
    loginApiFn: typeof defaultLoginApiFn | undefined;
    isAuthenticatedFn: typeof defaultIsAuthenticatedApiFn | undefined;
    authFilePath: string | undefined;
}

async function defaultLoginApiFn(email: string, password: string) {
    const response = await fetch(`${env.apiUrl}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: email,
            password: password,
        }),
    });

    if (!response.ok) {
        return failure({
            message: 'Login failed',
            response,
            info: {
                json: undefined,
            }
        });
    }

    const json = await response.json();

    if (json.token && json.user) {
        return success({
            token: json.token,
            user: json.user,
        } as AuthData);
    }

    return failure({
        message: 'Login response is invalid',
        response,
        info: {
            json,
        },
    });
}

async function defaultIsAuthenticatedApiFn(token: string) {
    const response = await fetch(`${env.apiUrl}/me`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        return false;
    }

    const json = await response.json();

    return json.status === 'ok';
}

const defaultLoginInjections: Injections = {
    loginApiFn: defaultLoginApiFn,
    isAuthenticatedFn: defaultIsAuthenticatedApiFn,
    authFilePath: AUTH_FILE_PATH,
}

export const command = {
    handlerMaker: makeLoginHandler,
    name: 'login',
    inputSchema: inputSchema,
    description: 'Login to the Lumpcode API',
    defaultInjections: defaultLoginInjections,
} satisfies Command;


function promptText(prompt: string): Promise<string> {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    return rl.question(prompt).finally(() => rl.close());
}

function promptPassword(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        stdout.write(prompt);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let password = '';
        const onData = (ch: string) => {
            if (ch === '\n' || ch === '\r' || ch === '\u0004') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                stdout.write('\n');
                resolve(password);
            } else if (ch === '\u0003') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                process.exit(0);
            } else if (ch === '\u007F' || ch === '\b') {
                if (password.length > 0) {
                    password = password.slice(0, -1);
                }
            } else {
                password += ch;
            }
        };
        stdin.on('data', onData);
    });
}