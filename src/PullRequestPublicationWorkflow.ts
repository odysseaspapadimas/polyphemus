import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import {
  decodePullRequestPublicationArtifact,
  decodePullRequestPublicationWorkflowInput,
  type PullRequestPublicationArtifact,
  type PullRequestPublicationEvidence,
  type PullRequestPublicationFailure,
  type PullRequestPublicationWorkflowInput,
  type PullRequestPublicationWorkflowResult,
  type RepositoryPublicationRequest,
} from "./domain/pull-request-publication.ts";
import { decodeRunArtifact } from "./domain/repository-task.ts";
import {
  makeGitHubPublicationPort,
  makeRepositoryPublisher,
  RepositoryPublicationFailed,
} from "./RepositoryPublisher.ts";
import RepositoryTaskCoordinator from "./RepositoryTaskCoordinator.ts";
import { RunArtifactsBucket } from "./RunArtifactsBucket.ts";

const MAX_PUBLICATION_ATTEMPTS = 3;
const TRANSITION_RETRIES = {
  retries: { limit: 10, delay: "2 seconds", backoff: "exponential" },
  // Alchemy currently forwards an explicit `timeout: undefined` for a
  // retry-only config, which Cloudflare Workflows rejects at runtime.
  timeout: "2 minutes",
} as const;
const STORAGE_RETRIES = {
  retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
  timeout: "2 minutes",
} as const;

type Outcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly failure: PullRequestPublicationFailure };

const publicationArtifactKey = (taskId: string, runId: string): string =>
  `repository-tasks/${taskId}/agent-runs/${runId}/pull-request-publication.json`;

const infrastructureFailure = (
  operation: string,
  message: string,
  retryable = true,
): RepositoryPublicationFailed => new RepositoryPublicationFailed({
  code: retryable ? "GitHubUnavailable" : "PublicationFailed",
  operation,
  message,
  retryable,
});

const capture = <A, R>(
  effect: Effect.Effect<A, RepositoryPublicationFailed, R>,
): Effect.Effect<Outcome<A>, never, R> => effect.pipe(
  Effect.catchDefect(() => Effect.fail(infrastructureFailure(
    "publish-draft-pull-request",
    "Pull Request Publication failed unexpectedly",
    false,
  ))),
  Effect.match({
    onFailure: (error): Outcome<A> => ({ ok: false, failure: error.toFailure() }),
    onSuccess: (value): Outcome<A> => ({ ok: true, value }),
  }),
);

const captureAs = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  failure: RepositoryPublicationFailed,
): Effect.Effect<Outcome<A>, never, R> => effect.pipe(
  Effect.mapError(() => failure),
  Effect.catchDefect(() => Effect.fail(failure)),
  Effect.match({
    onFailure: (error): Outcome<A> => ({ ok: false, failure: error.toFailure() }),
    onSuccess: (value): Outcome<A> => ({ ok: true, value }),
  }),
);

const durableCapture = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
  failure: RepositoryPublicationFailed,
  options: typeof TRANSITION_RETRIES | typeof STORAGE_RETRIES,
) => captureAs(
  // Persist only a small clone-safe checkpoint. Coordinator snapshots can be
  // recovered authoritatively and R2 writes otherwise resolve to void.
  Cloudflare.Workflows.task(
    name,
    effect.pipe(Effect.as({ recorded: true as const }), Effect.orDie),
    options,
  ),
  failure,
);

const makePullRequestPublicationWorkflow = Effect.gen(function* () {
  const coordinators = yield* RepositoryTaskCoordinator;
  const bucket = yield* Cloudflare.R2.ReadWriteBucket(RunArtifactsBucket);
  const githubToken = yield* Config.redacted("GITHUB_TOKEN").pipe(Effect.orDie);
  const publisher = makeRepositoryPublisher(makeGitHubPublicationPort(githubToken));

  const readPublicationRequest = (
    input: PullRequestPublicationWorkflowInput,
  ): Effect.Effect<RepositoryPublicationRequest, RepositoryPublicationFailed, Cloudflare.WorkflowServices> =>
    Effect.gen(function* () {
      const coordinator = coordinators.getByName(input.taskId);
      const snapshot = yield* coordinator.getSnapshot().pipe(
        Effect.mapError(() => infrastructureFailure(
          "read-publication-state",
          "Could not read the authoritative Pull Request Publication state",
        )),
        Effect.catchDefect(() => Effect.fail(infrastructureFailure(
          "read-publication-state",
          "Could not read the authoritative Pull Request Publication state",
        ))),
      );
      const runIndex = snapshot?.agentRuns.findIndex((run) => run.runId === input.runId) ?? -1;
      const selectedRun = runIndex < 0 ? undefined : snapshot?.agentRuns[runIndex];
      if (snapshot === null || snapshot.taskId !== input.taskId || selectedRun === undefined ||
          selectedRun.publication?.publicationId !== input.publicationId ||
          selectedRun.publication.patchArtifactKey !== input.patchArtifactKey ||
          selectedRun.publication.baseSha !== input.baseSha ||
          selectedRun.publication.branch !== input.branch ||
          input.publicationId !== `publication-${input.runId}` ||
          input.branch !== `polyphemus/${input.taskId}`) {
        return yield* Effect.fail(infrastructureFailure(
          "verify-publication-state",
          "Pull Request Publication does not match the authoritative Repository Task",
          false,
        ));
      }

      const expectedPrefix = `repository-tasks/${input.taskId}/agent-runs/${input.runId}/`;
      if (!input.patchArtifactKey.startsWith(expectedPrefix) || input.patchArtifactKey.includes("..")) {
        return yield* Effect.fail(infrastructureFailure(
          "read-validated-patch",
          "Validated Patch pointer is invalid",
          false,
        ));
      }
      const object = yield* bucket.get(input.patchArtifactKey).pipe(
        Effect.mapError(() => infrastructureFailure(
          "read-validated-patch",
          "Could not read the persisted Validated Patch",
        )),
      );
      if (object === null) {
        return yield* Effect.fail(infrastructureFailure(
          "read-validated-patch",
          "Persisted Validated Patch was not found",
          false,
        ));
      }
      const unknownArtifact = yield* object.json<unknown>().pipe(
        Effect.mapError(() => infrastructureFailure(
          "decode-validated-patch",
          "Persisted Run Result returned invalid JSON",
          false,
        )),
      );
      const artifact = yield* decodeRunArtifact(unknownArtifact).pipe(
        Effect.mapError(() => infrastructureFailure(
          "decode-validated-patch",
          "Persisted Run Result is invalid",
          false,
        )),
      );
      if (artifact.taskId !== input.taskId || artifact.runId !== input.runId ||
          artifact.terminal.status !== "completed") {
        return yield* Effect.fail(new RepositoryPublicationFailed({
          code: "PatchNotValidated",
          operation: "verify-validated-patch",
          message: "Only the selected completed Run Result can be published",
          retryable: false,
        }));
      }
      const result = artifact.terminal.result;
      if (!result.validated) {
        return yield* Effect.fail(new RepositoryPublicationFailed({
          code: "PatchNotValidated",
          operation: "verify-validated-patch",
          message: "Run Result does not contain a Validated Patch",
          retryable: false,
        }));
      }
      if (result.patch.trim().length === 0 || result.changedFiles.length === 0) {
        return yield* Effect.fail(new RepositoryPublicationFailed({
          code: "EmptyPatch",
          operation: "verify-validated-patch",
          message: "Validated Patch is empty",
          retryable: false,
        }));
      }
      if (result.baseSha !== input.baseSha) {
        return yield* Effect.fail(new RepositoryPublicationFailed({
          code: "BaseConflict",
          operation: "verify-validated-patch",
          message: "Validated Patch base does not match the recorded Agent Run base",
          retryable: false,
        }));
      }

      const previousPublication = snapshot.agentRuns
        .slice(0, runIndex)
        .reverse()
        .find((run) => run.publication?.status === "complete" &&
          run.publication.evidence !== null)
        ?.publication?.evidence ?? null;
      return {
        taskId: input.taskId,
        runId: input.runId,
        publicationId: input.publicationId,
        repositoryUrl: artifact.repositoryUrl,
        objective: artifact.runRequest,
        baseSha: input.baseSha,
        patch: result.patch,
        changedFiles: result.changedFiles,
        artifactCreatedAt: artifact.createdAt,
        previousPublication,
      };
    });

  const persistArtifact = (
    key: string,
    artifact: PullRequestPublicationArtifact,
  ): Effect.Effect<void, RepositoryPublicationFailed, Cloudflare.WorkflowServices> =>
    Effect.gen(function* () {
      const serialized = JSON.stringify(artifact);
      const stored = yield* bucket.put(key, serialized, {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        onlyIf: { etagDoesNotMatch: "*" },
      }).pipe(
        Effect.mapError(() => infrastructureFailure(
          "persist-publication-evidence",
          "Could not persist Pull Request Publication evidence",
        )),
      );
      if (stored !== null) return;

      // A lost response may replay this step. R2 remains immutable: only the
      // exact already-decoded artifact is accepted as idempotent recovery.
      const existingObject = yield* bucket.get(key).pipe(
        Effect.mapError(() => infrastructureFailure(
          "recover-publication-evidence",
          "Could not recover existing Pull Request Publication evidence",
        )),
      );
      if (existingObject === null) {
        return yield* Effect.fail(infrastructureFailure(
          "persist-publication-evidence",
          "Pull Request Publication evidence could not be stored",
        ));
      }
      const unknownExisting = yield* existingObject.json<unknown>().pipe(
        Effect.mapError(() => infrastructureFailure(
          "recover-publication-evidence",
          "Existing Pull Request Publication evidence is invalid",
          false,
        )),
      );
      const existing = yield* decodePullRequestPublicationArtifact(unknownExisting).pipe(
        Effect.mapError(() => infrastructureFailure(
          "recover-publication-evidence",
          "Existing Pull Request Publication evidence is invalid",
          false,
        )),
      );
      if (JSON.stringify(existing) !== serialized) {
        return yield* Effect.fail(infrastructureFailure(
          "persist-publication-evidence",
          "Immutable Pull Request Publication evidence already contains a different result",
          false,
        ));
      }
    });

  return Effect.fn("PullRequestPublicationWorkflow.run")(function* (unknownInput: unknown) {
    const input = yield* decodePullRequestPublicationWorkflowInput(unknownInput).pipe(Effect.orDie);
    const coordinator = coordinators.getByName(input.taskId);
    const handle = {
      taskId: input.taskId,
      runId: input.runId,
      publicationId: input.publicationId,
    };
    const key = publicationArtifactKey(input.taskId, input.runId);

    const failTerminally = (
      failure: PullRequestPublicationFailure,
      existingArtifactKey: string | null = null,
    ): Effect.Effect<PullRequestPublicationWorkflowResult, never, Cloudflare.WorkflowServices> =>
      Effect.gen(function* () {
        let persistedKey = existingArtifactKey;
        if (persistedKey === null) {
          const failedArtifact: PullRequestPublicationArtifact = {
            version: 1,
            taskId: input.taskId,
            runId: input.runId,
            publicationId: input.publicationId,
            patchArtifactKey: input.patchArtifactKey,
            baseSha: input.baseSha,
            createdAt: input.now,
            terminal: { status: "failed", failure },
          };
          const persisted = yield* durableCapture(
            "persist-failed-publication-evidence",
            persistArtifact(key, failedArtifact),
            infrastructureFailure(
              "persist-failed-publication-evidence",
              "Could not persist terminal Pull Request Publication failure evidence",
            ),
            STORAGE_RETRIES,
          );
          persistedKey = persisted.ok ? key : null;
        }

        const transitionFailure = infrastructureFailure(
          "record-publication-failure",
          "Could not record the terminal Pull Request Publication failure",
        );
        let transitioned = yield* durableCapture(
          "fail-pull-request-publication",
          coordinator.failPublication({
            ...handle,
            publicationArtifactKey: persistedKey,
            failure,
            now: new Date().toISOString(),
          }),
          transitionFailure,
          TRANSITION_RETRIES,
        );
        if (!transitioned.ok) {
          transitioned = yield* durableCapture(
            "reconcile-failed-pull-request-publication",
            coordinator.failPublication({
              ...handle,
              publicationArtifactKey: persistedKey,
              failure,
              now: new Date().toISOString(),
            }),
            transitionFailure,
            TRANSITION_RETRIES,
          );
        }
        return {
          status: "failed",
          ...handle,
          publicationArtifactKey: persistedKey,
          // Preserve the terminal publication cause in Workflow output so a
          // later authoritative read can reconcile even if the coordinator
          // was temporarily unavailable.
          failure,
        } satisfies PullRequestPublicationWorkflowResult;
      });

    const preparing = yield* durableCapture(
      "mark-publication-preparing",
      coordinator.markPublication({
        ...handle,
        status: "preparing",
        activity: "Preparing the persisted Validated Patch for GitHub",
        now: new Date().toISOString(),
      }),
      infrastructureFailure(
        "mark-publication-preparing",
        "Could not record Pull Request Publication preparation",
      ),
      TRANSITION_RETRIES,
    );
    if (!preparing.ok) return yield* failTerminally(preparing.failure);

    const prepared = yield* Cloudflare.Workflows.task(
      "read-validated-patch",
      capture(readPublicationRequest(input)),
      STORAGE_RETRIES,
    );
    if (!prepared.ok) return yield* failTerminally(prepared.failure);

    let outcome: Outcome<PullRequestPublicationEvidence> = {
      ok: false,
      failure: {
        code: "PublicationFailed",
        operation: "publish-draft-pull-request",
        message: "Pull Request Publication was not attempted",
        retryable: false,
      },
    };
    for (let attempt = 1; attempt <= MAX_PUBLICATION_ATTEMPTS; attempt += 1) {
      const marked = yield* durableCapture(
        `mark-publication-attempt-${String(attempt).padStart(2, "0")}`,
        coordinator.markPublication({
          ...handle,
          status: "publishing",
          activity: attempt === 1
            ? "Creating or recovering the Agent Branch and draft pull request"
            : "Recovering the idempotent GitHub publication",
          now: new Date().toISOString(),
        }),
        infrastructureFailure(
          "mark-publication-attempt",
          "Could not record Pull Request Publication progress",
        ),
        TRANSITION_RETRIES,
      );
      if (!marked.ok) return yield* failTerminally(marked.failure);

      outcome = yield* Cloudflare.Workflows.task(
        `publish-draft-pull-request-${String(attempt).padStart(2, "0")}`,
        capture(publisher.publish(prepared.value)),
      );
      if (outcome.ok || !outcome.failure.retryable || attempt === MAX_PUBLICATION_ATTEMPTS) break;
      yield* Cloudflare.Workflows.sleep(
        `wait-before-publication-retry-${String(attempt).padStart(2, "0")}`,
        `${2 ** attempt} seconds`,
      );
    }
    if (!outcome.ok) return yield* failTerminally(outcome.failure);

    const artifact: PullRequestPublicationArtifact = {
      version: 1,
      taskId: input.taskId,
      runId: input.runId,
      publicationId: input.publicationId,
      patchArtifactKey: input.patchArtifactKey,
      baseSha: input.baseSha,
      createdAt: input.now,
      terminal: { status: "complete", evidence: outcome.value },
    };
    const persisted = yield* durableCapture(
      "persist-completed-publication-evidence",
      persistArtifact(key, artifact),
      infrastructureFailure(
        "persist-completed-publication-evidence",
        "Could not persist completed Pull Request Publication evidence",
      ),
      STORAGE_RETRIES,
    );
    if (!persisted.ok) {
      // GitHub's decoded response already proved the selected draft PR. Treat
      // an ambiguous R2 write as completion requiring reconciliation, never as
      // a failure that could contradict a successfully written complete object.
      return {
        status: "complete",
        ...handle,
        publicationArtifactKey: key,
        evidence: outcome.value,
      } satisfies PullRequestPublicationWorkflowResult;
    }

    const completionFailure = infrastructureFailure(
      "record-publication-completion",
      "Draft pull request was published, but its terminal state could not be reconciled",
    );
    let completed = yield* durableCapture(
      "complete-pull-request-publication",
      coordinator.completePublication({
        ...handle,
        publicationArtifactKey: key,
        evidence: outcome.value,
        now: new Date().toISOString(),
      }),
      completionFailure,
      TRANSITION_RETRIES,
    );
    if (!completed.ok) {
      completed = yield* durableCapture(
        "reconcile-completed-pull-request-publication",
        coordinator.completePublication({
          ...handle,
          publicationArtifactKey: key,
          evidence: outcome.value,
          now: new Date().toISOString(),
        }),
        completionFailure,
        TRANSITION_RETRIES,
      );
    }
    // The immutable complete artifact is authoritative. If the coordinator
    // remains unavailable, finish with a complete output; Repository Agent
    // reads reconcile that artifact into the coordinator later. Never point a
    // failed snapshot at a complete artifact.
    return {
      status: "complete",
      ...handle,
      publicationArtifactKey: key,
      evidence: outcome.value,
    } satisfies PullRequestPublicationWorkflowResult;
  });
}).pipe(Effect.provide(Cloudflare.R2.ReadWriteBucketBinding));

export default class PullRequestPublicationWorkflow extends Cloudflare.Workflow<PullRequestPublicationWorkflow>()(
  "PullRequestPublicationWorkflow",
  makePullRequestPublicationWorkflow,
) {}
