import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  PiActivityEventSchema,
  SandboxCancelResultSchema,
  SandboxRunResultSchema,
  SandboxRunStartResultSchema,
  SandboxProcessStatusResultSchema,
} from "./sandbox-run.ts";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));

export const RepositoryTaskStageSchema = Schema.Literals([
  "submitted",
  "provisioning",
  "investigating",
  "modifying",
  "validating",
  "complete",
  "failed",
  "cancelling",
  "cancelled",
] as const);
export type RepositoryTaskStage = typeof RepositoryTaskStageSchema.Type;

export const RepositoryRunRequestSchema = Schema.Struct({
  repositoryUrl: RequiredText,
  task: RequiredText,
});
export type RepositoryRunRequest = typeof RepositoryRunRequestSchema.Type;

export const RepositoryRunHandleSchema = Schema.Struct({
  taskId: RequiredText,
  runId: RequiredText,
});
export type RepositoryRunHandle = typeof RepositoryRunHandleSchema.Type;

export const StartAdditionalRunRequestSchema = Schema.Struct({
  taskId: RequiredText,
  runRequest: RepositoryRunRequestSchema,
});
export type StartAdditionalRunRequest = typeof StartAdditionalRunRequestSchema.Type;

export const SafeRunFailureSchema = Schema.Struct({
  code: RequiredText,
  message: RequiredText,
  stage: RepositoryTaskStageSchema,
});
export type SafeRunFailure = typeof SafeRunFailureSchema.Type;

export const AgentRunSnapshotSchema = Schema.Struct({
  runId: RequiredText,
  workflowId: Schema.NullOr(RequiredText),
  sandboxId: RequiredText,
  processId: RequiredText,
  runRequest: Schema.optional(RepositoryRunRequestSchema),
  stage: RepositoryTaskStageSchema,
  activity: RequiredText,
  baseSha: Schema.NullOr(RequiredText),
  events: Schema.Array(PiActivityEventSchema),
  artifactKey: Schema.NullOr(RequiredText),
  validated: Schema.NullOr(Schema.Boolean),
  failure: Schema.NullOr(SafeRunFailureSchema),
  cleanup: Schema.NullOr(Schema.Literals(["destroyed", "failed"] as const)),
  startedAt: RequiredText,
  updatedAt: RequiredText,
  completedAt: Schema.NullOr(RequiredText),
});
export type AgentRunSnapshot = typeof AgentRunSnapshotSchema.Type;

export const RepositoryTaskSnapshotSchema = Schema.Struct({
  version: Schema.Literal(1),
  taskId: RequiredText,
  ownerId: Schema.optional(RequiredText),
  runRequest: RepositoryRunRequestSchema,
  agentRuns: Schema.Array(AgentRunSnapshotSchema),
  activeRunId: Schema.NullOr(RequiredText),
  createdAt: RequiredText,
  updatedAt: RequiredText,
});
export type RepositoryTaskSnapshot = typeof RepositoryTaskSnapshotSchema.Type;

export const CreateRepositoryTaskInputSchema = Schema.Struct({
  taskId: RequiredText,
  ownerId: RequiredText,
  runId: RequiredText,
  sandboxId: RequiredText,
  processId: RequiredText,
  runRequest: RepositoryRunRequestSchema,
  now: RequiredText,
});
export type CreateRepositoryTaskInput = typeof CreateRepositoryTaskInputSchema.Type;

export const AddAgentRunInputSchema = Schema.Struct({
  taskId: RequiredText,
  ownerId: RequiredText,
  runId: RequiredText,
  sandboxId: RequiredText,
  processId: RequiredText,
  runRequest: RepositoryRunRequestSchema,
  now: RequiredText,
});
export type AddAgentRunInput = typeof AddAgentRunInputSchema.Type;

export const AttachWorkflowInputSchema = Schema.Struct({
  ...RepositoryRunHandleSchema.fields,
  workflowId: RequiredText,
  now: RequiredText,
});

export const MarkRunStageInputSchema = Schema.Struct({
  ...RepositoryRunHandleSchema.fields,
  stage: RepositoryTaskStageSchema,
  activity: RequiredText,
  now: RequiredText,
});

export const RecordRunStartedInputSchema = Schema.Struct({
  ...RepositoryRunHandleSchema.fields,
  started: SandboxRunStartResultSchema,
  now: RequiredText,
});

export const RecordRunProgressInputSchema = Schema.Struct({
  ...RepositoryRunHandleSchema.fields,
  status: SandboxProcessStatusResultSchema,
  now: RequiredText,
});

export const CompleteRunInputSchema = Schema.Struct({
  ...RepositoryRunHandleSchema.fields,
  artifactKey: RequiredText,
  validated: Schema.Boolean,
  cleanup: Schema.Literals(["destroyed", "failed"] as const),
  now: RequiredText,
});

export const FailRunInputSchema = Schema.Struct({
  ...RepositoryRunHandleSchema.fields,
  artifactKey: RequiredText,
  failure: SafeRunFailureSchema,
  cleanup: Schema.NullOr(Schema.Literals(["destroyed", "failed"] as const)),
  now: RequiredText,
});

export const CancelRunInputSchema = Schema.Struct({
  ...RepositoryRunHandleSchema.fields,
  artifactKey: RequiredText,
  cancellation: SandboxCancelResultSchema,
  now: RequiredText,
});

export const RepositoryRunWorkflowInputSchema = Schema.Struct({
  ...CreateRepositoryTaskInputSchema.fields,
});
export type RepositoryRunWorkflowInput = typeof RepositoryRunWorkflowInputSchema.Type;

export const CompletedRunArtifactSchema = Schema.Struct({
  version: Schema.Literal(1),
  taskId: RequiredText,
  runId: RequiredText,
  repositoryUrl: RequiredText,
  runRequest: RequiredText,
  createdAt: RequiredText,
  terminal: Schema.Struct({
    status: Schema.Literal("completed"),
    result: SandboxRunResultSchema,
  }),
});

export const FailedRunArtifactSchema = Schema.Struct({
  version: Schema.Literal(1),
  taskId: RequiredText,
  runId: RequiredText,
  repositoryUrl: RequiredText,
  runRequest: RequiredText,
  createdAt: RequiredText,
  terminal: Schema.Struct({
    status: Schema.Literal("failed"),
    failure: SafeRunFailureSchema,
    events: Schema.Array(PiActivityEventSchema),
    cleanup: Schema.NullOr(Schema.Literals(["destroyed", "failed"] as const)),
  }),
});

export const CancelledRunArtifactSchema = Schema.Struct({
  version: Schema.Literal(1),
  taskId: RequiredText,
  runId: RequiredText,
  repositoryUrl: RequiredText,
  runRequest: RequiredText,
  createdAt: RequiredText,
  terminal: Schema.Struct({
    status: Schema.Literal("cancelled"),
    cancellation: SandboxCancelResultSchema,
  }),
});

export const RunArtifactSchema = Schema.Union([
  CompletedRunArtifactSchema,
  FailedRunArtifactSchema,
  CancelledRunArtifactSchema,
]);
export type RunArtifact = typeof RunArtifactSchema.Type;

export const WorkflowSucceededSchema = Schema.Struct({
  status: Schema.Literal("complete"),
  taskId: RequiredText,
  runId: RequiredText,
  artifactKey: RequiredText,
});

export const WorkflowFailedSchema = Schema.Struct({
  status: Schema.Literal("failed"),
  taskId: RequiredText,
  runId: RequiredText,
  artifactKey: RequiredText,
  message: RequiredText,
});

export const WorkflowCancelledSchema = Schema.Struct({
  status: Schema.Literal("cancelled"),
  taskId: RequiredText,
  runId: RequiredText,
});

export const RepositoryRunWorkflowResultSchema = Schema.Union([
  WorkflowSucceededSchema,
  WorkflowFailedSchema,
  WorkflowCancelledSchema,
]);
export type RepositoryRunWorkflowResult = typeof RepositoryRunWorkflowResultSchema.Type;

export class InvalidRepositoryTaskData extends Schema.TaggedErrorClass<InvalidRepositoryTaskData>()(
  "InvalidRepositoryTaskData",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

export class RepositoryTaskConflict extends Schema.TaggedErrorClass<RepositoryTaskConflict>()(
  "RepositoryTaskConflict",
  { message: Schema.String },
) {}

export class RepositoryTaskNotFound extends Schema.TaggedErrorClass<RepositoryTaskNotFound>()(
  "RepositoryTaskNotFound",
  { message: Schema.String },
) {}

const decode = <A, I>(schema: Schema.Codec<A, I, never>, message: string) => (input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError((cause) => new InvalidRepositoryTaskData({ message, cause })),
  );

export const decodeRepositoryRunRequest = decode(
  RepositoryRunRequestSchema,
  "Invalid Run Request",
);
export const decodeRepositoryRunHandle = decode(
  RepositoryRunHandleSchema,
  "Invalid Agent Run handle",
);
export const decodeStartAdditionalRunRequest = decode(
  StartAdditionalRunRequestSchema,
  "Invalid additional Agent Run request",
);
export const decodeRepositoryTaskSnapshot = decode(
  RepositoryTaskSnapshotSchema,
  "Stored Repository Task is invalid",
);
export const decodeRunArtifact = decode(
  RunArtifactSchema,
  "Stored Run Result is invalid",
);
export const decodeWorkflowInput = decode(
  RepositoryRunWorkflowInputSchema,
  "Invalid Repository Run Workflow input",
);

export const createRepositoryTaskSnapshot = (
  input: CreateRepositoryTaskInput,
): RepositoryTaskSnapshot => ({
  version: 1,
  taskId: input.taskId,
  ownerId: input.ownerId,
  runRequest: input.runRequest,
  agentRuns: [{
    runId: input.runId,
    workflowId: null,
    sandboxId: input.sandboxId,
    processId: input.processId,
    runRequest: input.runRequest,
    stage: "submitted",
    activity: "Run Request accepted",
    baseSha: null,
    events: [],
    artifactKey: null,
    validated: null,
    failure: null,
    cleanup: null,
    startedAt: input.now,
    updatedAt: input.now,
    completedAt: null,
  }],
  activeRunId: input.runId,
  createdAt: input.now,
  updatedAt: input.now,
});

const createAgentRunSnapshot = (
  input: AddAgentRunInput,
): AgentRunSnapshot => ({
  runId: input.runId,
  workflowId: null,
  sandboxId: input.sandboxId,
  processId: input.processId,
  runRequest: input.runRequest,
  stage: "submitted",
  activity: "Agent Run accepted",
  baseSha: null,
  events: [],
  artifactKey: null,
  validated: null,
  failure: null,
  cleanup: null,
  startedAt: input.now,
  updatedAt: input.now,
  completedAt: null,
});

export const addAgentRun = (
  snapshot: RepositoryTaskSnapshot,
  input: AddAgentRunInput,
): RepositoryTaskSnapshot => ({
  ...snapshot,
  agentRuns: [...snapshot.agentRuns, createAgentRunSnapshot(input)],
  activeRunId: input.runId,
  updatedAt: input.now,
});

export const runRequestFor = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
): RepositoryRunRequest | null => {
  const run = snapshot.agentRuns.find((candidate) => candidate.runId === runId);
  return run === undefined ? null : run.runRequest ?? snapshot.runRequest;
};

const updateRun = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  now: string,
  update: (run: AgentRunSnapshot) => AgentRunSnapshot,
): RepositoryTaskSnapshot => {
  const index = snapshot.agentRuns.findIndex((run) => run.runId === runId);
  if (index < 0) return snapshot;
  const agentRuns = [...snapshot.agentRuns];
  agentRuns[index] = update(agentRuns[index]!);
  return { ...snapshot, agentRuns, updatedAt: now };
};

export const isTerminalStage = (stage: RepositoryTaskStage): boolean =>
  stage === "complete" || stage === "failed" || stage === "cancelled";

export const isActiveRun = (snapshot: RepositoryTaskSnapshot, runId: string): boolean =>
  snapshot.activeRunId === runId && snapshot.agentRuns.some((run) =>
    run.runId === runId && !isTerminalStage(run.stage) && run.stage !== "cancelling");

export const attachWorkflow = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  workflowId: string,
  now: string,
): RepositoryTaskSnapshot => updateRun(snapshot, runId, now, (run) => ({
  ...run,
  workflowId,
  updatedAt: now,
}));

export const markRunStage = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  stage: RepositoryTaskStage,
  activity: string,
  now: string,
): RepositoryTaskSnapshot => updateRun(snapshot, runId, now, (run) =>
  isTerminalStage(run.stage) || run.stage === "cancelling"
    ? run
    : { ...run, stage, activity, updatedAt: now });

export const recordRunStarted = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  started: typeof SandboxRunStartResultSchema.Type,
  now: string,
): RepositoryTaskSnapshot => updateRun(snapshot, runId, now, (run) =>
  isTerminalStage(run.stage) || run.stage === "cancelling"
    ? run
    : {
        ...run,
        baseSha: started.baseSha,
        processId: started.processId,
        stage: "investigating",
        activity: "Investigating the repository",
        updatedAt: now,
      });

export const stageFromStatus = (
  status: typeof SandboxProcessStatusResultSchema.Type,
): RepositoryTaskStage => {
  const latest = status.events.at(-1);
  if (latest?.stage === "modifying" || latest?.stage === "command" || latest?.stage === "finishing") {
    return "modifying";
  }
  return "investigating";
};

export const recordRunProgress = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  status: typeof SandboxProcessStatusResultSchema.Type,
  now: string,
): RepositoryTaskSnapshot => updateRun(snapshot, runId, now, (run) =>
  isTerminalStage(run.stage) || run.stage === "cancelling"
    ? run
    : {
        ...run,
        stage: stageFromStatus(status),
        activity: status.events.at(-1)?.label ?? "Repository agent is running",
        events: status.events,
        updatedAt: now,
      });

export const requestRunCancellation = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  now: string,
): RepositoryTaskSnapshot => updateRun(snapshot, runId, now, (run) =>
  isTerminalStage(run.stage)
    ? run
    : { ...run, stage: "cancelling", activity: "Cancelling the Agent Run", updatedAt: now });

export const completeRun = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  artifactKey: string,
  validated: boolean,
  cleanup: "destroyed" | "failed",
  now: string,
): RepositoryTaskSnapshot => {
  if (!isActiveRun(snapshot, runId)) return snapshot;
  const next = updateRun(snapshot, runId, now, (run) => ({
    ...run,
    stage: "complete",
    activity: validated ? "Validated Patch ready" : "Run Result ready for review",
    artifactKey,
    validated,
    cleanup,
    updatedAt: now,
    completedAt: now,
  }));
  return { ...next, activeRunId: null };
};

export const failRun = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  artifactKey: string,
  failure: SafeRunFailure,
  cleanup: "destroyed" | "failed" | null,
  now: string,
): RepositoryTaskSnapshot => {
  if (!isActiveRun(snapshot, runId)) return snapshot;
  const next = updateRun(snapshot, runId, now, (run) => ({
    ...run,
    stage: "failed",
    activity: "Agent Run failed safely",
    artifactKey,
    failure,
    cleanup,
    updatedAt: now,
    completedAt: now,
  }));
  return { ...next, activeRunId: null };
};

export const cancelRun = (
  snapshot: RepositoryTaskSnapshot,
  runId: string,
  artifactKey: string,
  cancellation: typeof SandboxCancelResultSchema.Type,
  now: string,
): RepositoryTaskSnapshot => {
  if (snapshot.activeRunId !== runId) return snapshot;
  const next = updateRun(snapshot, runId, now, (run) => ({
    ...run,
    stage: "cancelled",
    activity: "Agent Run cancelled",
    artifactKey,
    events: cancellation.events,
    cleanup: cancellation.cleanup,
    updatedAt: now,
    completedAt: now,
  }));
  return { ...next, activeRunId: null };
};
