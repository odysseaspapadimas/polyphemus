import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  addAgentRun,
  attachWorkflow,
  cancelRun,
  createRepositoryTaskSnapshot,
  failRun,
  requestRunCancellation,
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

const NOW = "2026-07-29T12:00:00.000Z";

const makeFixture = (options: {
  readonly failWorkflowStart?: boolean;
  readonly failSandboxCancel?: boolean;
} = {}) => {
  let snapshot: RepositoryTaskSnapshot | null = null;
  const index = new Map<string, RepositoryTaskIndexEntry>();
  const artifacts = new Map<string, RunArtifact>();
  const ids = ["task-id", "run-id", "sandbox-id", "next-run", "next-sandbox"];

  const ports: RepositoryAgentPorts = {
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
