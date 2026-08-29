import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  addAgentRun,
  attachWorkflow,
  cancelRun,
  completeRun,
  createRepositoryTaskSnapshot,
  failPullRequestPublication,
  failRun,
  requestRunCancellation,
  retryPullRequestPublication,
  startPullRequestPublication,
  RepositoryTaskNotFound,
  type RepositoryTaskSnapshot,
  type RunArtifact,
} from "../src/domain/repository-task.ts";
import type { RepositoryTaskIndexEntry } from "../src/domain/repository-task-index.ts";
import {
  makeRepositoryAgent,
  type RepositoryAgentPorts,
} from "../src/RepositoryAgent.ts";
import { RepositoryAgentBackendFailed } from "../src/RepositoryAgentError.ts";
import { RunAdmissionRejected } from "../src/RunAdmissionCoordinator.ts";

const NOW = "2026-07-29T12:00:00.000Z";

const makeFixture = (options: {
  readonly failWorkflowStart?: boolean;
  readonly failSandboxCancel?: boolean;
  readonly rejectAdmission?: boolean;
} = {}) => {
  let snapshot: RepositoryTaskSnapshot | null = null;
  const index = new Map<string, RepositoryTaskIndexEntry>();
  const artifacts = new Map<string, RunArtifact>();
  const publicationWorkflowInputs: unknown[] = [];
  const ids = ["task-id", "run-id", "sandbox-id", "next-run", "next-sandbox"];

  const ports: RepositoryAgentPorts = {
    acquireRunAdmission: () => options.rejectAdmission
      ? Effect.fail(new RunAdmissionRejected({
          message: "Daily Agent Run limit reached",
          retryAfterSeconds: 60,
        }))
      : Effect.void,
    releaseRunAdmission: () => Effect.void,
    createTask: (input) => {
      snapshot = createRepositoryTaskSnapshot(input);
      return Effect.succeed(snapshot);
    },
    addAgentRun: (input) => {
      if (snapshot === null) return Effect.fail(new RepositoryTaskNotFound({ message: "missing" }));
      snapshot = addAgentRun(snapshot, input);
      return Effect.succeed(snapshot);
    },
    attachWorkflow: (input) => {
      if (snapshot === null) return Effect.fail(new RepositoryTaskNotFound({ message: "missing" }));
      snapshot = attachWorkflow(snapshot, input.runId, input.workflowId, input.now);
      return Effect.succeed(snapshot);
    },
    getSnapshot: () => Effect.succeed(snapshot),
    upsertIndex: (entry) => Effect.sync(() => { index.set(entry.taskId, entry); }),
    requireOwner: (ownerId, taskId) => index.get(taskId)?.ownerId === ownerId
      ? Effect.void
      : Effect.fail(new RepositoryTaskNotFound({ message: "Repository Task was not found" })),
    listIndex: (ownerId) => Effect.succeed(
      [...index.values()].filter((entry) => entry.ownerId === ownerId),
    ),
    retryPublication: (input) => {
      if (snapshot === null) return Effect.fail(new RepositoryTaskNotFound({ message: "missing" }));
      snapshot = retryPullRequestPublication(snapshot, input);
      return Effect.succeed(snapshot);
    },
    startPublicationWorkflow: (input) => Effect.sync(() => {
      publicationWorkflowInputs.push(input);
      return { id: `${input.publicationId}-attempt-${input.attempt}` };
    }),
    startWorkflow: (input) => options.failWorkflowStart
      ? Effect.fail(new RepositoryAgentBackendFailed({
          operation: "start-workflow",
          message: "Could not start the Workflow",
        }))
      : Effect.succeed({ id: input.runId }),
    terminateWorkflow: () => Effect.void,
    cancelSandbox: (input) => options.failSandboxCancel
      ? Effect.fail(new RepositoryAgentBackendFailed({
          operation: "cancel-sandbox-run",
          message: "Could not cancel the Sandbox Agent Run",
        }))
      : Effect.succeed({
          ...input,
          status: "cancelled" as const,
          events: [],
          cleanup: "destroyed" as const,
        }),
    readArtifact: (key) => Effect.succeed(artifacts.get(key) ?? null),
    writeArtifact: (key, artifact) => Effect.sync(() => { artifacts.set(key, artifact); }),
    requestCancellation: (input) => {
      if (snapshot === null) return Effect.fail(new RepositoryTaskNotFound({ message: "missing" }));
      snapshot = requestRunCancellation(snapshot, input.runId, input.now);
      return Effect.succeed(snapshot);
    },
    cancelRun: (input) => {
      if (snapshot === null) return Effect.fail(new RepositoryTaskNotFound({ message: "missing" }));
      snapshot = cancelRun(
        snapshot,
        input.runId,
        input.artifactKey,
        input.cancellation,
        input.now,
      );
      return Effect.succeed(snapshot);
    },
    failRun: (input) => {
      if (snapshot === null) return Effect.fail(new RepositoryTaskNotFound({ message: "missing" }));
      snapshot = failRun(
        snapshot,
        input.runId,
        input.artifactKey,
        input.failure,
        input.cleanup,
        input.now,
      );
      return Effect.succeed(snapshot);
    },
    now: () => NOW,
    randomUUID: () => ids.shift() ?? "fallback-id",
  };

  return {
    agent: makeRepositoryAgent(ports),
    artifacts,
    publicationWorkflowInputs,
    failPublication(handle: { readonly taskId: string; readonly runId: string }) {
      if (snapshot === null) throw new Error("missing snapshot");
      const artifactKey = `repository-tasks/${handle.taskId}/agent-runs/${handle.runId}/completed.json`;
      snapshot = completeRun(
        { ...snapshot, agentRuns: snapshot.agentRuns.map((run) =>
          run.runId === handle.runId ? { ...run, baseSha: "a".repeat(40) } : run) },
        handle.runId,
        artifactKey,
        true,
        true,
        "destroyed",
        NOW,
      );
      snapshot = startPullRequestPublication(snapshot, {
        ...handle,
        publicationId: `publication-${handle.runId}`,
        attempt: 1,
        patchArtifactKey: artifactKey,
        baseSha: "a".repeat(40),
        branch: `polyphemus/${handle.taskId}`,
        now: NOW,
      });
      snapshot = failPullRequestPublication(
        snapshot,
        handle.runId,
        `publication-${handle.runId}`,
        1,
        `repository-tasks/${handle.taskId}/agent-runs/${handle.runId}/pull-request-publication.json`,
        {
          code: "PublicationFailed",
          message: "GitHub rejected the operation",
          operation: "create-blob",
          retryable: false,
          statusCode: 403,
        },
        NOW,
      );
    },
    get snapshot() { return snapshot; },
  };
};

describe("RepositoryAgent application service", () => {
  test("creates, indexes, and starts a Repository Task without an HTTP adapter", async () => {
    const fixture = makeFixture();
    const handle = await Effect.runPromise(fixture.agent.createRepositoryTask({
      repositoryUrl: "https://github.com/example/repository.git",
      task: "Fix one bounded defect",
    }, { userId: "Developer@Example.com" }));

    expect(handle).toEqual({ taskId: "task-task-id", runId: "run-run-id" });
    expect(fixture.snapshot?.ownerId).toBe("developer@example.com");
    expect(fixture.snapshot?.runRequest.repositoryUrl).toBe("https://github.com/example/repository");
    expect(fixture.snapshot?.agentRuns[0]?.workflowId).toBe("run-run-id");
  });

  test("rejects work before creating a task when the owner quota is exhausted", async () => {
    const fixture = makeFixture({ rejectAdmission: true });
    const failure = await Effect.runPromise(fixture.agent.createRepositoryTask({
      repositoryUrl: "https://github.com/example/repository",
      task: "Fix one bounded defect",
    }, { userId: "owner@example.com" }).pipe(
      Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
    ));

    expect(failure?._tag).toBe("RunAdmissionRejected");
    expect(fixture.snapshot).toBeNull();
  });

  test("hides another principal's Repository Task", async () => {
    const fixture = makeFixture();
    const handle = await Effect.runPromise(fixture.agent.createRepositoryTask({
      repositoryUrl: "https://github.com/example/repository",
      task: "Fix one bounded defect",
    }, { userId: "owner@example.com" }));

    const failure = await Effect.runPromise(
      fixture.agent.getRepositoryTask(handle, { userId: "other@example.com" }).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );
    expect(failure?._tag).toBe("RepositoryTaskNotFound");
  });

  test("persists a cancellation artifact through application ports", async () => {
    const fixture = makeFixture();
    const handle = await Effect.runPromise(fixture.agent.createRepositoryTask({
      repositoryUrl: "https://github.com/example/repository",
      task: "Fix one bounded defect",
    }, { userId: "owner@example.com" }));

    const cancelled = await Effect.runPromise(
      fixture.agent.cancelRepositoryRun(handle, { userId: "owner@example.com" }),
    );
    expect(cancelled.agentRuns[0]?.stage).toBe("cancelled");
    expect([...fixture.artifacts.keys()]).toEqual([
      `repository-tasks/${handle.taskId}/agent-runs/${handle.runId}/cancelled.json`,
    ]);
  });

  test("terminalizes cancellation while preserving a failed cleanup claim", async () => {
    const fixture = makeFixture({ failSandboxCancel: true });
    const handle = await Effect.runPromise(fixture.agent.createRepositoryTask({
      repositoryUrl: "https://github.com/example/repository",
      task: "Fix one bounded defect",
    }, { userId: "owner@example.com" }));

    const cancelled = await Effect.runPromise(
      fixture.agent.cancelRepositoryRun(handle, { userId: "owner@example.com" }),
    );
    expect(cancelled.agentRuns[0]).toMatchObject({
      stage: "cancelled",
      cleanup: "failed",
    });
    const artifact = fixture.artifacts.get(
      `repository-tasks/${handle.taskId}/agent-runs/${handle.runId}/cancelled.json`,
    );
    expect(artifact?.terminal).toMatchObject({
      status: "cancelled",
      cancellation: { cleanup: "failed" },
    });
  });

  test("retries publication from the existing authorized Validated Patch", async () => {
    const fixture = makeFixture();
    const handle = await Effect.runPromise(fixture.agent.createRepositoryTask({
      repositoryUrl: "https://github.com/example/repository",
      task: "Fix one bounded defect",
    }, { userId: "owner@example.com" }));
    fixture.failPublication(handle);

    const retried = await Effect.runPromise(
      fixture.agent.retryPullRequestPublication(handle, { userId: "owner@example.com" }),
    );
    expect(retried.agentRuns[0]?.publication).toMatchObject({
      attempt: 2,
      status: "pending",
      failure: null,
    });
    expect(fixture.publicationWorkflowInputs).toHaveLength(1);
    expect(fixture.publicationWorkflowInputs[0]).toMatchObject({
      taskId: handle.taskId,
      runId: handle.runId,
      publicationId: `publication-${handle.runId}`,
      attempt: 2,
    });
  });

  test("records a safe terminal result if Workflow creation fails", async () => {
    const fixture = makeFixture({ failWorkflowStart: true });
    const failure = await Effect.runPromise(
      fixture.agent.createRepositoryTask({
        repositoryUrl: "https://github.com/example/repository",
        task: "Fix one bounded defect",
      }, { userId: "owner@example.com" }).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );

    expect(failure?._tag).toBe("RepositoryAgentBackendFailed");
    expect(fixture.snapshot?.agentRuns[0]?.stage).toBe("failed");
    expect([...fixture.artifacts.keys()][0]).toEndWith("/failed.json");
  });
});
