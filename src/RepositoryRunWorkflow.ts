import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { RunArtifactsBucket } from "./RunArtifactsBucket.ts";
import { SpikeWorker } from "./SpikeWorker.ts";
import {
  decodeWorkflowInput,
  type RepositoryRunWorkflowResult,
  type RepositoryTaskStage,
  type RunArtifact,
  type SafeRunFailure,
} from "./domain/repository-task.ts";
import type { PiActivityEvent, SpikeCancelResult, SpikeStatusResult } from "./domain/spike.ts";
import { makeSpikeWorkerClient } from "./domain/spike-client.ts";
import RepositoryTaskCoordinator from "./RepositoryTaskCoordinator.ts";

const MAX_STATUS_POLLS = 110;
const STATUS_POLL_INTERVAL = "5 seconds";

type Outcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly message: string };

const safeMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "Repository agent operation failed";

const capture = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<Outcome<A>, never, R> =>
  effect.pipe(Effect.match({
    onFailure: (error): Outcome<A> => ({ ok: false, message: safeMessage(error) }),
    onSuccess: (value): Outcome<A> => ({ ok: true, value }),
  }));

const completedArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/completed.json`;
const failedArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/failed.json`;

const makeRepositoryRunWorkflow = Effect.gen(function* () {
  const taskCoordinators = yield* RepositoryTaskCoordinator;
  const bucket = yield* Cloudflare.R2.ReadWriteBucket(RunArtifactsBucket);
  const spikeResource = yield* SpikeWorker;
  const fetchSpike = yield* Cloudflare.Workers.Fetch(spikeResource);
  const spikeToken = yield* Config.redacted("SPIKE_API_TOKEN");
  const spike = makeSpikeWorkerClient(fetchSpike, spikeToken);

  return Effect.fn("RepositoryRunWorkflow.run")(function* (unknownInput: unknown) {
    const input = yield* decodeWorkflowInput(unknownInput).pipe(Effect.orDie);
    const coordinator = taskCoordinators.getByName(input.taskId);
    const handle = { taskId: input.taskId, runId: input.runId };
    const processHandle = { sandboxId: input.sandboxId, processId: input.processId };

    const persistFailure = (
      stage: RepositoryTaskStage,
      message: string,
      events: readonly PiActivityEvent[],
    ): Effect.Effect<RepositoryRunWorkflowResult, never, Cloudflare.WorkflowServices> =>
      Effect.gen(function* () {
        const cancellation = yield* Cloudflare.Workflows.task(
          "cleanup-failed-agent-run",
          capture(spike.cancel(processHandle)),
        );
        const cleanup = cancellation.ok ? cancellation.value.cleanup : null;
        const safeEvents = cancellation.ok ? cancellation.value.events : events;
        const failure: SafeRunFailure = {
          code: "AgentRunFailed",
          message,
          stage,
        };
        const artifactKey = failedArtifactKey(input.taskId, input.runId);
        const artifact: RunArtifact = {
          version: 1,
          taskId: input.taskId,
          runId: input.runId,
          repositoryUrl: input.runRequest.repositoryUrl,
          runRequest: input.runRequest.task,
          createdAt: new Date().toISOString(),
          terminal: {
            status: "failed",
            failure,
            events: safeEvents,
            cleanup,
          },
        };
        yield* Cloudflare.Workflows.task(
          "persist-failed-run-result",
          bucket.put(artifactKey, JSON.stringify(artifact), {
            httpMetadata: { contentType: "application/json; charset=utf-8" },
          }).pipe(
            Effect.flatMap(() => coordinator.fail({
              ...handle,
              artifactKey,
              failure,
              cleanup,
              now: new Date().toISOString(),
            })),
            Effect.orDie,
          ),
          { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" } },
        );
        return {
          status: "failed",
          taskId: input.taskId,
          runId: input.runId,
          artifactKey,
          message,
        };
      });

    yield* Cloudflare.Workflows.task(
      "mark-run-provisioning",
      coordinator.markStage({
        ...handle,
        stage: "provisioning",
        activity: "Provisioning the Sandbox and cloning the repository",
        now: new Date().toISOString(),
      }).pipe(Effect.orDie),
    );

    const started = yield* Cloudflare.Workflows.task(
      "start-sandbox-agent",
      capture(spike.start({
        sandboxId: input.sandboxId,
        repositoryUrl: input.runRequest.repositoryUrl,
        task: input.runRequest.task,
      })),
    );
    if (!started.ok) {
      return yield* persistFailure("provisioning", started.message, []);
    }

    yield* Cloudflare.Workflows.task(
      "record-agent-started",
      coordinator.recordStarted({
        ...handle,
        started: started.value,
        now: new Date().toISOString(),
      }).pipe(Effect.orDie),
    );

    let lastStatus: SpikeStatusResult | null = null;
    for (let poll = 0; poll < MAX_STATUS_POLLS; poll += 1) {
      const observed = yield* Cloudflare.Workflows.task(
        `observe-agent-${String(poll + 1).padStart(3, "0")}`,
        capture(spike.status(processHandle)),
      );
      if (!observed.ok) {
        return yield* persistFailure(
          lastStatus === null ? "investigating" : "modifying",
          observed.message,
          lastStatus?.events ?? [],
        );
      }
      lastStatus = observed.value;
      yield* Cloudflare.Workflows.task(
        `record-agent-progress-${String(poll + 1).padStart(3, "0")}`,
        coordinator.recordProgress({
          ...handle,
          status: observed.value,
          now: new Date().toISOString(),
        }).pipe(Effect.orDie),
      );
      if (observed.value.status !== "starting" && observed.value.status !== "running") break;
      yield* Cloudflare.Workflows.sleep(
        `wait-for-agent-${String(poll + 1).padStart(3, "0")}`,
        STATUS_POLL_INTERVAL,
      );
    }

    if (lastStatus === null || lastStatus.status === "starting" || lastStatus.status === "running") {
      return yield* persistFailure(
        "modifying",
        "Agent Run exceeded its Workflow observation budget",
        lastStatus?.events ?? [],
      );
    }
    if (lastStatus.status !== "completed") {
      return yield* persistFailure(
        "modifying",
        `Repository agent process ended with status ${lastStatus.status}`,
        lastStatus.events,
      );
    }

    yield* Cloudflare.Workflows.task(
      "mark-run-validating",
      coordinator.markStage({
        ...handle,
        stage: "validating",
        activity: "Running independent validation",
        now: new Date().toISOString(),
      }).pipe(Effect.orDie),
    );

    const finalized = yield* Cloudflare.Workflows.task(
      "finalize-and-validate-run",
      capture(spike.finalize(processHandle)),
    );
    if (!finalized.ok) {
      return yield* persistFailure("validating", finalized.message, lastStatus.events);
    }

    const artifactKey = completedArtifactKey(input.taskId, input.runId);
    const artifact: RunArtifact = {
      version: 1,
      taskId: input.taskId,
      runId: input.runId,
      repositoryUrl: input.runRequest.repositoryUrl,
      runRequest: input.runRequest.task,
      createdAt: new Date().toISOString(),
      terminal: { status: "completed", result: finalized.value },
    };
    const completion = yield* Cloudflare.Workflows.task(
      "persist-completed-run-result",
      Effect.gen(function* () {
        const active = yield* coordinator.runIsActive(handle);
        if (!active) return yield* coordinator.getSnapshot();
        yield* bucket.put(artifactKey, JSON.stringify(artifact), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        return yield* coordinator.complete({
          ...handle,
          artifactKey,
          validated: finalized.value.validated,
          cleanup: finalized.value.cleanup,
          now: new Date().toISOString(),
        });
      }).pipe(Effect.orDie),
      { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" } },
    );

    const completedRun = completion?.agentRuns.find((run) => run.runId === input.runId);
    if (completedRun?.artifactKey !== artifactKey) {
      return { status: "cancelled", taskId: input.taskId, runId: input.runId };
    }
    return {
      status: "complete",
      taskId: input.taskId,
      runId: input.runId,
      artifactKey,
    };
  });
}).pipe(
  Effect.provide(Cloudflare.Workers.FetchBinding),
  Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
);

export default class RepositoryRunWorkflow extends Cloudflare.Workflow<RepositoryRunWorkflow>()(
  "RepositoryRunWorkflow",
  makeRepositoryRunWorkflow,
) {}
