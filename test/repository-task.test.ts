import { describe, expect, test } from "bun:test";
import {
  addAgentRun,
  cancelRun,
  completeRun,
  createRepositoryTaskSnapshot,
  failRun,
  isActiveRun,
  markRunStage,
  recordRunProgress,
  requestRunCancellation,
} from "../src/domain/repository-task.ts";

const created = createRepositoryTaskSnapshot({
  taskId: "task-1",
  ownerId: "developer@example.com",
  runId: "run-1",
  sandboxId: "sandbox-run-1",
  processId: "pi-sandbox-run-1",
  runRequest: {
    repositoryUrl: "https://github.com/example/repository",
    task: "Fix one bounded defect",
  },
  now: "2026-07-28T10:00:00.000Z",
});

describe("Repository Task transitions", () => {
  test("creates one active Agent Run and advances friendly progress", () => {
    expect(created.activeRunId).toBe("run-1");
    expect(isActiveRun(created, "run-1")).toBe(true);

    const provisioning = markRunStage(
      created,
      "run-1",
      "provisioning",
      "Provisioning the Sandbox",
      "2026-07-28T10:00:01.000Z",
    );
    const progressing = recordRunProgress(provisioning, "run-1", {
      sandboxId: "sandbox-run-1",
      processId: "pi-sandbox-run-1",
      status: "running",
      stderrExcerpt: "",
      events: [{
        type: "pi.activity",
        stage: "modifying",
        label: "Updating the parser",
        timestamp: "2026-07-28T10:00:02.000Z",
      }],
    }, "2026-07-28T10:00:02.000Z");

    expect(progressing.agentRuns[0]?.stage).toBe("modifying");
    expect(progressing.agentRuns[0]?.activity).toBe("Updating the parser");
  });

  test("appends a fresh Agent Run while preserving terminal history", () => {
    const completed = completeRun(
      created,
      "run-1",
      "repository-tasks/task-1/agent-runs/run-1/completed.json",
      true,
      "destroyed",
      "2026-07-28T10:01:00.000Z",
    );
    const rerun = addAgentRun(completed, {
      taskId: "task-1",
      ownerId: "developer@example.com",
      runId: "run-2",
      sandboxId: "sandbox-run-2",
      processId: "pi-sandbox-run-2",
      runRequest: {
        repositoryUrl: "https://github.com/example/repository",
        task: "Retry with a narrower parser fix",
      },
      now: "2026-07-28T10:02:00.000Z",
    });

    expect(rerun.agentRuns).toHaveLength(2);
    expect(rerun.agentRuns[0]?.artifactKey).toEndWith("completed.json");
    expect(rerun.agentRuns[1]?.runRequest?.task).toBe("Retry with a narrower parser fix");
    expect(rerun.activeRunId).toBe("run-2");
  });

  test("does not complete a Run after cancellation begins", () => {
    const cancelling = requestRunCancellation(
      created,
      "run-1",
      "2026-07-28T10:00:03.000Z",
    );
    const attemptedCompletion = completeRun(
      cancelling,
      "run-1",
      "repository-tasks/task-1/agent-runs/run-1/completed.json",
      true,
      "destroyed",
      "2026-07-28T10:00:04.000Z",
    );

    const attemptedFailure = failRun(
      cancelling,
      "run-1",
      "repository-tasks/task-1/agent-runs/run-1/failed.json",
      { code: "LateFailure", message: "A late Workflow step failed", stage: "modifying" },
      "destroyed",
      "2026-07-28T10:00:04.000Z",
    );

    expect(attemptedCompletion.agentRuns[0]?.stage).toBe("cancelling");
    expect(attemptedCompletion.agentRuns[0]?.artifactKey).toBeNull();
    expect(attemptedFailure.agentRuns[0]?.stage).toBe("cancelling");
    expect(attemptedFailure.agentRuns[0]?.artifactKey).toBeNull();
  });

  test("records one terminal cancellation and clears the active Run", () => {
    const cancelled = cancelRun(
      requestRunCancellation(created, "run-1", "2026-07-28T10:00:03.000Z"),
      "run-1",
      "repository-tasks/task-1/agent-runs/run-1/cancelled.json",
      {
        sandboxId: "sandbox-run-1",
        processId: "pi-sandbox-run-1",
        status: "cancelled",
        events: [],
        cleanup: "destroyed",
      },
      "2026-07-28T10:00:04.000Z",
    );

    expect(cancelled.activeRunId).toBeNull();
    expect(cancelled.agentRuns[0]?.stage).toBe("cancelled");
    expect(cancelled.agentRuns[0]?.cleanup).toBe("destroyed");
  });
});
