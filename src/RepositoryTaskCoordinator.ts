import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  AttachWorkflowInputSchema,
  attachWorkflow as attachWorkflowSnapshot,
  CancelRunInputSchema,
  cancelRun,
  CompleteRunInputSchema,
  completeRun,
  CreateRepositoryTaskInputSchema,
  createRepositoryTaskSnapshot,
  decodeRepositoryRunHandle,
  decodeRepositoryTaskSnapshot,
  FailRunInputSchema,
  failRun,
  InvalidRepositoryTaskData,
  isActiveRun,
  MarkRunStageInputSchema,
  markRunStage,
  RecordRunProgressInputSchema,
  recordRunProgress,
  RecordRunStartedInputSchema,
  recordRunStarted,
  RepositoryTaskConflict,
  RepositoryTaskNotFound,
  requestRunCancellation,
  type RepositoryTaskSnapshot,
} from "./domain/repository-task.ts";

const SNAPSHOT_STORAGE_KEY = "repository-task";
const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const RequestCancellationInputSchema = Schema.Struct({
  taskId: RequiredText,
  runId: RequiredText,
  now: RequiredText,
});

const decodeInput = <A, I>(schema: Schema.Codec<A, I, never>, message: string, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError((cause) => new InvalidRepositoryTaskData({ message, cause })),
  );

export default class RepositoryTaskCoordinator extends Cloudflare.DurableObject<RepositoryTaskCoordinator>()(
  "RepositoryTaskCoordinator",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      const readSnapshot = Effect.fn("RepositoryTaskCoordinator.readSnapshot")(function* () {
        const stored = yield* state.storage.get<unknown>(SNAPSHOT_STORAGE_KEY);
        return stored === undefined ? null : yield* decodeRepositoryTaskSnapshot(stored);
      });

      const requireSnapshot = Effect.fn("RepositoryTaskCoordinator.requireSnapshot")(function* () {
        const snapshot = yield* readSnapshot();
        return snapshot === null
          ? yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }))
          : snapshot;
      });

      const persist = (snapshot: RepositoryTaskSnapshot) =>
        state.storage.put(SNAPSHOT_STORAGE_KEY, snapshot).pipe(Effect.as(snapshot));

      const createTask = Effect.fn("RepositoryTaskCoordinator.createTask")(function* (input: unknown) {
        const valid = yield* decodeInput(
          CreateRepositoryTaskInputSchema,
          "Invalid Repository Task creation input",
          input,
        );
        const existing = yield* readSnapshot();
        if (existing !== null) {
          if (existing.taskId === valid.taskId && existing.agentRuns[0]?.runId === valid.runId) {
            return existing;
          }
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Repository Task coordinator already owns a different task",
          }));
        }
        return yield* persist(createRepositoryTaskSnapshot(valid));
      });

      const attachWorkflow = Effect.fn("RepositoryTaskCoordinator.attachWorkflow")(function* (input: unknown) {
        const valid = yield* decodeInput(AttachWorkflowInputSchema, "Invalid Workflow attachment", input);
        const snapshot = yield* requireSnapshot();
        if (snapshot.taskId !== valid.taskId) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        const next = attachWorkflowSnapshot(
          snapshot,
          valid.runId,
          valid.workflowId,
          valid.now,
        );
        return yield* persist(next);
      });

      const markStage = Effect.fn("RepositoryTaskCoordinator.markStage")(function* (input: unknown) {
        const valid = yield* decodeInput(MarkRunStageInputSchema, "Invalid Agent Run stage update", input);
        const snapshot = yield* requireSnapshot();
        return yield* persist(markRunStage(
          snapshot,
          valid.runId,
          valid.stage,
          valid.activity,
          valid.now,
        ));
      });

      const recordStarted = Effect.fn("RepositoryTaskCoordinator.recordStarted")(function* (input: unknown) {
        const valid = yield* decodeInput(RecordRunStartedInputSchema, "Invalid Agent Run start update", input);
        const snapshot = yield* requireSnapshot();
        return yield* persist(recordRunStarted(snapshot, valid.runId, valid.started, valid.now));
      });

      const recordProgress = Effect.fn("RepositoryTaskCoordinator.recordProgress")(function* (input: unknown) {
        const valid = yield* decodeInput(RecordRunProgressInputSchema, "Invalid Agent Run progress update", input);
        const snapshot = yield* requireSnapshot();
        return yield* persist(recordRunProgress(snapshot, valid.runId, valid.status, valid.now));
      });

      const requestCancellation = Effect.fn("RepositoryTaskCoordinator.requestCancellation")(function* (input: unknown) {
        const valid = yield* decodeInput(
          RequestCancellationInputSchema,
          "Invalid Agent Run cancellation request",
          input,
        );
        const snapshot = yield* requireSnapshot();
        return yield* persist(requestRunCancellation(snapshot, valid.runId, valid.now));
      });

      const complete = Effect.fn("RepositoryTaskCoordinator.complete")(function* (input: unknown) {
        const valid = yield* decodeInput(CompleteRunInputSchema, "Invalid Agent Run completion", input);
        const snapshot = yield* requireSnapshot();
        return yield* persist(completeRun(
          snapshot,
          valid.runId,
          valid.artifactKey,
          valid.validated,
          valid.cleanup,
          valid.now,
        ));
      });

      const fail = Effect.fn("RepositoryTaskCoordinator.fail")(function* (input: unknown) {
        const valid = yield* decodeInput(FailRunInputSchema, "Invalid Agent Run failure", input);
        const snapshot = yield* requireSnapshot();
        return yield* persist(failRun(
          snapshot,
          valid.runId,
          valid.artifactKey,
          valid.failure,
          valid.cleanup,
          valid.now,
        ));
      });

      const cancel = Effect.fn("RepositoryTaskCoordinator.cancel")(function* (input: unknown) {
        const valid = yield* decodeInput(CancelRunInputSchema, "Invalid Agent Run cancellation", input);
        const snapshot = yield* requireSnapshot();
        return yield* persist(cancelRun(
          snapshot,
          valid.runId,
          valid.artifactKey,
          valid.cancellation,
          valid.now,
        ));
      });

      const runIsActive = Effect.fn("RepositoryTaskCoordinator.runIsActive")(function* (input: unknown) {
        const valid = yield* decodeRepositoryRunHandle(input);
        const snapshot = yield* requireSnapshot();
        return isActiveRun(snapshot, valid.runId);
      });

      return {
        attachWorkflow,
        cancel,
        complete,
        createTask,
        fail,
        getSnapshot: readSnapshot,
        markStage,
        recordProgress,
        recordStarted,
        requestCancellation,
        runIsActive,
      };
    });
  }),
) {}
