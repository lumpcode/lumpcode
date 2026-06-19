import type { CommandModule } from '../../../src/types/CommandModule';
import { identity } from './identity';

export const defineCommandModule = identity<CommandModule>;
