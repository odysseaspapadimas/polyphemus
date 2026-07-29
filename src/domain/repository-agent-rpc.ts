import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProductIdentitySchema } from "./product-identity.ts";
import {
  RepositoryRunHandleSchema,
  RepositoryRunRequestSchema,
  RepositoryTaskSnapshotSchema,
  RunArtifactSchema,
  StartAdditionalRunRequestSchema,
} from "./repository-task.ts";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));

export const RepositoryAgentFailureTagSchema = Schema.Literals([
  "InvalidProductIdentity",
  "InvalidRepositoryTaskData",
  "RepositoryTaskConflict",
  "RepositoryTaskNotFound",
  "RepositoryTaskIndexFailed",
  "RepositoryAgentBackendFailed",
] as const);
export type RepositoryAgentFailureTag = typeof RepositoryAgentFailureTagSchema.Type;

/** Plain data only: Effect error classes never cross the Worker RPC boundary. */
export const RepositoryAgentFailureSchema = Schema.Struct({
  _tag: RepositoryAgentFailureTagSchema,
  message: RequiredText,
  operation: Schema.optional(RequiredText),
});
export type RepositoryAgentFailure = typeof RepositoryAgentFailureSchema.Type;

export const CreateRepositoryTaskCommandSchema = Schema.Struct({
  principal: ProductIdentitySchema,
  request: RepositoryRunRequestSchema,
});
export type CreateRepositoryTaskCommand = typeof CreateRepositoryTaskCommandSchema.Type;

export const StartAdditionalRepositoryRunCommandSchema = Schema.Struct({
  principal: ProductIdentitySchema,
  request: StartAdditionalRunRequestSchema,
});
export type StartAdditionalRepositoryRunCommand = typeof StartAdditionalRepositoryRunCommandSchema.Type;

export const ListRepositoryTasksCommandSchema = Schema.Struct({
  principal: ProductIdentitySchema,
});
export type ListRepositoryTasksCommand = typeof ListRepositoryTasksCommandSchema.Type;

export const GetRepositoryTaskCommandSchema = Schema.Struct({
  principal: ProductIdentitySchema,
  handle: RepositoryRunHandleSchema,
});
export type GetRepositoryTaskCommand = typeof GetRepositoryTaskCommandSchema.Type;

export const GetRunArtifactCommandSchema = GetRepositoryTaskCommandSchema;
export type GetRunArtifactCommand = GetRepositoryTaskCommand;

export const CancelRepositoryRunCommandSchema = GetRepositoryTaskCommandSchema;
export type CancelRepositoryRunCommand = GetRepositoryTaskCommand;

const failureEnvelope = Schema.Struct({
  ok: Schema.Literal(false),
  error: RepositoryAgentFailureSchema,
});

export const CreateRepositoryTaskResultSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), value: RepositoryRunHandleSchema }),
  failureEnvelope,
]);
export type CreateRepositoryTaskResult = typeof CreateRepositoryTaskResultSchema.Type;

export const StartAdditionalRepositoryRunResultSchema = CreateRepositoryTaskResultSchema;
export type StartAdditionalRepositoryRunResult = CreateRepositoryTaskResult;

export const ListRepositoryTasksResultSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), value: Schema.Array(RepositoryTaskSnapshotSchema) }),
  failureEnvelope,
]);
export type ListRepositoryTasksResult = typeof ListRepositoryTasksResultSchema.Type;

export const GetRepositoryTaskResultSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), value: RepositoryTaskSnapshotSchema }),
  failureEnvelope,
]);
export type GetRepositoryTaskResult = typeof GetRepositoryTaskResultSchema.Type;

export const GetRunArtifactResultSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), value: RunArtifactSchema }),
  failureEnvelope,
]);
export type GetRunArtifactResult = typeof GetRunArtifactResultSchema.Type;

export const CancelRepositoryRunResultSchema = GetRepositoryTaskResultSchema;
export type CancelRepositoryRunResult = GetRepositoryTaskResult;

export class InvalidRepositoryAgentRpcData extends Schema.TaggedErrorClass<InvalidRepositoryAgentRpcData>()(
  "InvalidRepositoryAgentRpcData",
  { message: Schema.String },
) {}

export const decodeRepositoryAgentRpc = <A, I>(
  schema: Schema.Codec<A, I, never>,
  message: string,
) => (input: unknown): Effect.Effect<A, InvalidRepositoryAgentRpcData> =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(() => new InvalidRepositoryAgentRpcData({ message })),
  );
