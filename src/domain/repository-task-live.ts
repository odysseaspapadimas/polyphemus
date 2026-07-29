import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RepositoryTaskSnapshotSchema } from "./repository-task.ts";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const Revision = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

export const RepositoryTaskIdSchema = RequiredText.check(
  Schema.isPattern(/^task-[A-Za-z0-9-]+$/),
);

export const RepositoryTaskSnapshotLiveMessageSchema = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("repository-task.snapshot"),
  taskId: RepositoryTaskIdSchema,
  revision: Revision,
  snapshot: RepositoryTaskSnapshotSchema,
});
export type RepositoryTaskSnapshotLiveMessage =
  typeof RepositoryTaskSnapshotLiveMessageSchema.Type;

export const RepositoryTaskHeartbeatMessageSchema = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("repository-task.heartbeat"),
  sentAt: RequiredText,
});
export type RepositoryTaskHeartbeatMessage = typeof RepositoryTaskHeartbeatMessageSchema.Type;

export const RepositoryTaskHeartbeatAckMessageSchema = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("repository-task.heartbeat.ack"),
  sentAt: RequiredText,
});

export const RepositoryTaskLiveServerMessageSchema = Schema.Union([
  RepositoryTaskSnapshotLiveMessageSchema,
  RepositoryTaskHeartbeatAckMessageSchema,
]);
export type RepositoryTaskLiveServerMessage = typeof RepositoryTaskLiveServerMessageSchema.Type;

export const RepositoryTaskLiveConnectionAttachmentSchema = Schema.Struct({
  version: Schema.Literal(1),
  taskId: RepositoryTaskIdSchema,
  connectionId: RequiredText,
});
export type RepositoryTaskLiveConnectionAttachment =
  typeof RepositoryTaskLiveConnectionAttachmentSchema.Type;

export class InvalidRepositoryTaskLiveData extends Schema.TaggedErrorClass<InvalidRepositoryTaskLiveData>()(
  "InvalidRepositoryTaskLiveData",
  { message: Schema.String },
) {}

export const snapshotLiveMessage = (
  snapshot: typeof RepositoryTaskSnapshotSchema.Type,
): RepositoryTaskSnapshotLiveMessage => ({
  version: 1,
  type: "repository-task.snapshot",
  taskId: snapshot.taskId,
  revision: snapshot.revision,
  snapshot,
});

/** Persist success is authoritative; broadcast failures and defects are advisory. */
export const persistThenBroadcast = <A, E, R, R2>(
  persist: Effect.Effect<A, E, R>,
  broadcast: (value: A) => Effect.Effect<unknown, unknown, R2>,
): Effect.Effect<A, E, R | R2> => persist.pipe(
  Effect.tap((value) => broadcast(value).pipe(Effect.exit, Effect.asVoid)),
);

export const decodeRepositoryTaskLiveServerMessage = (
  input: unknown,
): Effect.Effect<RepositoryTaskLiveServerMessage, InvalidRepositoryTaskLiveData> =>
  Schema.decodeUnknownEffect(RepositoryTaskLiveServerMessageSchema)(input).pipe(
    Effect.mapError(() => new InvalidRepositoryTaskLiveData({
      message: "Invalid Repository Task live message",
    })),
    Effect.flatMap((message) => message.type !== "repository-task.snapshot" ||
        (message.taskId === message.snapshot.taskId &&
          message.revision === message.snapshot.revision)
      ? Effect.succeed(message)
      : Effect.fail(new InvalidRepositoryTaskLiveData({
          message: "Repository Task live message metadata does not match its snapshot",
        }))),
  );

export const decodeRepositoryTaskHeartbeatMessage = (
  input: unknown,
): Effect.Effect<RepositoryTaskHeartbeatMessage, InvalidRepositoryTaskLiveData> =>
  Schema.decodeUnknownEffect(RepositoryTaskHeartbeatMessageSchema)(input).pipe(
    Effect.mapError(() => new InvalidRepositoryTaskLiveData({
      message: "Invalid Repository Task heartbeat message",
    })),
  );
