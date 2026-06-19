import type { GitAddCommandFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineGitAddCommandFn = identity<GitAddCommandFn>;
