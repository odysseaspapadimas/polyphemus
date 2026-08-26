import type { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  CancelRepositoryRunCommandSchema,
  type CancelRepositoryRunCommand,
  type CancelRepositoryRunResult,
  CreateRepositoryTaskCommandSchema,
  type CreateRepositoryTaskCommand,
  type CreateRepositoryTaskResult,
  GetRepositoryTaskCommandSchema,
  type GetRepositoryTaskCommand,
  type GetRepositoryTaskResult,
  GetRunArtifactCommandSchema,
  type GetRunArtifactCommand,
  type GetRunArtifactResult,
  InvalidRepositoryAgentRpcData,
  ListRepositoryTasksCommandSchema,
  type ListRepositoryTasksCommand,
  type ListRepositoryTasksResult,
  type RepositoryAgentFailure,
  StartAdditionalRepositoryRunCommandSchema,
  type StartAdditionalRepositoryRunCommand,
  type StartAdditionalRepositoryRunResult,
  decodeRepositoryAgentRpc,
} from "./domain/repository-agent-rpc.ts";
import { RepositoryTaskIdSchema } from "./domain/repository-task-live.ts";
import {
  PullRequestPublicationArtifactSchema,
  PullRequestPublicationWorkflowResultSchema,
  type PullRequestPublicationFailure,
} from "./domain/pull-request-publication.ts";
import { decodeAccessIdentity } from "./domain/product-identity.ts";
import {
  decodeRunArtifact,
  InvalidRepositoryTaskData,
  RepositoryTaskNotFound,
  type AddAgentRunInput,
  type RepositoryTaskSnapshot,
  type RunArtifact,
} from "./domain/repository-task.ts";
import {
  decodeRepositoryTaskIndexEntries,
  RepositoryTaskIndexFailed,
  type RepositoryTaskIndexEntry,
} from "./domain/repository-task-index.ts";
import { makeRepositoryAgentClient } from "./domain/repository-agent-client.ts";
import {
  makeRepositoryAgent,
  type RepositoryAgentApplicationError,
  type RepositoryAgentPorts,
} from "./RepositoryAgent.ts";
import { RepositoryAgentBackendFailed } from "./RepositoryAgentError.ts";
import PullRequestPublicationWorkflow from "./PullRequestPublicationWorkflow.ts";
import RepositoryRunWorkflow from "./RepositoryRunWorkflow.ts";
import RepositoryTaskCoordinator from "./RepositoryTaskCoordinator.ts";
import { RepositoryTaskIndexDatabase } from "./RepositoryTaskIndexDatabase.ts";
import { RunArtifactsBucket } from "./RunArtifactsBucket.ts";
import { SandboxRuntimeWorker } from "./SandboxRuntimeWorker.ts";

const AuthorizedTaskRowSchema = Schema.Struct({ taskId: RepositoryTaskIdSchema });

export type RepositoryAgentBackendShape = Cloudflare.WorkerShape & {
  readonly createRepositoryTask: (
    command: CreateRepositoryTaskCommand,
  ) => Effect.Effect<CreateRepositoryTaskResult, never, RuntimeContext>;
  readonly startAdditionalRepositoryRun: (
    command: StartAdditionalRepositoryRunCommand,
  ) => Effect.Effect<StartAdditionalRepositoryRunResult, never, RuntimeContext>;
  readonly listRepositoryTasks: (
    command: ListRepositoryTasksCommand,
  ) => Effect.Effect<ListRepositoryTasksResult, never, RuntimeContext>;
  readonly getRepositoryTask: (
    command: GetRepositoryTaskCommand,
  ) => Effect.Effect<GetRepositoryTaskResult, never, RuntimeContext>;
  readonly getRunArtifact: (
    command: GetRunArtifactCommand,
  ) => Effect.Effect<GetRunArtifactResult, never, RuntimeContext>;
  readonly cancelRepositoryRun: (
    command: CancelRepositoryRunCommand,
  ) => Effect.Effect<CancelRepositoryRunResult, never, RuntimeContext>;
};

/** Lightweight Worker identifier imported by the Website for typed RPC. */
export class RepositoryAgentBackend extends Cloudflare.Worker<
  RepositoryAgentBackend,
  RepositoryAgentBackendShape,
  | RepositoryTaskCoordinator
  | RepositoryRunWorkflow
  | PullRequestPublicationWorkflow
>()("RepositoryAgentBackend") {}

const rpcInputError = (error: InvalidRepositoryAgentRpcData): InvalidRepositoryTaskData =>
  new InvalidRepositoryTaskData({ message: error.message });

const failureFrom = (error: RepositoryAgentApplicationError): RepositoryAgentFailure => ({
  _tag: error._tag,
  message: error.message,
  ...(error instanceof RepositoryAgentBackendFailed || error instanceof RepositoryTaskIndexFailed
    ? { operation: error.operation }
    : {}),
});

const envelope = <A, R>(effect: Effect.Effect<A, RepositoryAgentApplicationError, R>) =>
  effect.pipe(Effect.match({
    onFailure: (error) => ({ ok: false as const, error: failureFrom(error) }),
    onSuccess: (value) => ({ ok: true as const, value }),
  }));

export const RepositoryAgentBackendLive = RepositoryAgentBackend.make(
  {
    name: "polyphemus-repository-agent",
    main: import.meta.url,
    url: false,
    compatibility: { date: "2026-07-11", flags: ["nodejs_compat"] },
    observability: { enabled: true, logs: { enabled: true, invocationLogs: true } },
    env: { SandboxRuntimeWorker },
  },
  Effect.gen(function* () {
    // These logical IDs are unchanged so the existing coordinator namespace,
    // Workflow, D1 projection, and R2 artifacts remain authoritative.
    const coordinators = yield* RepositoryTaskCoordinator;
    const publicationWorkflow = yield* PullRequestPublicationWorkflow;
    const workflow = yield* RepositoryRunWorkflow;
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(RunArtifactsBucket);
    const indexDatabaseResource = yield* RepositoryTaskIndexDatabase;
    const indexDatabase = yield* Cloudflare.D1.QueryDatabase(indexDatabaseResource);
    const sandboxRuntimeResource = yield* SandboxRuntimeWorker;
    const fetchSandboxRuntime = yield* Cloudflare.Workers.Fetch(sandboxRuntimeResource);
    const sandboxToken = yield* Config.redacted("SANDBOX_API_TOKEN").pipe(Effect.orDie);
    const sandboxClient = makeRepositoryAgentClient(fetchSandboxRuntime, sandboxToken);

    const rawSnapshot = (taskId: string) => coordinators.getByName(taskId).getSnapshot();

    /** Repair a terminal Agent Run transition from its immutable R2 evidence. */
    const reconcileRuns = Effect.fn("RepositoryAgentBackend.reconcileRuns")(
      function* (taskId: string) {
        const initial = yield* rawSnapshot(taskId);
        if (initial === null || initial.activeRunId === null) return initial;
        const run = initial.agentRuns.find((candidate) =>
          candidate.runId === initial.activeRunId);
        if (run === undefined) return initial;
        const runRequest = run.runRequest ?? initial.runRequest;
        const terminalKeys = [
          `repository-tasks/${taskId}/agent-runs/${run.runId}/completed.json`,
          `repository-tasks/${taskId}/agent-runs/${run.runId}/failed.json`,
          `repository-tasks/${taskId}/agent-runs/${run.runId}/cancelled.json`,
        ] as const;

        return yield* Effect.gen(function* () {
          const candidates: Array<{
            readonly key: string;
            readonly artifact: RunArtifact;
          }> = [];
          for (const key of terminalKeys) {
            const object = yield* bucket.get(key);
            if (object === null) continue;
            const unknownArtifact = yield* object.json<unknown>();
            const artifact = yield* decodeRunArtifact(unknownArtifact).pipe(
              Effect.match({ onFailure: () => null, onSuccess: (value) => value }),
            );
            if (artifact === null || artifact.taskId !== taskId ||
                artifact.runId !== run.runId ||
                artifact.repositoryUrl !== runRequest.repositoryUrl ||
                artifact.runRequest !== runRequest.task) continue;
            const expectedSuffix = artifact.terminal.status === "completed"
              ? "/completed.json"
              : artifact.terminal.status === "failed"
                ? "/failed.json"
                : "/cancelled.json";
            if (!key.endsWith(expectedSuffix)) continue;
            candidates.push({ key, artifact });
          }
          // Conflicting terminal evidence is never resolved by guessing.
          if (candidates.length !== 1) return initial;
          const [{ key, artifact }] = candidates;
          const coordinator = coordinators.getByName(taskId);
          if (artifact.terminal.status === "completed") {
            if (run.baseSha === null ||
                artifact.terminal.result.baseSha !== run.baseSha) return initial;
            const result = artifact.terminal.result;
            return yield* coordinator.complete({
              taskId,
              runId: run.runId,
              artifactKey: key,
              validated: result.validated,
              publicationEligible: result.validated &&
                result.patch.trim().length > 0 && result.changedFiles.length > 0,
              cleanup: result.cleanup,
              now: artifact.createdAt,
            });
          }
          if (artifact.terminal.status === "failed") {
            return yield* coordinator.fail({
              taskId,
              runId: run.runId,
              artifactKey: key,
              failure: artifact.terminal.failure,
              cleanup: artifact.terminal.cleanup,
              now: artifact.createdAt,
            });
          }
          return yield* coordinator.cancel({
            taskId,
            runId: run.runId,
            artifactKey: key,
            cancellation: artifact.terminal.cancellation,
            now: artifact.createdAt,
          });
        }).pipe(
          Effect.catch(() => Effect.succeed(initial)),
          Effect.catchDefect(() => Effect.succeed(initial)),
        );
      },
    );

    const reconcileFailure = (
      snapshot: RepositoryTaskSnapshot,
      runId: string,
      publicationId: string,
      publicationArtifactKey: string | null,
      failure: PullRequestPublicationFailure,
    ) => coordinators.getByName(snapshot.taskId).failPublication({
      taskId: snapshot.taskId,
      runId,
      publicationId,
      publicationArtifactKey,
      failure,
      now: new Date().toISOString(),
    });

    /** Repair terminal publication state from immutable R2/Workflow evidence. */
    const reconcilePublications = Effect.fn("RepositoryAgentBackend.reconcilePublications")(
      function* (taskId: string) {
        const initial = yield* rawSnapshot(taskId);
        if (initial === null) return null;
        let current = initial;

        for (const run of initial.agentRuns) {
          const publication = run.publication;
          if (publication === null || publication.status === "complete" ||
              publication.status === "failed") continue;
          const key =
            `repository-tasks/${taskId}/agent-runs/${run.runId}/pull-request-publication.json`;

          current = yield* Effect.gen(function* () {
            const object = yield* bucket.get(key);
            if (object !== null) {
              const unknownArtifact = yield* object.json<unknown>();
              const artifact = yield* Schema.decodeUnknownEffect(
                PullRequestPublicationArtifactSchema,
              )(unknownArtifact).pipe(
                Effect.match({ onFailure: () => null, onSuccess: (value) => value }),
              );
              if (artifact === null || artifact.taskId !== taskId ||
                  artifact.runId !== run.runId ||
                  artifact.publicationId !== publication.publicationId ||
                  artifact.patchArtifactKey !== publication.patchArtifactKey ||
                  artifact.baseSha !== publication.baseSha) {
                return yield* reconcileFailure(
                  current,
                  run.runId,
                  publication.publicationId,
                  null,
                  {
                    code: "PublicationFailed",
                    operation: "reconcile-publication-artifact",
                    message: "Stored Pull Request Publication evidence is invalid",
                    retryable: false,
                  },
                );
              }
              return artifact.terminal.status === "complete"
                ? yield* coordinators.getByName(taskId).completePublication({
                    taskId,
                    runId: run.runId,
                    publicationId: publication.publicationId,
                    publicationArtifactKey: key,
                    evidence: artifact.terminal.evidence,
                    now: new Date().toISOString(),
                  })
                : yield* reconcileFailure(
                    current,
                    run.runId,
                    publication.publicationId,
                    key,
                    artifact.terminal.failure,
                  );
            }

            const workflowState = yield* publicationWorkflow
              .get(publication.publicationId)
              .pipe(
                Effect.flatMap((instance) => instance.status().pipe(
                  Effect.map((status) => ({ instance, status })),
                )),
                Effect.catchDefect(() => Effect.succeed(null)),
              );
            if (workflowState === null || workflowState.status.status === "unknown") {
              // Recover a launch response loss or a publication Workflow that
              // was never created after the durable coordinator intent.
              yield* publicationWorkflow.create({
                id: publication.publicationId,
                params: {
                  taskId,
                  runId: run.runId,
                  publicationId: publication.publicationId,
                  patchArtifactKey: publication.patchArtifactKey,
                  baseSha: publication.baseSha,
                  branch: publication.branch,
                  now: publication.createdAt,
                },
                retention: { successRetention: "30 days", errorRetention: "30 days" },
              }).pipe(
                Effect.catchDefect(() => Effect.void),
              );
              return current;
            }
            if (workflowState.status.status === "complete") {
              const output = yield* Schema.decodeUnknownEffect(
                PullRequestPublicationWorkflowResultSchema,
              )(workflowState.status.output).pipe(
                Effect.match({ onFailure: () => null, onSuccess: (value) => value }),
              );
              if (output === null || output.taskId !== taskId ||
                  output.runId !== run.runId ||
                  output.publicationId !== publication.publicationId ||
                  (output.publicationArtifactKey !== null &&
                    output.publicationArtifactKey !== key)) {
                return yield* reconcileFailure(
                  current,
                  run.runId,
                  publication.publicationId,
                  null,
                  {
                    code: "PublicationFailed",
                    operation: "reconcile-publication-workflow",
                    message: "Pull Request Publication Workflow returned invalid terminal evidence",
                    retryable: false,
                  },
                );
              }
              if (output.status === "failed") {
                if (output.publicationArtifactKey === key) {
                  const recovered = yield* bucket.put(key, JSON.stringify({
                    version: 1,
                    taskId,
                    runId: run.runId,
                    publicationId: publication.publicationId,
                    patchArtifactKey: publication.patchArtifactKey,
                    baseSha: publication.baseSha,
                    createdAt: publication.createdAt,
                    terminal: { status: "failed", failure: output.failure },
                  }), {
                    httpMetadata: { contentType: "application/json; charset=utf-8" },
                    onlyIf: { etagDoesNotMatch: "*" },
                  });
                  if (recovered === null) return current;
                }
                return yield* reconcileFailure(
                  current,
                  run.runId,
                  publication.publicationId,
                  output.publicationArtifactKey,
                  output.failure,
                );
              }
              const recoveredArtifact = {
                version: 1 as const,
                taskId,
                runId: run.runId,
                publicationId: publication.publicationId,
                patchArtifactKey: publication.patchArtifactKey,
                baseSha: publication.baseSha,
                createdAt: publication.createdAt,
                terminal: { status: "complete" as const, evidence: output.evidence },
              };
              const recovered = yield* bucket.put(key, JSON.stringify(recoveredArtifact), {
                httpMetadata: { contentType: "application/json; charset=utf-8" },
                onlyIf: { etagDoesNotMatch: "*" },
              });
              if (recovered === null) return current;
              return yield* coordinators.getByName(taskId).completePublication({
                taskId,
                runId: run.runId,
                publicationId: publication.publicationId,
                publicationArtifactKey: key,
                evidence: output.evidence,
                now: new Date().toISOString(),
              });
            }
            if (workflowState.status.status === "errored" ||
                workflowState.status.status === "terminated") {
              yield* workflowState.instance.restart().pipe(
                Effect.catchDefect(() => Effect.void),
              );
              return current;
            }
            return current;
          }).pipe(
            Effect.catch(() => Effect.succeed(current)),
            Effect.catchDefect(() => Effect.succeed(current)),
          );
        }
        return current;
      },
    );

    const reconcileTask = Effect.fn("RepositoryAgentBackend.reconcileTask")(
      function* (taskId: string) {
        const runSnapshot = yield* reconcileRuns(taskId);
        return runSnapshot === null ? null : yield* reconcilePublications(taskId);
      },
    );

    const ports: RepositoryAgentPorts<RuntimeContext> = {
      createTask: (input) => coordinators.getByName(input.taskId).createTask(input),
      addAgentRun: (input) => reconcileTask(input.taskId).pipe(
        Effect.flatMap(() => coordinators.getByName(input.taskId).addAgentRun(input)),
      ),
      attachWorkflow: (input) => coordinators.getByName(input.taskId).attachWorkflow(input),
      getSnapshot: reconcileTask,
      requestCancellation: (input) =>
        coordinators.getByName(input.taskId).requestCancellation(input),
      cancelRun: (input) => coordinators.getByName(input.taskId).cancel(input),
      failRun: (input) => coordinators.getByName(input.taskId).fail(input),
      upsertIndex: (entry) => indexDatabase.prepare(
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
        Effect.asVoid,
        Effect.catchDefect((cause) => Effect.fail(
          RepositoryTaskIndexFailed.fromUnknown("upsert-index", cause),
        )),
      ),
      requireOwner: (ownerId, taskId) => Effect.gen(function* () {
        const row = yield* indexDatabase.prepare(
          "SELECT task_id AS taskId FROM repository_task_index WHERE task_id = ? AND owner_id = ?",
        ).bind(taskId, ownerId).first<unknown>().pipe(
          Effect.catchDefect((cause) => Effect.fail(
            RepositoryTaskIndexFailed.fromUnknown("authorize-task", cause),
          )),
        );
        if (row === null) {
          return yield* Effect.fail(new RepositoryTaskNotFound({
            message: "Repository Task was not found",
          }));
        }
        yield* Schema.decodeUnknownEffect(AuthorizedTaskRowSchema)(row).pipe(
          Effect.mapError((cause) =>
            RepositoryTaskIndexFailed.fromUnknown("decode-authorization-row", cause)),
        );
      }),
      listIndex: (ownerId) => indexDatabase.prepare(
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
      ).bind(ownerId).all<RepositoryTaskIndexEntry>().pipe(
        Effect.map((result) => result.results),
        Effect.catchDefect((cause) => Effect.fail(
          RepositoryTaskIndexFailed.fromUnknown("list-index", cause),
        )),
        Effect.flatMap(decodeRepositoryTaskIndexEntries),
      ),
      startWorkflow: (input: AddAgentRunInput) => workflow.create({
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
        Effect.map((instance) => ({ id: instance.id })),
      ),
      terminateWorkflow: (workflowId) => workflow.get(workflowId).pipe(
        Effect.flatMap((instance) => instance.terminate()),
        Effect.catchDefect(() => Effect.void),
      ),
      cancelSandbox: (input) => sandboxClient.cancel(input).pipe(
        Effect.mapError((cause) => new RepositoryAgentBackendFailed({
          operation: "cancel-sandbox-run",
          message: "Could not cancel the Sandbox Agent Run",
          cause,
        })),
      ),
      readArtifact: (key) => bucket.get(key).pipe(
        Effect.mapError((cause) => new RepositoryAgentBackendFailed({
          operation: "read-run-result",
          message: "Could not read the Run Result",
          cause,
        })),
        Effect.flatMap((object) => object === null
          ? Effect.succeed(null)
          : object.json<unknown>().pipe(
              Effect.mapError((cause) => new RepositoryAgentBackendFailed({
                operation: "decode-run-result-json",
                message: "Run Result storage returned invalid JSON",
                cause,
              })),
            )),
      ),
      writeArtifact: (key: string, artifact: RunArtifact) => bucket.put(
        key,
        JSON.stringify(artifact),
        { httpMetadata: { contentType: "application/json; charset=utf-8" } },
      ).pipe(
        Effect.asVoid,
        Effect.mapError((cause) => new RepositoryAgentBackendFailed({
          operation: "persist-run-result",
          message: "Could not persist the Run Result",
          cause,
        })),
      ),
    };

    const agent = makeRepositoryAgent(ports);

    const createRepositoryTask = (unknownCommand: unknown) => envelope(
      decodeRepositoryAgentRpc(
        CreateRepositoryTaskCommandSchema,
        "Invalid create Repository Task RPC command",
      )(unknownCommand).pipe(
        Effect.mapError(rpcInputError),
        Effect.flatMap((command) => agent.createRepositoryTask(command.request, command.principal)),
      ),
    );

    const startAdditionalRepositoryRun = (unknownCommand: unknown) => envelope(
      decodeRepositoryAgentRpc(
        StartAdditionalRepositoryRunCommandSchema,
        "Invalid additional Agent Run RPC command",
      )(unknownCommand).pipe(
        Effect.mapError(rpcInputError),
        Effect.flatMap((command) =>
          agent.startAdditionalRepositoryRun(command.request, command.principal)),
      ),
    );

    const listRepositoryTasks = (unknownCommand: unknown) => envelope(
      decodeRepositoryAgentRpc(
        ListRepositoryTasksCommandSchema,
        "Invalid Repository Task list RPC command",
      )(unknownCommand).pipe(
        Effect.mapError(rpcInputError),
        Effect.flatMap((command) => agent.listRepositoryTasks(command.principal)),
      ),
    );

    const getRepositoryTask = (unknownCommand: unknown) => envelope(
      decodeRepositoryAgentRpc(
        GetRepositoryTaskCommandSchema,
        "Invalid get Repository Task RPC command",
      )(unknownCommand).pipe(
        Effect.mapError(rpcInputError),
        Effect.flatMap((command) => agent.getRepositoryTask(command.handle, command.principal)),
      ),
    );

    const getRunArtifact = (unknownCommand: unknown) => envelope(
      decodeRepositoryAgentRpc(
        GetRunArtifactCommandSchema,
        "Invalid get Run Result RPC command",
      )(unknownCommand).pipe(
        Effect.mapError(rpcInputError),
        Effect.flatMap((command) => agent.getRunArtifact(command.handle, command.principal)),
      ),
    );

    const cancelRepositoryRun = (unknownCommand: unknown) => envelope(
      decodeRepositoryAgentRpc(
        CancelRepositoryRunCommandSchema,
        "Invalid cancel Agent Run RPC command",
      )(unknownCommand).pipe(
        Effect.mapError(rpcInputError),
        Effect.flatMap((command) => agent.cancelRepositoryRun(command.handle, command.principal)),
      ),
    );

    return RepositoryAgentBackend.of({
      cancelRepositoryRun,
      createRepositoryTask,
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.originalUrl, "https://repository-agent.internal");
        const match = url.pathname.match(/^\/repository-tasks\/([^/]+)\/live$/);
        if (request.method !== "GET" ||
            request.headers.upgrade?.toLowerCase() !== "websocket" ||
            match === null) {
          return HttpServerResponse.text("Not Found", { status: 404 });
        }

        const taskId = yield* Schema.decodeUnknownEffect(RepositoryTaskIdSchema)(match[1]).pipe(
          Effect.match({ onFailure: () => null, onSuccess: (value) => value }),
        );
        const identity = yield* decodeAccessIdentity(
          request.headers["x-polyphemus-user-id"],
        ).pipe(Effect.match({ onFailure: () => null, onSuccess: (value) => value }));
        if (taskId === null || identity === null) {
          return HttpServerResponse.text("Not Found", { status: 404 });
        }

        const authorized = yield* agent.authorizeRepositoryTask(taskId, identity).pipe(
          Effect.match({ onFailure: () => false, onSuccess: () => true }),
        );
        if (!authorized) {
          // Deliberately indistinguishable from an absent task.
          return HttpServerResponse.text("Not Found", { status: 404 });
        }
        return yield* coordinators.getByName(taskId).fetch(request).pipe(
          Effect.catch(() => Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 }))),
        );
      }),
      getRepositoryTask,
      getRunArtifact,
      listRepositoryTasks,
      startAdditionalRepositoryRun,
    });
  }).pipe(
    Effect.provide(Cloudflare.Workers.FetchBinding),
    Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding),
  ),
);

export default RepositoryAgentBackendLive;
