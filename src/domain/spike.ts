import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));

export const SpikeStartRequestSchema = Schema.Struct({
  sandboxId: RequiredText,
  repositoryUrl: RequiredText,
  task: RequiredText,
  expectedBaseSha: Schema.optional(RequiredText),
});
export type SpikeStartRequest = typeof SpikeStartRequestSchema.Type;

export const SpikeStartResultSchema = Schema.Struct({
  sandboxId: RequiredText,
  processId: RequiredText,
  baseSha: RequiredText,
  initialTestExitCode: Schema.Number,
});
export type SpikeStartResult = typeof SpikeStartResultSchema.Type;

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
  label: RequiredText,
  tool: Schema.optional(RequiredText),
  isError: Schema.optional(Schema.Boolean),
  timestamp: RequiredText,
});
export type PiActivityEvent = typeof PiActivityEventSchema.Type;

export const PiRunResultSchema = Schema.Struct({
  version: Schema.Literal(1),
  status: Schema.Literals(["completed", "blocked", "budget_exhausted"] as const),
  summary: RequiredText,
  findings: Schema.Array(RequiredText),
  assumptions: Schema.Array(RequiredText),
  changedFiles: Schema.Array(RequiredText),
  unresolvedRisks: Schema.Array(RequiredText),
  runRequest: RequiredText,
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
    }),
  }),
});
export type PiRunResult = typeof PiRunResultSchema.Type;

export const SpikeProcessStatusSchema = Schema.Literals([
  "starting",
  "running",
  "completed",
  "failed",
  "killed",
  "error",
  "missing",
] as const);
export type SpikeProcessStatus = typeof SpikeProcessStatusSchema.Type;

export const SpikeStatusRequestSchema = Schema.Struct({
  sandboxId: RequiredText,
  processId: RequiredText,
});
export type SpikeStatusRequest = typeof SpikeStatusRequestSchema.Type;

export const SpikeStatusResultSchema = Schema.Struct({
  sandboxId: RequiredText,
  processId: RequiredText,
  status: SpikeProcessStatusSchema,
  events: Schema.Array(PiActivityEventSchema),
  stderrExcerpt: Schema.String,
});
export type SpikeStatusResult = typeof SpikeStatusResultSchema.Type;

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

export const SpikeFinalizeRequestSchema = SpikeStatusRequestSchema;
export type SpikeFinalizeRequest = SpikeStatusRequest;

export const SpikeFinalResultSchema = Schema.Struct({
  version: Schema.Literal(1),
  sandboxId: RequiredText,
  processId: RequiredText,
  repositoryUrl: RequiredText,
  runRequest: RequiredText,
  runAssumptions: Schema.Array(RequiredText),
  baseSha: RequiredText,
  pi: PiRunResultSchema,
  events: Schema.Array(PiActivityEventSchema),
  changedFiles: Schema.Array(RequiredText),
  patch: Schema.String,
  validation: Schema.Array(ValidationResultSchema),
  validated: Schema.Boolean,
  cleanup: Schema.Literals(["destroyed", "failed"] as const),
});
export type SpikeFinalResult = typeof SpikeFinalResultSchema.Type;

export const SpikeCancelResultSchema = Schema.Struct({
  sandboxId: RequiredText,
  processId: RequiredText,
  status: Schema.Literal("cancelled"),
  events: Schema.Array(PiActivityEventSchema),
  cleanup: Schema.Literals(["destroyed", "failed"] as const),
});
export type SpikeCancelResult = typeof SpikeCancelResultSchema.Type;

export class InvalidSpikeRequest extends Schema.TaggedErrorClass<InvalidSpikeRequest>()(
  "InvalidSpikeRequest",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

export class SpikeOperationFailed extends Schema.TaggedErrorClass<SpikeOperationFailed>()(
  "SpikeOperationFailed",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  static fromUnknown(operation: string, cause: unknown) {
    return new SpikeOperationFailed({
      operation,
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    });
  }
}

export const decodeSpikeStartRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(SpikeStartRequestSchema)(input).pipe(
    Effect.mapError((cause) => new InvalidSpikeRequest({ message: "Invalid spike start request", cause })),
  );

export const decodeSpikeStatusRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(SpikeStatusRequestSchema)(input).pipe(
    Effect.mapError((cause) => new InvalidSpikeRequest({ message: "Invalid spike status request", cause })),
  );

export const decodePiRunResult = (input: unknown) =>
  Schema.decodeUnknownEffect(PiRunResultSchema)(input).pipe(
    Effect.mapError((cause) => SpikeOperationFailed.fromUnknown("decode-pi-result", cause)),
  );

export const decodePiActivityEvent = Schema.decodeUnknownOption(PiActivityEventSchema);
