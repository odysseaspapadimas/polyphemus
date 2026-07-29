import * as Cloudflare from "alchemy/Cloudflare";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { RunArtifactsBucket } from "./RunArtifactsBucket.ts";
import { PullRequestPublicationWorkflowV4 } from "./PullRequestPublicationWorkflow.ts";
import { SandboxRuntimeWorker } from "./SandboxRuntimeWorker.ts";
import {
  decodeWorkflowInput,
  type RepositoryRunWorkflowResult,
  type RepositoryTaskStage,
  type RunArtifact,
  type SafeRunFailure,
} from "./domain/repository-task.ts";
import type { PiActivityEvent, SandboxCancelResult, SandboxProcessStatusResult } from "./domain/sandbox-run.ts";
import { makeRepositoryAgentClient } from "./domain/repository-agent-client.ts";
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

/** Capture transport defects as data so Workflow cleanup cannot mask the boundary failure. */
const captureCause = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Outcome<A>, never, R> => effect.pipe(
  Effect.matchCause({
    onFailure: (cause): Outcome<A> => ({
      ok: false,
      message: safeMessage(Cause.squash(cause)),
    }),
    onSuccess: (value): Outcome<A> => ({ ok: true, value }),
  }),
);

const completedArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/completed.json`;
const failedArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/failed.json`;

const makeRepositoryRunWorkflow = Effect.gen(function* () {
  const taskCoordinators = yield* RepositoryTaskCoordinator;
  const publicationWorkflow = yield* PullRequestPublicationWorkflowV4;
  const bucket = yield* Cloudflare.R2.ReadWriteBucket(RunArtifactsBucket);
  const sandboxRuntimeResource = yield* SandboxRuntimeWorker;
  const fetchSandboxRuntime = yield* Cloudflare.Workers.Fetch(sandboxRuntimeResource);
  const sandboxToken = yield* Config.redacted("SANDBOX_API_TOKEN").pipe(Effect.orDie);
  const sandboxClient = makeRepositoryAgentClient(fetchSandboxRuntime, sandboxToken);

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
          capture(sandboxClient.cancel(processHandle)),
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
            Effect.as({ recorded: true as const }),
            Effect.orDie,
          ),
          {
            retries: { limit: 3, delay: "2 seconds", backoff: "exponential" },
            timeout: "2 minutes",
          },
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
      }).pipe(Effect.as({ recorded: true as const }), Effect.orDie),
    );

    const started = yield* Cloudflare.Workflows.task(
      "start-sandbox-agent",
      capture(sandboxClient.start({
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
      }).pipe(Effect.as({ recorded: true as const }), Effect.orDie),
    );

    let lastStatus: SandboxProcessStatusResult | null = null;
    for (let poll = 0; poll < MAX_STATUS_POLLS; poll += 1) {
      const observed = yield* Cloudflare.Workflows.task(
        `observe-agent-${String(poll + 1).padStart(3, "0")}`,
        capture(sandboxClient.status(processHandle)),
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
        }).pipe(Effect.as({ recorded: true as const }), Effect.orDie),
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
      }).pipe(Effect.as({ recorded: true as const }), Effect.orDie),
    );

    const finalized = yield* Cloudflare.Workflows.task(
      "finalize-and-validate-run",
      capture(sandboxClient.finalize(processHandle)),
    );
    if (!finalized.ok) {
      return yield* persistFailure("validating", finalized.message, lastStatus.events);
    }

    const artifactKey = completedArtifactKey(input.taskId, input.runId);
    const publicationEligible = finalized.value.validated &&
      finalized.value.patch.trim().length > 0 && finalized.value.changedFiles.length > 0;
    const completionNow = new Date().toISOString();
    const publicationId = `publication-${input.runId}`;
    const publicationBranch = `polyphemus/${input.taskId}`;
    const artifact: RunArtifact = {
      version: 1,
      taskId: input.taskId,
      runId: input.runId,
      repositoryUrl: input.runRequest.repositoryUrl,
      runRequest: input.runRequest.task,
      createdAt: completionNow,
      terminal: { status: "completed", result: finalized.value },
    };
    const completionOutcome = yield* Cloudflare.Workflows.task(
      "persist-completed-run-result",
      captureCause(Effect.gen(function* () {
        const active = yield* coordinator.runIsActive(handle);
        const snapshot = active
          ? yield* Effect.gen(function* () {
              yield* bucket.put(artifactKey, JSON.stringify(artifact), {
                httpMetadata: { contentType: "application/json; charset=utf-8" },
              });
              return yield* coordinator.complete({
                ...handle,
                artifactKey,
                validated: finalized.value.validated,
                publicationEligible,
                cleanup: finalized.value.cleanup,
                now: completionNow,
              });
            })
          : yield* coordinator.getSnapshot();
        const completedRun = snapshot?.agentRuns.find((run) => run.runId === input.runId);
        const publication = completedRun?.publication;
        return {
          completed: completedRun?.artifactKey === artifactKey,
          publicationReady: publication?.publicationId === publicationId &&
            publication.patchArtifactKey === artifactKey &&
            publication.baseSha === finalized.value.baseSha &&
            publication.branch === publicationBranch,
          publicationCreatedAt: publication?.createdAt ?? null,
        };
      })),
      {
        retries: { limit: 3, delay: "2 seconds", backoff: "exponential" },
        timeout: "2 minutes",
      },
    );
    if (!completionOutcome.ok) {
      return {
        status: "failed",
        taskId: input.taskId,
        runId: input.runId,
        artifactKey,
        message: `Run completion boundary failed: ${completionOutcome.message}`,
      };
    }
    const completion = completionOutcome.value;
    if (!completion.completed) {
      return { status: "cancelled", taskId: input.taskId, runId: input.runId };
    }

    if (publicationEligible) {
      const publicationInput = {
        taskId: input.taskId,
        runId: input.runId,
        publicationId,
        patchArtifactKey: artifactKey,
        baseSha: finalized.value.baseSha,
        branch: publicationBranch,
        now: completion.publicationCreatedAt ?? completionNow,
      };
      // Coordinator completion records this intent atomically with the
      // terminal Run Result, closing the rerun/publication launch gap.
      const publicationStateStarted = completion.publicationReady;
      const publicationWorkflowStarted = publicationStateStarted &&
        (yield* Cloudflare.Workflows.task(
          "start-pull-request-publication",
          publicationWorkflow.create({
            id: publicationId,
            params: publicationInput,
            retention: { successRetention: "30 days", errorRetention: "30 days" },
          }).pipe(
            Effect.catchDefect(() => publicationWorkflow.get(publicationId).pipe(
              Effect.flatMap((existing) => existing.status().pipe(
                Effect.flatMap((status) => status.status === "errored" || status.status === "terminated"
                  ? existing.restart().pipe(Effect.as(existing))
                  : ["queued", "running", "paused", "complete", "waiting", "waitingForPause"]
                      .includes(status.status)
                    ? Effect.succeed(existing)
                    : Effect.die("Pull Request Publication Workflow status is unavailable")),
              )),
            )),
            Effect.as({ started: true as const }),
          ),
          {
            retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
            timeout: "2 minutes",
          },
        ).pipe(
          Effect.as(true),
          Effect.catchDefect(() => Effect.succeed(false)),
        ));
      // A launch response can be ambiguous. Keep the atomic intent pending;
      // Repository Agent reads create/recover the same deterministic Workflow
      // rather than terminalizing a Workflow that may already be running.
      void publicationWorkflowStarted;
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

/** Versioned resource: new Agent Runs must execute the latest immutable Workflow code. */
export class RepositoryRunWorkflowV2 extends Cloudflare.Workflow<RepositoryRunWorkflowV2>()(
  "RepositoryRunWorkflowV2",
  makeRepositoryRunWorkflow,
) {}

/** V3 supplies explicit timeout values for every retry-configured checkpoint. */
export class RepositoryRunWorkflowV3 extends Cloudflare.Workflow<RepositoryRunWorkflowV3>()(
  "RepositoryRunWorkflowV3",
  makeRepositoryRunWorkflow,
) {}

/** V4 launches the commit-timestamp-safe publication Workflow. */
export class RepositoryRunWorkflowV4 extends Cloudflare.Workflow<RepositoryRunWorkflowV4>()(
  "RepositoryRunWorkflowV4",
  makeRepositoryRunWorkflow,
) {}
