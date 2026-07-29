import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { decodeAccessIdentity, InvalidProductIdentity, type ProductIdentity } from "./domain/product-identity.ts";
import {
  decodeRepositoryRunHandle,
  decodeRepositoryRunRequest,
  decodeRunArtifact,
  decodeStartAdditionalRunRequest,
  InvalidRepositoryTaskData,
  RepositoryTaskConflict,
  RepositoryTaskNotFound,
  type RepositoryRunHandle,
  type AddAgentRunInput,
  type RepositoryRunRequest,
  type RepositoryTaskSnapshot,
  type RunArtifact,
  type SafeRunFailure,
} from "./domain/repository-task.ts";
import { parsePublicGithubRepository } from "./domain/repository-policy.ts";
import {
  decodeRepositoryTaskIndexEntries,
  RepositoryTaskIndexFailed,
  type RepositoryTaskIndexEntry,
} from "./domain/repository-task-index.ts";
import { makeRepositoryAgentClient } from "./domain/repository-agent-client.ts";
import RepositoryRunWorkflow from "./RepositoryRunWorkflow.ts";
import RepositoryTaskCoordinator from "./RepositoryTaskCoordinator.ts";
import { RepositoryTaskIndexDatabase } from "./RepositoryTaskIndexDatabase.ts";
import { RunArtifactsBucket } from "./RunArtifactsBucket.ts";
import { SandboxRuntimeWorker } from "./SandboxRuntimeWorker.ts";

export class RepositoryAgentBackendFailed extends Schema.TaggedErrorClass<RepositoryAgentBackendFailed>()(
  "RepositoryAgentBackendFailed",
  { operation: Schema.String, message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

const now = (): string => new Date().toISOString();
const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "Repository Task operation failed";
const errorCode = (error: unknown): string =>
  typeof error === "object" && error !== null && "_tag" in error
    ? String(error._tag)
    : "RepositoryAgentBackendError";

const cancelledArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/cancelled.json`;
const failedArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/failed.json`;

const findRun = (snapshot: RepositoryTaskSnapshot, runId: string) =>
  snapshot.agentRuns.find((run) => run.runId === runId);

export default class RepositoryAgentControl extends Cloudflare.DurableObject<RepositoryAgentControl>()(
  "RepositoryAgentControl",
  Effect.gen(function* () {
    const coordinators = yield* RepositoryTaskCoordinator;
    const workflow = yield* RepositoryRunWorkflow;
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(RunArtifactsBucket);
    const indexDatabaseResource = yield* RepositoryTaskIndexDatabase;
    const indexDatabase = yield* Cloudflare.D1.QueryDatabase(indexDatabaseResource);
    const sandboxRuntimeResource = yield* SandboxRuntimeWorker;
    const fetchSandboxRuntime = yield* Cloudflare.Workers.Fetch(sandboxRuntimeResource);
    const sandboxToken = yield* Config.redacted("SANDBOX_API_TOKEN").pipe(Effect.orDie);
    const sandboxClient = makeRepositoryAgentClient(fetchSandboxRuntime, sandboxToken);

    return Effect.gen(function* () {
      const makeRunInput = (
        taskId: string,
        ownerId: string,
        runRequest: RepositoryRunRequest,
      ): AddAgentRunInput => {
        const runId = `run-${crypto.randomUUID()}`;
        const sandboxId = `sandbox-${crypto.randomUUID()}`;
        return {
          taskId,
          ownerId,
          runId,
          sandboxId,
          processId: `pi-${sandboxId}`,
          runRequest,
          now: now(),
        };
      };

      const startRunWorkflow = Effect.fn("RepositoryAgentBackend.startRunWorkflow")(function* (
        input: AddAgentRunInput,
      ) {
        const instance = yield* workflow.create({
          id: input.runId,
          params: input,
          retention: { successRetention: "7 days", errorRetention: "30 days" },
        }).pipe(
          Effect.catchDefect((createCause) => workflow.get(input.runId).pipe(
            Effect.flatMap((existing) => existing.status().pipe(Effect.as(existing))),
            Effect.catchDefect(() => Effect.fail(new RepositoryAgentBackendFailed({
              operation: "start-workflow",
              message: "Could not start or recover the Agent Run Workflow",
              cause: createCause,
            }))),
          )),
          Effect.tapError((error) => failUnstartedWorkflow(
            input,
            error.message,
          ).pipe(
            Effect.catch(() => Effect.void),
            Effect.catchDefect(() => Effect.void),
          )),
        );
        yield* coordinators.getByName(input.taskId).attachWorkflow({
          taskId: input.taskId,
          runId: input.runId,
          workflowId: instance.id,
          now: now(),
        });
        return { taskId: input.taskId, runId: input.runId } satisfies RepositoryRunHandle;
      });

      const normalizeRunRequest = (runRequest: RepositoryRunRequest) =>
        parsePublicGithubRepository(runRequest.repositoryUrl).pipe(
          Effect.map((repository): RepositoryRunRequest => ({
            ...runRequest,
            repositoryUrl: repository.canonicalUrl,
          })),
          Effect.mapError((error) => new InvalidRepositoryTaskData({
            message: error.message,
            cause: error,
          })),
        );

      const indexTask = Effect.fn("RepositoryAgentBackend.indexTask")(function* (
        entry: RepositoryTaskIndexEntry,
      ) {
        yield* indexDatabase.prepare(
          `INSERT INTO repository_task_index (
            task_id, owner_id, repository_url, objective, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            owner_id = excluded.owner_id,
            repository_url = excluded.repository_url,
            objective = excluded.objective,
            updated_at = excluded.updated_at`,
        ).bind(
          entry.taskId,
          entry.ownerId,
          entry.repositoryUrl,
          entry.objective,
          entry.createdAt,
          entry.updatedAt,
        ).run().pipe(
          Effect.catchDefect((cause) => Effect.fail(
            RepositoryTaskIndexFailed.fromUnknown("upsert-index", cause),
          )),
        );
      });

      const requireTaskOwner = Effect.fn("RepositoryAgentBackend.requireTaskOwner")(function* (
        ownerId: string,
        taskId: string,
      ) {
        const row = yield* indexDatabase.prepare(
          "SELECT task_id AS taskId FROM repository_task_index WHERE task_id = ? AND owner_id = ?",
        ).bind(taskId, ownerId).first<{ readonly taskId: string }>().pipe(
          Effect.catchDefect((cause) => Effect.fail(
            RepositoryTaskIndexFailed.fromUnknown("authorize-task", cause),
          )),
        );
        if (row === null) {
          return yield* Effect.fail(new RepositoryTaskNotFound({
            message: "Repository Task was not found",
          }));
        }
      });

      const createRepositoryTask = Effect.fn("RepositoryAgentBackend.createRepositoryTask")(function* (
        unknownRequest: unknown,
        identity: ProductIdentity,
      ) {
        const decodedRequest = yield* decodeRepositoryRunRequest(unknownRequest);
        const runRequest = yield* normalizeRunRequest(decodedRequest);
        const taskId = `task-${crypto.randomUUID()}`;
        const input = makeRunInput(taskId, identity.userId, runRequest);
        yield* coordinators.getByName(taskId).createTask(input);
        yield* indexTask({
          taskId,
          ownerId: identity.userId,
          repositoryUrl: runRequest.repositoryUrl,
          objective: runRequest.task,
          createdAt: input.now,
          updatedAt: input.now,
        });
        return yield* startRunWorkflow(input);
      });

      const startAdditionalRepositoryRun = Effect.fn("RepositoryAgentBackend.startAdditionalRepositoryRun")(function* (
        unknownRequest: unknown,
        identity: ProductIdentity,
      ) {
        const request = yield* decodeStartAdditionalRunRequest(unknownRequest);
        yield* requireTaskOwner(identity.userId, request.taskId);
        const runRequest = yield* normalizeRunRequest(request.runRequest);
        const coordinator = coordinators.getByName(request.taskId);
        const snapshot = yield* coordinator.getSnapshot();
        if (snapshot === null) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        const input = makeRunInput(request.taskId, identity.userId, runRequest);
        yield* coordinator.addAgentRun(input);
        yield* indexTask({
          taskId: request.taskId,
          ownerId: identity.userId,
          repositoryUrl: runRequest.repositoryUrl,
          objective: runRequest.task,
          createdAt: snapshot.createdAt,
          updatedAt: input.now,
        });
        return yield* startRunWorkflow(input);
      });

      const getRepositoryTask = Effect.fn("RepositoryAgentBackend.getRepositoryTask")(function* (
        unknownHandle: unknown,
        identity: ProductIdentity,
      ) {
        const handle = yield* decodeRepositoryRunHandle(unknownHandle);
        yield* requireTaskOwner(identity.userId, handle.taskId);
        const snapshot = yield* coordinators.getByName(handle.taskId).getSnapshot();
        if (snapshot === null || findRun(snapshot, handle.runId) === undefined) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
        }
        return snapshot;
      });

      const listRepositoryTasks = Effect.fn("RepositoryAgentBackend.listRepositoryTasks")(function* (
        identity: ProductIdentity,
      ) {
        const rows = yield* indexDatabase.prepare(
          `SELECT
            task_id AS taskId,
            owner_id AS ownerId,
            repository_url AS repositoryUrl,
            objective,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM repository_task_index
          WHERE owner_id = ?
          ORDER BY updated_at DESC
          LIMIT 50`,
        ).bind(identity.userId).all<RepositoryTaskIndexEntry>().pipe(
          Effect.map((result) => result.results),
          Effect.catchDefect((cause) => Effect.fail(
            RepositoryTaskIndexFailed.fromUnknown("list-index", cause),
          )),
          Effect.flatMap(decodeRepositoryTaskIndexEntries),
        );
        const snapshots = yield* Effect.forEach(
          rows,
          (row) => coordinators.getByName(row.taskId).getSnapshot(),
          { concurrency: 5 },
        );
        return snapshots.filter((snapshot): snapshot is RepositoryTaskSnapshot => snapshot !== null);
      });

      const getRunArtifact = Effect.fn("RepositoryAgentBackend.getRunArtifact")(function* (
        unknownHandle: unknown,
        identity: ProductIdentity,
      ) {
        const handle = yield* decodeRepositoryRunHandle(unknownHandle);
        const snapshot = yield* getRepositoryTask(handle, identity);
        const run = findRun(snapshot, handle.runId)!;
        if (run.artifactKey === null) {
          return yield* Effect.fail(new RepositoryTaskConflict({ message: "Run Result is not available yet" }));
        }
        const expectedPrefix = `repository-tasks/${handle.taskId}/agent-runs/${handle.runId}/`;
        if (!run.artifactKey.startsWith(expectedPrefix) || run.artifactKey.includes("..")) {
          return yield* Effect.fail(new InvalidRepositoryTaskData({
            message: "Stored Run Result pointer is invalid",
          }));
        }
        const object = yield* bucket.get(run.artifactKey).pipe(
          Effect.mapError((cause) => new RepositoryAgentBackendFailed({
            operation: "read-run-result",
            message: "Could not read the Run Result",
            cause,
          })),
        );
        if (object === null) {
          return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Run Result was not found" }));
        }
        return yield* object.json<unknown>().pipe(
          Effect.mapError((cause) => new RepositoryAgentBackendFailed({
            operation: "decode-run-result-json",
            message: "Run Result storage returned invalid JSON",
            cause,
          })),
          Effect.flatMap(decodeRunArtifact),
        );
      });

      const cancelRepositoryRun = Effect.fn("RepositoryAgentBackend.cancelRepositoryRun")(function* (
        unknownHandle: unknown,
        identity: ProductIdentity,
      ) {
        const handle = yield* decodeRepositoryRunHandle(unknownHandle);
        const coordinator = coordinators.getByName(handle.taskId);
        const snapshot = yield* getRepositoryTask(handle, identity);
        const run = findRun(snapshot, handle.runId)!;
        if (run.stage === "complete" || run.stage === "failed" || run.stage === "cancelled") {
          return snapshot;
        }

        yield* coordinator.requestCancellation({ ...handle, now: now() });
        if (run.workflowId !== null) {
          yield* workflow.get(run.workflowId).pipe(
            Effect.flatMap((instance) => instance.terminate()),
            Effect.catchDefect((cause) => Effect.logWarning("Workflow termination during cancellation failed", {
              taskId: handle.taskId,
              runId: handle.runId,
              message: errorMessage(cause),
            })),
          );
        }

        const cancellation = yield* sandboxClient.cancel({
          sandboxId: run.sandboxId,
          processId: run.processId,
        }).pipe(
          Effect.mapError((cause) => new RepositoryAgentBackendFailed({
            operation: "cancel-sandbox-run",
            message: cause.message,
            cause,
          })),
        );
        const artifactKey = cancelledArtifactKey(handle.taskId, handle.runId);
        const artifact: RunArtifact = {
          version: 1,
          taskId: handle.taskId,
          runId: handle.runId,
          repositoryUrl: run.runRequest?.repositoryUrl ?? snapshot.runRequest.repositoryUrl,
          runRequest: run.runRequest?.task ?? snapshot.runRequest.task,
          createdAt: now(),
          terminal: { status: "cancelled", cancellation },
        };
        yield* bucket.put(artifactKey, JSON.stringify(artifact), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        }).pipe(
          Effect.mapError((cause) => new RepositoryAgentBackendFailed({
            operation: "persist-cancelled-run-result",
            message: "Could not persist the cancelled Run Result",
            cause,
          })),
        );
        return yield* coordinator.cancel({
          ...handle,
          artifactKey,
          cancellation,
          now: now(),
        });
      });

      const failUnstartedWorkflow = Effect.fn("RepositoryAgentBackend.failUnstartedWorkflow")(function* (
        input: {
          readonly taskId: string;
          readonly runId: string;
          readonly runRequest: RepositoryRunRequest;
        },
        message: string,
      ) {
        const artifactKey = failedArtifactKey(input.taskId, input.runId);
        const failure: SafeRunFailure = {
          code: "WorkflowStartFailed",
          message,
          stage: "submitted",
        };
        const artifact: RunArtifact = {
          version: 1,
          taskId: input.taskId,
          runId: input.runId,
          repositoryUrl: input.runRequest.repositoryUrl,
          runRequest: input.runRequest.task,
          createdAt: now(),
          terminal: { status: "failed", failure, events: [], cleanup: null },
        };
        yield* bucket.put(artifactKey, JSON.stringify(artifact), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        yield* coordinators.getByName(input.taskId).fail({
          taskId: input.taskId,
          runId: input.runId,
          artifactKey,
          failure,
          cleanup: null,
          now: now(),
        });
      });

      const route = Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const identity = yield* decodeAccessIdentity(request.headers["x-polyphemus-user-id"]);
        const url = new URL(request.originalUrl, "https://repository-agent.internal");
        if (request.method === "POST" && url.pathname === "/repository-tasks") {
          const body = yield* request.json;
          return yield* createRepositoryTask(body, identity).pipe(
            Effect.flatMap((result) => HttpServerResponse.json(result, { status: 202 })),
          );
        }
        if (request.method === "POST" && url.pathname === "/repository-tasks/runs") {
          const body = yield* request.json;
          return yield* startAdditionalRepositoryRun(body, identity).pipe(
            Effect.flatMap((result) => HttpServerResponse.json(result, { status: 202 })),
          );
        }
        if (request.method === "POST" && url.pathname === "/repository-tasks/index") {
          return yield* listRepositoryTasks(identity).pipe(Effect.flatMap(HttpServerResponse.json));
        }
        if (request.method === "POST" && url.pathname === "/repository-tasks/status") {
          const body = yield* request.json;
          return yield* getRepositoryTask(body, identity).pipe(Effect.flatMap(HttpServerResponse.json));
        }
        if (request.method === "POST" && url.pathname === "/repository-tasks/result") {
          const body = yield* request.json;
          return yield* getRunArtifact(body, identity).pipe(Effect.flatMap(HttpServerResponse.json));
        }
        if (request.method === "POST" && url.pathname === "/repository-tasks/cancel") {
          const body = yield* request.json;
          return yield* cancelRepositoryRun(body, identity).pipe(Effect.flatMap(HttpServerResponse.json));
        }
        return HttpServerResponse.text("Polyphemus Repository Agent backend", { status: 404 });
      });

      return {
        cancelRepositoryRun,
        createRepositoryTask,
        startAdditionalRepositoryRun,
        fetch: route.pipe(
          Effect.catchTags({
            InvalidProductIdentity: (error) => HttpServerResponse.json({
              error: error._tag,
              message: error.message,
            }, { status: 401 }),
            InvalidRepositoryTaskData: (error) => HttpServerResponse.json({
              error: error._tag,
              message: error.message,
            }, { status: 400 }),
            RepositoryTaskConflict: (error) => HttpServerResponse.json({
              error: error._tag,
              message: error.message,
            }, { status: 409 }),
            RepositoryTaskNotFound: (error) => HttpServerResponse.json({
              error: error._tag,
              message: error.message,
            }, { status: 404 }),
            RepositoryTaskIndexFailed: (error) => HttpServerResponse.json({
              error: error._tag,
              message: error.message,
            }, { status: 503 }),
            RepositoryAgentBackendFailed: (error) => HttpServerResponse.json({
              error: error._tag,
              message: error.message,
            }, { status: 500 }),
          }),
          Effect.catch((error) => HttpServerResponse.json({
            error: errorCode(error),
            message: errorMessage(error),
          }, { status: 500 })),
          Effect.catchDefect((cause) => HttpServerResponse.json({
            error: "RepositoryAgentBackendDefect",
            message: "The Repository Agent backend failed unexpectedly",
          }, { status: 500 })),
        ),
        getRepositoryTask,
        getRunArtifact,
        listRepositoryTasks,
      };
    });
  }).pipe(
    Effect.provide(Cloudflare.Workers.FetchBinding),
    Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding),
  ),
) {}
