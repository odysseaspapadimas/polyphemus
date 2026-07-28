import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  decodeRepositoryRunHandle,
  decodeRepositoryRunRequest,
  decodeRunArtifact,
  InvalidRepositoryTaskData,
  RepositoryTaskConflict,
  RepositoryTaskNotFound,
  type RepositoryRunHandle,
  type RepositoryRunRequest,
  type RepositoryTaskSnapshot,
  type RunArtifact,
  type SafeRunFailure,
} from "./domain/repository-task.ts";
import { makeSpikeWorkerClient } from "./domain/spike-client.ts";
import RepositoryRunWorkflow from "./RepositoryRunWorkflow.ts";
import RepositoryTaskCoordinator from "./RepositoryTaskCoordinator.ts";
import { RunArtifactsBucket } from "./RunArtifactsBucket.ts";
import { SpikeWorker } from "./SpikeWorker.ts";
import { SPIKE_FIXTURE_REPOSITORY } from "./spike-config.ts";

export class ControlPlaneOperationFailed extends Schema.TaggedErrorClass<ControlPlaneOperationFailed>()(
  "ControlPlaneOperationFailed",
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
    : "ControlPlaneError";

const cancelledArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/cancelled.json`;
const failedArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/failed.json`;

const findRun = (snapshot: RepositoryTaskSnapshot, runId: string) =>
  snapshot.agentRuns.find((run) => run.runId === runId);

export default class ControlWorker extends Cloudflare.Worker<ControlWorker>()(
  "ControlWorker",
  {
    name: "polyphemus-control",
    main: import.meta.url,
    url: false,
    compatibility: { date: "2026-07-28", flags: ["nodejs_compat"] },
    observability: { enabled: true, logs: { enabled: true, invocationLogs: true } },
    env: { SpikeWorker },
  },
  Effect.gen(function* () {
    const coordinators = yield* RepositoryTaskCoordinator;
    const workflow = yield* RepositoryRunWorkflow;
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(RunArtifactsBucket);
    const spikeResource = yield* SpikeWorker;
    const fetchSpike = yield* Cloudflare.Workers.Fetch(spikeResource);
    const spikeToken = yield* Config.redacted("SPIKE_API_TOKEN");
    const spike = makeSpikeWorkerClient(fetchSpike, spikeToken);

    const createRepositoryTask = Effect.fn("ControlWorker.createRepositoryTask")(function* (
      unknownRequest: unknown,
    ) {
      const runRequest = yield* decodeRepositoryRunRequest(unknownRequest);
      if (runRequest.repositoryUrl.replace(/\/$/, "") !== SPIKE_FIXTURE_REPOSITORY) {
        return yield* Effect.fail(new InvalidRepositoryTaskData({
          message: "The controlled product shell only accepts the pinned fixture repository",
        }));
      }

      const taskId = `task-${crypto.randomUUID()}`;
      const runId = `run-${crypto.randomUUID()}`;
      const sandboxId = `spike-${crypto.randomUUID()}`;
      const processId = `pi-${sandboxId}`;
      const createdAt = now();
      const input = {
        taskId,
        runId,
        sandboxId,
        processId,
        runRequest,
        now: createdAt,
      };
      const coordinator = coordinators.getByName(taskId);
      yield* coordinator.createTask(input);

      const instance = yield* workflow.create({
        id: runId,
        params: input,
        retention: { successRetention: "7 days", errorRetention: "30 days" },
      }).pipe(
        Effect.catchDefect((cause) => Effect.fail(new ControlPlaneOperationFailed({
          operation: "start-workflow",
          message: "Could not start the Agent Run Workflow",
          cause,
        }))),
        Effect.tapError((error) => failUnstartedWorkflow(
          { taskId, runId, runRequest },
          error.message,
        ).pipe(
          Effect.catch(() => Effect.void),
          Effect.catchDefect(() => Effect.void),
        )),
      );
      yield* coordinator.attachWorkflow({
        taskId,
        runId,
        workflowId: instance.id,
        now: now(),
      });
      return { taskId, runId } satisfies RepositoryRunHandle;
    });

    const getRepositoryTask = Effect.fn("ControlWorker.getRepositoryTask")(function* (
      unknownHandle: unknown,
    ) {
      const handle = yield* decodeRepositoryRunHandle(unknownHandle);
      const snapshot = yield* coordinators.getByName(handle.taskId).getSnapshot();
      if (snapshot === null || findRun(snapshot, handle.runId) === undefined) {
        return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
      }
      return snapshot;
    });

    const getRunArtifact = Effect.fn("ControlWorker.getRunArtifact")(function* (
      unknownHandle: unknown,
    ) {
      const handle = yield* decodeRepositoryRunHandle(unknownHandle);
      const snapshot = yield* getRepositoryTask(handle);
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
        Effect.mapError((cause) => new ControlPlaneOperationFailed({
          operation: "read-run-result",
          message: "Could not read the Run Result",
          cause,
        })),
      );
      if (object === null) {
        return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Run Result was not found" }));
      }
      return yield* object.json<unknown>().pipe(
        Effect.mapError((cause) => new ControlPlaneOperationFailed({
          operation: "decode-run-result-json",
          message: "Run Result storage returned invalid JSON",
          cause,
        })),
        Effect.flatMap(decodeRunArtifact),
      );
    });

    const cancelRepositoryRun = Effect.fn("ControlWorker.cancelRepositoryRun")(function* (
      unknownHandle: unknown,
    ) {
      const handle = yield* decodeRepositoryRunHandle(unknownHandle);
      const coordinator = coordinators.getByName(handle.taskId);
      const snapshot = yield* getRepositoryTask(handle);
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

      const cancellation = yield* spike.cancel({
        sandboxId: run.sandboxId,
        processId: run.processId,
      }).pipe(
        Effect.mapError((cause) => new ControlPlaneOperationFailed({
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
        repositoryUrl: snapshot.runRequest.repositoryUrl,
        runRequest: snapshot.runRequest.task,
        createdAt: now(),
        terminal: { status: "cancelled", cancellation },
      };
      yield* bucket.put(artifactKey, JSON.stringify(artifact), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      }).pipe(
        Effect.mapError((cause) => new ControlPlaneOperationFailed({
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

    const failUnstartedWorkflow = Effect.fn("ControlWorker.failUnstartedWorkflow")(function* (
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
      const url = new URL(request.originalUrl, "https://control.internal");
      if (request.method === "POST" && url.pathname === "/repository-tasks") {
        return yield* request.json.pipe(
          Effect.flatMap(createRepositoryTask),
          Effect.flatMap((result) => HttpServerResponse.json(result, { status: 202 })),
        );
      }
      if (request.method === "POST" && url.pathname === "/repository-tasks/status") {
        return yield* request.json.pipe(
          Effect.flatMap(getRepositoryTask),
          Effect.flatMap(HttpServerResponse.json),
        );
      }
      if (request.method === "POST" && url.pathname === "/repository-tasks/result") {
        return yield* request.json.pipe(
          Effect.flatMap(getRunArtifact),
          Effect.flatMap(HttpServerResponse.json),
        );
      }
      if (request.method === "POST" && url.pathname === "/repository-tasks/cancel") {
        return yield* request.json.pipe(
          Effect.flatMap(cancelRepositoryRun),
          Effect.flatMap(HttpServerResponse.json),
        );
      }
      return HttpServerResponse.text("Polyphemus control service", { status: 404 });
    });

    return {
      cancelRepositoryRun,
      createRepositoryTask,
      fetch: route.pipe(
        Effect.catchTags({
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
          ControlPlaneOperationFailed: (error) => HttpServerResponse.json({
            error: error._tag,
            message: error.message,
          }, { status: 500 }),
        }),
        Effect.catch((error) => HttpServerResponse.json({
          error: errorCode(error),
          message: errorMessage(error),
        }, { status: 500 })),
        Effect.catchDefect((cause) => HttpServerResponse.json({
          error: "ControlPlaneDefect",
          message: "The Repository Task control plane failed unexpectedly",
        }, { status: 500 })),
      ),
      getRepositoryTask,
      getRunArtifact,
    };
  }).pipe(
    Effect.provide(Cloudflare.Workers.FetchBinding),
    Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
  ),
) {}
