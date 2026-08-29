import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  decodeRepositoryTaskHeartbeatMessage,
  persistThenBroadcast,
  RepositoryTaskLiveConnectionAttachmentSchema,
  snapshotLiveMessage,
  type RepositoryTaskLiveConnectionAttachment,
} from "./domain/repository-task-live.ts";
import {
  CompletePullRequestPublicationInputSchema,
  FailPullRequestPublicationInputSchema,
  MarkPullRequestPublicationInputSchema,
  pullRequestPublicationArtifactKey,
  RetryPullRequestPublicationInputSchema,
  StartPullRequestPublicationInputSchema,
} from "./domain/pull-request-publication.ts";
import {
  AddAgentRunInputSchema,
  addAgentRun as addAgentRunSnapshot,
  AttachWorkflowInputSchema,
  attachWorkflow as attachWorkflowSnapshot,
  CancelRunInputSchema,
  cancelRun,
  canRetryPullRequestPublication,
  canStartPullRequestPublication,
  CompleteRunInputSchema,
  completePullRequestPublication,
  completeRun,
  CreateRepositoryTaskInputSchema,
  createRepositoryTaskSnapshot,
  decodeRepositoryRunHandle,
  decodeRepositoryTaskSnapshot,
  FailRunInputSchema,
  failPullRequestPublication,
  failRun,
  hasActivePullRequestPublication,
  InvalidRepositoryTaskData,
  isActiveRun,
  MarkRunStageInputSchema,
  markPullRequestPublication,
  markRunStage,
  RecordRunProgressInputSchema,
  recordRunProgress,
  RecordRunStartedInputSchema,
  recordRunStarted,
  RepositoryTaskConflict,
  RepositoryTaskNotFound,
  requestRunCancellation,
  retryPullRequestPublication,
  startPullRequestPublication,
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

      const broadcast = Effect.fn("RepositoryTaskCoordinator.broadcast")(function* (
        snapshot: RepositoryTaskSnapshot,
      ) {
        const payload = JSON.stringify(snapshotLiveMessage(snapshot));
        const sockets = yield* state.getWebSockets();
        yield* Effect.forEach(
          sockets,
          (socket) => socket.send(payload),
          { concurrency: "unbounded", discard: true },
        );
      });

      /** Authoritative ordering: persist first; a best-effort broadcast follows. */
      const persist = Effect.fn("RepositoryTaskCoordinator.persist")(function* (
        snapshot: RepositoryTaskSnapshot,
      ) {
        const next: RepositoryTaskSnapshot = {
          ...snapshot,
          revision: snapshot.revision + 1,
        };
        return yield* persistThenBroadcast(
          state.storage.put(SNAPSHOT_STORAGE_KEY, next).pipe(Effect.as(next)),
          broadcast,
        );
      });

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

      const addAgentRun = Effect.fn("RepositoryTaskCoordinator.addAgentRun")(function* (input: unknown) {
        const valid = yield* decodeInput(AddAgentRunInputSchema, "Invalid Agent Run creation input", input);
        const snapshot = yield* requireSnapshot();
        if (snapshot.taskId !== valid.taskId) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        if (snapshot.ownerId !== undefined && snapshot.ownerId !== valid.ownerId) {
          return yield* Effect.fail(new RepositoryTaskNotFound({
            message: "Repository Task was not found",
          }));
        }
        if (snapshot.activeRunId !== null) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Repository Task already has an active Agent Run",
          }));
        }
        if (hasActivePullRequestPublication(snapshot)) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Repository Task already has an active Pull Request Publication",
          }));
        }
        if (snapshot.runRequest.repositoryUrl !== valid.runRequest.repositoryUrl) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "An Agent Run cannot change its Repository Task repository",
          }));
        }
        if (snapshot.agentRuns.some((run) => run.runId === valid.runId)) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Agent Run already exists",
          }));
        }
        if (snapshot.agentRuns.length >= 25) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Repository Task reached its Agent Run history limit",
          }));
        }
        return yield* persist(addAgentRunSnapshot(snapshot, valid));
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
        const expectedArtifactKey =
          `repository-tasks/${valid.taskId}/agent-runs/${valid.runId}/completed.json`;
        if (snapshot.taskId !== valid.taskId || valid.artifactKey !== expectedArtifactKey) {
          return yield* Effect.fail(new RepositoryTaskNotFound({
            message: "Repository Task was not found",
          }));
        }
        if (valid.publicationEligible && !valid.validated) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Only a Validated Patch can enter Pull Request Publication",
          }));
        }
        let next = completeRun(
          snapshot,
          valid.runId,
          valid.artifactKey,
          valid.validated,
          valid.publicationEligible,
          valid.cleanup,
          valid.now,
        );
        if (valid.publicationEligible) {
          const completedRun = next.agentRuns.find((run) => run.runId === valid.runId);
          if (completedRun?.stage !== "complete" ||
              completedRun.artifactKey !== valid.artifactKey) {
            return yield* persist(next);
          }
          if (completedRun.baseSha === null || completedRun.validated !== true) {
            return yield* Effect.fail(new RepositoryTaskConflict({
              message: "Only a based Validated Patch can enter Pull Request Publication",
            }));
          }
          next = startPullRequestPublication(next, {
            taskId: next.taskId,
            runId: valid.runId,
            publicationId: `publication-${valid.runId}`,
            attempt: 1,
            patchArtifactKey: valid.artifactKey,
            baseSha: completedRun.baseSha,
            branch: `polyphemus/${next.taskId}`,
            now: valid.now,
          });
        }
        return yield* persist(next);
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

      const startPublication = Effect.fn("RepositoryTaskCoordinator.startPublication")(function* (input: unknown) {
        const valid = yield* decodeInput(
          StartPullRequestPublicationInputSchema,
          "Invalid Pull Request Publication start",
          input,
        );
        const snapshot = yield* requireSnapshot();
        const run = snapshot.agentRuns.find((candidate) => candidate.runId === valid.runId);
        if (snapshot.taskId !== valid.taskId || run === undefined) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        if (run.publication !== null) {
          if (run.publication.publicationId === valid.publicationId &&
              run.publication.patchArtifactKey === valid.patchArtifactKey) {
            return snapshot;
          }
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Validated Patch already has a Pull Request Publication",
          }));
        }
        if (hasActivePullRequestPublication(snapshot)) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Repository Task already has an active Pull Request Publication",
          }));
        }
        if (!canStartPullRequestPublication(snapshot, valid)) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Only the persisted Validated Patch can be published",
          }));
        }
        return yield* persist(startPullRequestPublication(snapshot, valid));
      });

      const retryPublication = Effect.fn("RepositoryTaskCoordinator.retryPublication")(function* (input: unknown) {
        const valid = yield* decodeInput(
          RetryPullRequestPublicationInputSchema,
          "Invalid Pull Request Publication retry",
          input,
        );
        const snapshot = yield* requireSnapshot();
        if (snapshot.taskId !== valid.taskId) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        if (snapshot.activeRunId !== null) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Repository Task already has an active Agent Run",
          }));
        }
        if (hasActivePullRequestPublication(snapshot)) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Repository Task already has an active Pull Request Publication",
          }));
        }
        if (!canRetryPullRequestPublication(snapshot, valid)) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Only a failed publication for the persisted Validated Patch can be retried",
          }));
        }
        return yield* persist(retryPullRequestPublication(snapshot, valid));
      });

      const markPublication = Effect.fn("RepositoryTaskCoordinator.markPublication")(function* (input: unknown) {
        const valid = yield* decodeInput(
          MarkPullRequestPublicationInputSchema,
          "Invalid Pull Request Publication progress",
          input,
        );
        const snapshot = yield* requireSnapshot();
        const publication = snapshot.agentRuns.find((run) => run.runId === valid.runId)?.publication;
        if (snapshot.taskId !== valid.taskId || publication === undefined) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        if (publication === null || publication.publicationId !== valid.publicationId) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Pull Request Publication does not match the selected Validated Patch",
          }));
        }
        if (publication.attempt !== valid.attempt) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Pull Request Publication attempt is no longer current",
          }));
        }
        if (publication.status === "complete" || publication.status === "failed") {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Pull Request Publication is already terminal",
          }));
        }
        return yield* persist(markPullRequestPublication(snapshot, valid));
      });

      const completePublication = Effect.fn("RepositoryTaskCoordinator.completePublication")(function* (input: unknown) {
        const valid = yield* decodeInput(
          CompletePullRequestPublicationInputSchema,
          "Invalid Pull Request Publication completion",
          input,
        );
        const snapshot = yield* requireSnapshot();
        const publication = snapshot.agentRuns.find((run) => run.runId === valid.runId)?.publication;
        if (snapshot.taskId !== valid.taskId || publication === undefined) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        if (publication === null || publication.publicationId !== valid.publicationId) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Pull Request Publication does not match the selected Validated Patch",
          }));
        }
        const expectedArtifactKey = pullRequestPublicationArtifactKey(
          valid.taskId,
          valid.runId,
          valid.attempt,
        );
        if (publication.attempt !== valid.attempt ||
            valid.publicationArtifactKey !== expectedArtifactKey ||
            valid.evidence.branch !== publication.branch) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Pull Request Publication evidence does not match its durable intent",
          }));
        }
        if (publication.status === "complete") {
          return publication.publicationArtifactKey === valid.publicationArtifactKey &&
              JSON.stringify(publication.evidence) === JSON.stringify(valid.evidence)
            ? snapshot
            : yield* Effect.fail(new RepositoryTaskConflict({
                message: "Pull Request Publication already completed with different evidence",
              }));
        }
        if (publication.status === "failed") {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Failed Pull Request Publication cannot be completed",
          }));
        }
        return yield* persist(completePullRequestPublication(
          snapshot,
          valid.runId,
          valid.publicationId,
          valid.attempt,
          valid.publicationArtifactKey,
          valid.evidence,
          valid.now,
        ));
      });

      const failPublication = Effect.fn("RepositoryTaskCoordinator.failPublication")(function* (input: unknown) {
        const valid = yield* decodeInput(
          FailPullRequestPublicationInputSchema,
          "Invalid Pull Request Publication failure",
          input,
        );
        const snapshot = yield* requireSnapshot();
        const publication = snapshot.agentRuns.find((run) => run.runId === valid.runId)?.publication;
        if (snapshot.taskId !== valid.taskId || publication === undefined) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        if (publication === null || publication.publicationId !== valid.publicationId) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Pull Request Publication does not match the selected Validated Patch",
          }));
        }
        const expectedArtifactKey = pullRequestPublicationArtifactKey(
          valid.taskId,
          valid.runId,
          valid.attempt,
        );
        if (publication.attempt !== valid.attempt ||
            (valid.publicationArtifactKey !== null &&
              valid.publicationArtifactKey !== expectedArtifactKey)) {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Pull Request Publication failure pointer is invalid",
          }));
        }
        if (publication.status === "failed") {
          return publication.publicationArtifactKey === valid.publicationArtifactKey &&
              JSON.stringify(publication.failure) === JSON.stringify(valid.failure)
            ? snapshot
            : yield* Effect.fail(new RepositoryTaskConflict({
                message: "Pull Request Publication already failed with different evidence",
              }));
        }
        if (publication.status === "complete") {
          return yield* Effect.fail(new RepositoryTaskConflict({
            message: "Completed Pull Request Publication cannot be failed",
          }));
        }
        return yield* persist(failPullRequestPublication(
          snapshot,
          valid.runId,
          valid.publicationId,
          valid.attempt,
          valid.publicationArtifactKey,
          valid.failure,
          valid.now,
        ));
      });

      const fetch = Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        if (request.method !== "GET" || request.headers.upgrade?.toLowerCase() !== "websocket") {
          return HttpServerResponse.text("Not Found", { status: 404 });
        }
        const snapshot = yield* requireSnapshot();
        const [response, socket] = yield* Cloudflare.upgrade();
        socket.serializeAttachment({
          version: 1,
          taskId: snapshot.taskId,
          connectionId: crypto.randomUUID(),
        } satisfies RepositoryTaskLiveConnectionAttachment);
        yield* socket.send(JSON.stringify(snapshotLiveMessage(snapshot))).pipe(
          Effect.exit,
          Effect.asVoid,
        );
        return response;
      }).pipe(
        Effect.catch(() => Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 }))),
      );

      const webSocketMessage = Effect.fn("RepositoryTaskCoordinator.webSocketMessage")(
        function* (socket: Cloudflare.WebSocket, message: string | ArrayBuffer) {
          const attachment = yield* Effect.try({
            try: () => Schema.decodeUnknownSync(RepositoryTaskLiveConnectionAttachmentSchema)(
              socket.deserializeAttachment<unknown>(),
            ),
            catch: () => null,
          });
          const oversizedBinary = message instanceof ArrayBuffer && message.byteLength > 1_024;
          const text = typeof message === "string"
            ? message
            : oversizedBinary ? "" : new TextDecoder().decode(new Uint8Array(message));
          const snapshot = yield* readSnapshot();
          if (attachment === null || snapshot === null || oversizedBinary ||
              attachment.taskId !== snapshot.taskId || text.length > 1_024) {
            return yield* socket.close(1008, "Invalid live control message");
          }
          const heartbeat = yield* Effect.try({
            try: () => JSON.parse(text) as unknown,
            catch: () => null,
          }).pipe(
            Effect.flatMap((value) => value === null
              ? Effect.succeed(null)
              : decodeRepositoryTaskHeartbeatMessage(value).pipe(
                  Effect.match({ onFailure: () => null, onSuccess: (decoded) => decoded }),
                )),
          );
          if (heartbeat === null) {
            return yield* socket.close(1008, "Invalid live control message");
          }
          yield* socket.send(JSON.stringify({
            version: 1,
            type: "repository-task.heartbeat.ack",
            sentAt: heartbeat.sentAt,
          }));
        },
      );

      const webSocketClose = Effect.fn("RepositoryTaskCoordinator.webSocketClose")(
        function* (_socket: Cloudflare.WebSocket, _code: number, _reason: string, _wasClean: boolean) {
          return yield* Effect.void;
        },
      );

      return {
        addAgentRun,
        attachWorkflow,
        cancel,
        complete,
        completePublication,
        createTask,
        fail,
        failPublication,
        fetch,
        getSnapshot: readSnapshot,
        markPublication,
        markStage,
        recordProgress,
        recordStarted,
        requestCancellation,
        retryPublication,
        runIsActive,
        startPublication,
        webSocketClose,
        webSocketMessage,
      };
    });
  }),
) {}
