/**
 * Type-level defineConfig cases (CLI-local helper). Identity runtime tests stay in unit.test.ts.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { LumpJsConfig } from '../../types';
import { defineConfig } from './main';

type V = { model?: string; myHookFlag: boolean };
type SV = { model?: string; newChat?: boolean; stepOnly: number };

describe('defineConfig types (CLI)', () => {
  it('defineConfig<V, SV> returns LumpJsConfig<V, SV> without erasing bags', () => {
    const cfg = defineConfig<V, SV>({
      baseBranch: 'main',
      lumpVariables: { myHookFlag: true, model: 'auto' },
      steps: [{ stepVariables: { stepOnly: 1, newChat: true, model: 'auto' } }],
    });
    expectTypeOf(cfg).toEqualTypeOf<LumpJsConfig<V, SV>>();
    expectTypeOf(cfg.lumpVariables).toEqualTypeOf<V | undefined>();

    defineConfig<V, SV>({
      lumpVariables: { myHookFlag: true },
      steps: [{
        // @ts-expect-error — closed SV rejects excess keys once stepVariables is SV
        stepVariables: { stepOnly: 1, notAStepKey: true },
      }],
    });
  });

  it('untyped defineConfig remains assignable (defaults)', () => {
    const untyped = defineConfig({
      baseBranch: 'main',
      lumpVariables: { anything: 1 },
      steps: [{ stepVariables: { alsoAnything: true } }],
    });
    expectTypeOf(untyped).toMatchTypeOf<LumpJsConfig>();
  });
});
