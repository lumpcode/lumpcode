/** CLI-side lump config shapes (from `@lumpcode/cli` sources). */
export type { LumpJsConfig } from '../../src/types/LumpJsConfig';
export type { LumpJsConfigStep } from '../../src/types/LumpJsConfigStep';
export type { LumpJsConfigPostCommandExecFn } from '../../src/types/LumpJsConfigPostCommandExecFn';
export type {
  LumpJsConfigSteps,
  LumpJsConfigStepsFn,
  LumpJsConfigStepsItem,
  StepFn,
} from '../../src/types/LumpJsConfigSteps';
export type { LumpJsonConfig } from '../../src/types/LumpJsonConfig';
export type { LumpJsonConfigStep } from '../../src/types/LumpJsonConfigStep';
export type { BaseBranchFn, BaseBranchFnInput } from '../../src/types/BaseBranchFn';
export type { ContextMatchFn } from '../../src/types/ContextMatchFn';
export type { ContextOptionsFn } from '../../src/types/ContextOptionsFn';
export type { CommandModule } from '../../src/types/CommandModule';
export type { CommandTag } from '../../src/types/CommandTag';
/** Author-facing list fn (requires concrete `discoveryBranch`); core engine shape is unchanged. */
export type {
  GetContextListFn,
  GetContextListFnInput,
} from '../../src/types/GetContextListFn';
export type { LocalConfig } from '../../src/types/LocalConfig';
export type { Mode } from '../../src/types/Mode';
export type { ProjectConfig } from '../../src/types/ProjectConfig';
export type { FilePath } from '../../src/types/FilePath';
export type { FilePathOrString } from '../../src/types/FilePathOrString';
export type { MergeObjs } from '../../src/types/MergeObjs';

/** Engine types from `@lumpcode/core`. */
export type {
  AsyncFnSuccess,
  BranchFn,
  CodeBasePath,
  CommandFn,
  Context,
  ContextList,
  ContextRunState,
  ContextStatus,
  ExtractSuccess,
  GetContextListFnOutput,
  GitAddCommitFn,
  GitCommitMessageFn,
  GitPushFn,
  LumpVariables,
  Maybe,
  MaybePromise,
  PostCommandExecFn,
  PromptFn,
  PromptFnInput,
  Step,
  StepVariables,
  Steps,
  SetupFn,
  TeardownFn,
} from '@lumpcode/core';
