import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const ShortText = RequiredText.check(Schema.isMaxLength(4_096));
const RunObjective = RequiredText.check(Schema.isMaxLength(16_384));
const GitSha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/));

export const SandboxRunStartRequestSchema = Schema.Struct({
  sandboxId: RequiredText,
  repositoryUrl: RequiredText.check(Schema.isMaxLength(2_048)),
  task: RunObjective,
  expectedBaseSha: Schema.optional(GitSha),
});
export type SandboxRunStartRequest = typeof SandboxRunStartRequestSchema.Type;

export const SandboxRunStartResultSchema = Schema.Struct({
  sandboxId: RequiredText,
  processId: RequiredText,
  baseSha: GitSha,
  initialTestExitCode: Schema.Number,
});
export type SandboxRunStartResult = typeof SandboxRunStartResultSchema.Type;

export const PiActivityStageSchema = Schema.Literals([
  "starting",
  "investigating",
  "modifying",
  "command",
  "finishing",
] as const);
export type PiActivityStage = typeof PiActivityStageSchema.Type;

export const PiActivityEventSchema = Schema.Struct({
  type: Schema.Literal("pi.activity"),
  stage: PiActivityStageSchema,
  label: ShortText,
  tool: Schema.optional(ShortText),
  isError: Schema.optional(Schema.Boolean),
  timestamp: RequiredText,
});
export type PiActivityEvent = typeof PiActivityEventSchema.Type;

export const PiRunResultSchema = Schema.Struct({
  version: Schema.Literal(1),
  status: Schema.Literals(["completed", "blocked", "budget_exhausted"] as const),
  summary: ShortText,
  findings: Schema.Array(ShortText).check(Schema.isMaxLength(100)),
  assumptions: Schema.Array(ShortText).check(Schema.isMaxLength(100)),
  changedFiles: Schema.Array(ShortText).check(Schema.isMaxLength(200)),
  unresolvedRisks: Schema.Array(ShortText).check(Schema.isMaxLength(100)),
  runRequest: RunObjective,
  terminationReason: Schema.Literals([
    "finish_run",
    "wall_clock_budget",
    "missing_structured_result",
    "runner_error",
  ] as const),
  budgetUsage: Schema.Struct({
    commands: Schema.Struct({ used: Schema.Number, limit: Schema.Number }),
    wallClock: Schema.Struct({ elapsedMs: Schema.Number, limitMs: Schema.Number }),
    model: Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
      cacheReadTokens: Schema.Number,
      cacheWriteTokens: Schema.Number,
      totalTokens: Schema.Number,
      costUsd: Schema.Number,
      retries: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
    }),
  }),
});
export type PiRunResult = typeof PiRunResultSchema.Type;

/** True only when Pi explicitly submitted its structured finish_run report. */
export const hasStructuredAgentReport = (result: PiRunResult): boolean =>
  result.terminationReason === "finish_run";

export const SandboxProcessStatusSchema = Schema.Literals([
  "starting",
  "running",
  "completed",
  "failed",
  "killed",
  "error",
  "missing",
] as const);
export type SandboxProcessStatus = typeof SandboxProcessStatusSchema.Type;

export const SandboxProcessRequestSchema = Schema.Struct({
  sandboxId: RequiredText,
  processId: RequiredText,
});
export type SandboxProcessRequest = typeof SandboxProcessRequestSchema.Type;

export const SandboxProcessStatusResultSchema = Schema.Struct({
  sandboxId: RequiredText,
  processId: RequiredText,
  status: SandboxProcessStatusSchema,
  events: Schema.Array(PiActivityEventSchema),
  stderrExcerpt: Schema.String,
});
export type SandboxProcessStatusResult = typeof SandboxProcessStatusResultSchema.Type;

export const ValidationResultSchema = Schema.Struct({
  name: RequiredText,
  command: RequiredText,
  exitCode: Schema.Number,
  passed: Schema.Boolean,
  durationMs: Schema.Number,
  stdoutExcerpt: Schema.String,
  stderrExcerpt: Schema.String,
});
export type ValidationResult = typeof ValidationResultSchema.Type;

export const SandboxFinalizeRequestSchema = SandboxProcessRequestSchema;
export type SandboxFinalizeRequest = SandboxProcessRequest;

export const SandboxRunResultSchema = Schema.Struct({
  version: Schema.Literal(1),
  sandboxId: RequiredText,
  processId: RequiredText,
  repositoryUrl: RequiredText,
  runRequest: RequiredText,
  runAssumptions: Schema.Array(RequiredText),
  baseSha: GitSha,
  pi: PiRunResultSchema,
  events: Schema.Array(PiActivityEventSchema).check(Schema.isMaxLength(1_000)),
  changedFiles: Schema.Array(ShortText).check(Schema.isMaxLength(200)),
  patch: Schema.String.check(Schema.isMaxLength(2_000_000)),
  validation: Schema.Array(ValidationResultSchema).check(Schema.isMaxLength(10)),
  validated: Schema.Boolean,
  timing: Schema.Struct({
    agentMs: Schema.Number,
    validationMs: Schema.Number,
    finalizationMs: Schema.Number,
  }).pipe(Schema.withDecodingDefaultKey(Effect.succeed({
    agentMs: 0,
    validationMs: 0,
    finalizationMs: 0,
  }))),
  cleanup: Schema.Literals(["destroyed", "failed"] as const),
});
export type SandboxRunResult = typeof SandboxRunResultSchema.Type;

export const SandboxCancelResultSchema = Schema.Struct({
  sandboxId: RequiredText,
  processId: RequiredText,
  status: Schema.Literal("cancelled"),
  events: Schema.Array(PiActivityEventSchema),
  cleanup: Schema.Literals(["destroyed", "failed"] as const),
});
export type SandboxCancelResult = typeof SandboxCancelResultSchema.Type;

export class InvalidSandboxRequest extends Schema.TaggedErrorClass<InvalidSandboxRequest>()(
  "InvalidSandboxRequest",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

export class SandboxOperationFailed extends Schema.TaggedErrorClass<SandboxOperationFailed>()(
  "SandboxOperationFailed",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  static fromUnknown(operation: string, cause: unknown) {
    return new SandboxOperationFailed({
      operation,
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    });
  }
}

export const decodeSandboxRunStartRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(SandboxRunStartRequestSchema)(input).pipe(
    Effect.mapError((cause) => new InvalidSandboxRequest({ message: "Invalid Sandbox Run start request", cause })),
  );

export const decodeSandboxProcessRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(SandboxProcessRequestSchema)(input).pipe(
    Effect.mapError((cause) => new InvalidSandboxRequest({ message: "Invalid Sandbox process request", cause })),
  );

export const decodePiRunResult = (input: unknown) =>
  Schema.decodeUnknownEffect(PiRunResultSchema)(input).pipe(
    Effect.mapError((cause) => SandboxOperationFailed.fromUnknown("decode-pi-result", cause)),
  );

export const decodePiActivityEvent = Schema.decodeUnknownOption(PiActivityEventSchema);
