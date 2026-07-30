import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import {
  decodeAccessIdentity,
  type ProductIdentity,
} from "./domain/product-identity.ts";
import { parsePublicGithubRepository } from "./domain/repository-policy.ts";
import {
  decodeRepositoryRunHandle,
  decodeRepositoryRunRequest,
  decodeRunArtifact,
  decodeStartAdditionalRunRequest,
  InvalidRepositoryTaskData,
  RepositoryTaskConflict,
  RepositoryTaskNotFound,
  type AddAgentRunInput,
  type RepositoryRunHandle,
  type RepositoryRunRequest,
  type RepositoryTaskSnapshot,
  type RunArtifact,
  type SafeRunFailure,
  type StartAdditionalRunRequest,
} from "./domain/repository-task.ts";
import {
  RepositoryTaskIndexFailed,
  type RepositoryTaskIndexEntry,
} from "./domain/repository-task-index.ts";
import type { SandboxCancelResult } from "./domain/sandbox-run.ts";
import { RepositoryAgentBackendFailed } from "./RepositoryAgentError.ts";

export type RepositoryAgentApplicationError =
  | import("./domain/product-identity.ts").InvalidProductIdentity
  | InvalidRepositoryTaskData
  | RepositoryTaskConflict
  | RepositoryTaskNotFound
  | RepositoryTaskIndexFailed
  | RepositoryAgentBackendFailed;

export interface RepositoryAgentPorts<R = never> {
  readonly createTask: (
    input: AddAgentRunInput,
  ) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
  readonly addAgentRun: (
    input: AddAgentRunInput,
  ) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
  readonly attachWorkflow: (input: {
    readonly taskId: string;
    readonly runId: string;
    readonly workflowId: string;
    readonly now: string;
  }) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
  readonly getSnapshot: (
    taskId: string,
  ) => Effect.Effect<RepositoryTaskSnapshot | null, RepositoryAgentApplicationError, R>;
  readonly upsertIndex: (
    entry: RepositoryTaskIndexEntry,
  ) => Effect.Effect<void, RepositoryAgentApplicationError, R>;
  readonly requireOwner: (
    ownerId: string,
    taskId: string,
  ) => Effect.Effect<void, RepositoryAgentApplicationError, R>;
  readonly listIndex: (
    ownerId: string,
  ) => Effect.Effect<readonly RepositoryTaskIndexEntry[], RepositoryAgentApplicationError, R>;
  readonly startWorkflow: (
    input: AddAgentRunInput,
  ) => Effect.Effect<{ readonly id: string }, RepositoryAgentBackendFailed, R>;
  readonly terminateWorkflow: (
    workflowId: string,
  ) => Effect.Effect<void, never, R>;
  readonly cancelSandbox: (input: {
    readonly sandboxId: string;
    readonly processId: string;
  }) => Effect.Effect<SandboxCancelResult, RepositoryAgentBackendFailed, R>;
  readonly readArtifact: (
    key: string,
  ) => Effect.Effect<unknown | null, RepositoryAgentBackendFailed, R>;
  readonly writeArtifact: (
    key: string,
    artifact: RunArtifact,
  ) => Effect.Effect<void, RepositoryAgentBackendFailed, R>;
  readonly requestCancellation: (input: {
    readonly taskId: string;
    readonly runId: string;
    readonly now: string;
  }) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
  readonly cancelRun: (input: {
    readonly taskId: string;
    readonly runId: string;
    readonly artifactKey: string;
    readonly cancellation: SandboxCancelResult;
    readonly now: string;
  }) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
  readonly failRun: (input: {
    readonly taskId: string;
    readonly runId: string;
    readonly artifactKey: string;
    readonly failure: SafeRunFailure;
    readonly cleanup: "destroyed" | "failed" | null;
    readonly now: string;
  }) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
  readonly now?: () => string;
  readonly randomUUID?: () => string;
}

export interface RepositoryAgentService<R = never> {
  readonly createRepositoryTask: (
    request: unknown,
    identity: ProductIdentity,
  ) => Effect.Effect<RepositoryRunHandle, RepositoryAgentApplicationError, R>;
  readonly startAdditionalRepositoryRun: (
    request: unknown,
    identity: ProductIdentity,
  ) => Effect.Effect<RepositoryRunHandle, RepositoryAgentApplicationError, R>;
  readonly listRepositoryTasks: (
    identity: ProductIdentity,
  ) => Effect.Effect<readonly RepositoryTaskSnapshot[], RepositoryAgentApplicationError, R>;
  readonly getRepositoryTask: (
    handle: unknown,
    identity: ProductIdentity,
  ) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
  readonly getRunArtifact: (
    handle: unknown,
    identity: ProductIdentity,
  ) => Effect.Effect<RunArtifact, RepositoryAgentApplicationError, R>;
  readonly cancelRepositoryRun: (
    handle: unknown,
    identity: ProductIdentity,
  ) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
  readonly authorizeRepositoryTask: (
    taskId: string,
    identity: ProductIdentity,
  ) => Effect.Effect<RepositoryTaskSnapshot, RepositoryAgentApplicationError, R>;
}

export class RepositoryAgent extends Context.Service<RepositoryAgent, RepositoryAgentService>()(
  "Polyphemus/RepositoryAgent",
) {}

const cancelledArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/cancelled.json`;
const failedArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/failed.json`;

const findRun = (snapshot: RepositoryTaskSnapshot, runId: string) =>
  snapshot.agentRuns.find((run) => run.runId === runId);

export const makeRepositoryAgent = <R>(
  ports: RepositoryAgentPorts<R>,
): RepositoryAgentService<R> => {
  const now = ports.now ?? (() => new Date().toISOString());
  const randomUUID = ports.randomUUID ?? (() => crypto.randomUUID());

  const requireIdentity = (identity: ProductIdentity) =>
    decodeAccessIdentity(identity.userId);

  const normalizeRunRequest = (runRequest: RepositoryRunRequest) =>
    parsePublicGithubRepository(runRequest.repositoryUrl).pipe(
      Effect.map((repository): RepositoryRunRequest => ({
        ...runRequest,
        repositoryUrl: repository.canonicalUrl,
      })),
      Effect.mapError((error) => new InvalidRepositoryTaskData({
        message: error.message,
      })),
    );

  const makeRunInput = (
    taskId: string,
    ownerId: string,
    runRequest: RepositoryRunRequest,
  ): AddAgentRunInput => {
    const runId = `run-${randomUUID()}`;
    const sandboxId = `sandbox-${randomUUID()}`;
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

  const failUnstartedWorkflow = Effect.fn("RepositoryAgent.failUnstartedWorkflow")(function* (
    input: AddAgentRunInput,
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
    yield* ports.writeArtifact(artifactKey, artifact);
    yield* ports.failRun({
      taskId: input.taskId,
      runId: input.runId,
      artifactKey,
      failure,
      cleanup: null,
      now: now(),
    });
  });

  const startRunWorkflow = Effect.fn("RepositoryAgent.startRunWorkflow")(function* (
    input: AddAgentRunInput,
  ) {
    const instance = yield* ports.startWorkflow(input).pipe(
      Effect.tapError((error) => failUnstartedWorkflow(input, error.message).pipe(
        Effect.catch(() => Effect.void),
        Effect.catchDefect(() => Effect.void),
      )),
    );
    yield* ports.attachWorkflow({
      taskId: input.taskId,
      runId: input.runId,
      workflowId: instance.id,
      now: now(),
    });
    return { taskId: input.taskId, runId: input.runId } satisfies RepositoryRunHandle;
  });

  const authorizeRepositoryTask = Effect.fn("RepositoryAgent.authorizeRepositoryTask")(function* (
    taskId: string,
    unknownIdentity: ProductIdentity,
  ) {
    const identity = yield* requireIdentity(unknownIdentity);
    yield* ports.requireOwner(identity.userId, taskId);
    const snapshot = yield* ports.getSnapshot(taskId);
    if (snapshot === null ||
        (snapshot.ownerId !== undefined && snapshot.ownerId !== identity.userId)) {
      return yield* Effect.fail(new RepositoryTaskNotFound({
        message: "Repository Task was not found",
      }));
    }
    return snapshot;
  });

  const getRepositoryTask = Effect.fn("RepositoryAgent.getRepositoryTask")(function* (
    unknownHandle: unknown,
    unknownIdentity: ProductIdentity,
  ) {
    const handle = yield* decodeRepositoryRunHandle(unknownHandle);
    const snapshot = yield* authorizeRepositoryTask(handle.taskId, unknownIdentity);
    if (findRun(snapshot, handle.runId) === undefined) {
      return yield* Effect.fail(new RepositoryTaskNotFound({
        message: "Repository Task was not found",
      }));
    }
    return snapshot;
  });

  const createRepositoryTask = Effect.fn("RepositoryAgent.createRepositoryTask")(function* (
    unknownRequest: unknown,
    unknownIdentity: ProductIdentity,
  ) {
    const identity = yield* requireIdentity(unknownIdentity);
    const decodedRequest = yield* decodeRepositoryRunRequest(unknownRequest);
    const runRequest = yield* normalizeRunRequest(decodedRequest);
    const taskId = `task-${randomUUID()}`;
    const input = makeRunInput(taskId, identity.userId, runRequest);
    yield* ports.createTask(input);
    yield* ports.upsertIndex({
      taskId,
      ownerId: identity.userId,
      repositoryUrl: runRequest.repositoryUrl,
      objective: runRequest.task,
      createdAt: input.now,
      updatedAt: input.now,
    });
    return yield* startRunWorkflow(input);
  });

  const startAdditionalRepositoryRun = Effect.fn("RepositoryAgent.startAdditionalRepositoryRun")(function* (
    unknownRequest: unknown,
    unknownIdentity: ProductIdentity,
  ) {
    const identity = yield* requireIdentity(unknownIdentity);
    const request: StartAdditionalRunRequest = yield* decodeStartAdditionalRunRequest(unknownRequest);
    yield* ports.requireOwner(identity.userId, request.taskId);
    const runRequest = yield* normalizeRunRequest(request.runRequest);
    const snapshot = yield* ports.getSnapshot(request.taskId);
    if (snapshot === null) {
      return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" }));
    }
    const input = makeRunInput(request.taskId, identity.userId, runRequest);
    yield* ports.addAgentRun(input);
    yield* ports.upsertIndex({
      taskId: request.taskId,
      ownerId: identity.userId,
      repositoryUrl: runRequest.repositoryUrl,
      objective: runRequest.task,
      createdAt: snapshot.createdAt,
      updatedAt: input.now,
    });
    return yield* startRunWorkflow(input);
  });

  const listRepositoryTasks = Effect.fn("RepositoryAgent.listRepositoryTasks")(function* (
    unknownIdentity: ProductIdentity,
  ) {
    const identity = yield* requireIdentity(unknownIdentity);
    const rows = yield* ports.listIndex(identity.userId);
    const snapshots = yield* Effect.forEach(
      rows,
      (row) => ports.getSnapshot(row.taskId),
      { concurrency: 5 },
    );
    return snapshots.filter((snapshot): snapshot is RepositoryTaskSnapshot =>
      snapshot !== null &&
      (snapshot.ownerId === undefined || snapshot.ownerId === identity.userId));
  });

  const getRunArtifact = Effect.fn("RepositoryAgent.getRunArtifact")(function* (
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
    const value = yield* ports.readArtifact(run.artifactKey);
    if (value === null) {
      return yield* Effect.fail(new RepositoryTaskNotFound({ message: "Run Result was not found" }));
    }
    const artifact = yield* decodeRunArtifact(value);
    if (artifact.taskId !== handle.taskId || artifact.runId !== handle.runId) {
      return yield* Effect.fail(new InvalidRepositoryTaskData({
        message: "Stored Run Result does not match the selected Agent Run",
      }));
    }
    return artifact;
  });

  const cancelRepositoryRun = Effect.fn("RepositoryAgent.cancelRepositoryRun")(function* (
    unknownHandle: unknown,
    identity: ProductIdentity,
  ) {
    const handle = yield* decodeRepositoryRunHandle(unknownHandle);
    const snapshot = yield* getRepositoryTask(handle, identity);
    const run = findRun(snapshot, handle.runId)!;
    if (run.stage === "complete" || run.stage === "failed" || run.stage === "cancelled") {
      return snapshot;
    }

    yield* ports.requestCancellation({ ...handle, now: now() });
    if (run.workflowId !== null) yield* ports.terminateWorkflow(run.workflowId);

    const cancellationInput = {
      sandboxId: run.sandboxId,
      processId: run.processId,
    };
    const cleanupFailed: SandboxCancelResult = {
      ...cancellationInput,
      status: "cancelled",
      events: [],
      cleanup: "failed",
    };
    // A failed cleanup must remain visible, but it must not leave the
    // authoritative Repository Task permanently stuck in `cancelling`.
    const cancellation = yield* ports.cancelSandbox(cancellationInput).pipe(
      Effect.catch(() => Effect.succeed(cleanupFailed)),
      Effect.catchDefect(() => Effect.succeed(cleanupFailed)),
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
    yield* ports.writeArtifact(artifactKey, artifact);
    return yield* ports.cancelRun({
      ...handle,
      artifactKey,
      cancellation,
      now: now(),
    });
  });

  return {
    authorizeRepositoryTask,
    cancelRepositoryRun,
    createRepositoryTask,
    getRepositoryTask,
    getRunArtifact,
    listRepositoryTasks,
    startAdditionalRepositoryRun,
  };
};
