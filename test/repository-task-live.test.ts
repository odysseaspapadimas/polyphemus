import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import {
  decodeRepositoryTaskLiveServerMessage,
  persistThenBroadcast,
  snapshotLiveMessage,
} from "../src/domain/repository-task-live.ts";
import {
  createRepositoryTaskSnapshot,
  RepositoryTaskSnapshotSchema,
} from "../src/domain/repository-task.ts";
import {
  applyNewerRepositoryTaskSnapshot,
  hasRecoverableRepositoryTaskActivity,
  newerRepositoryTaskSnapshot,
} from "../src/useRepositoryTaskLive.ts";

const snapshot = createRepositoryTaskSnapshot({
  taskId: "task-1",
  ownerId: "developer@example.com",
  runId: "run-1",
  sandboxId: "sandbox-1",
  processId: "pi-sandbox-1",
  runRequest: {
    repositoryUrl: "https://github.com/example/repository",
    task: "Fix one bounded defect",
  },
  now: "2026-07-29T12:00:00.000Z",
});

describe("Repository Task live snapshots", () => {
  test("decodes historical stored snapshots with revision zero", () => {
    const { revision: _revision, ...withoutRevision } = snapshot;
    const historical = {
      ...withoutRevision,
      agentRuns: withoutRevision.agentRuns.map(({
        publication: _publication,
        publicationEligible: _publicationEligible,
        ...run
      }) => run),
    };
    const decoded = Schema.decodeUnknownSync(RepositoryTaskSnapshotSchema)(historical);
    expect(decoded.revision).toBe(0);
    expect(decoded.agentRuns[0]?.publication).toBeNull();
    expect(decoded.agentRuns[0]?.publicationEligible).toBe(false);
  });

  test("rejects live metadata that disagrees with the authoritative snapshot", async () => {
    const invalid = {
      ...snapshotLiveMessage({ ...snapshot, revision: 2 }),
      revision: 3,
    };
    const exit = await Effect.runPromiseExit(decodeRepositoryTaskLiveServerMessage(invalid));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  test("does not roll back a persisted transition when broadcast defects", async () => {
    const order: string[] = [];
    const persisted = await Effect.runPromise(persistThenBroadcast(
      Effect.sync(() => {
        order.push("persist");
        return { revision: 4 };
      }),
      () => Effect.sync(() => {
        order.push("broadcast");
        throw new Error("dead socket");
      }),
    ));
    expect(persisted.revision).toBe(4);
    expect(order).toEqual(["persist", "broadcast"]);
  });

  test("applies only newer selected-task revisions", () => {
    const revision2 = { ...snapshot, revision: 2, updatedAt: "2026-07-29T12:00:02.000Z" };
    const revision3 = { ...snapshot, revision: 3, updatedAt: "2026-07-29T12:00:03.000Z" };
    const current = applyNewerRepositoryTaskSnapshot(
      revision2,
      snapshotLiveMessage(revision3),
      snapshot.taskId,
    );
    expect(current?.revision).toBe(3);
    expect(applyNewerRepositoryTaskSnapshot(
      current,
      snapshotLiveMessage(revision2),
      snapshot.taskId,
    )).toBe(current);
    expect(applyNewerRepositoryTaskSnapshot(
      current,
      snapshotLiveMessage(revision3),
      snapshot.taskId,
    )).toBe(current);
    expect(newerRepositoryTaskSnapshot(revision3, revision2)).toBe(revision3);
  });

  test("keeps fallback activity enabled for publication after the Agent Run ends", () => {
    const publication = {
      ...snapshot,
      activeRunId: null,
      agentRuns: snapshot.agentRuns.map((run) => ({
        ...run,
        stage: "complete" as const,
        baseSha: "a".repeat(40),
        artifactKey: "repository-tasks/task-1/agent-runs/run-1/completed.json",
        validated: true,
        publication: {
          version: 1 as const,
          publicationId: "publication-run-1",
          sourceRunId: "run-1",
          patchArtifactKey: "repository-tasks/task-1/agent-runs/run-1/completed.json",
          publicationArtifactKey: null,
          baseSha: "a".repeat(40),
          branch: "polyphemus/task-1",
          status: "publishing" as const,
          activity: "Publishing",
          evidence: null,
          failure: null,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          completedAt: null,
        },
      })),
    };

    expect(hasRecoverableRepositoryTaskActivity(publication)).toBe(true);
    expect(hasRecoverableRepositoryTaskActivity({
      ...publication,
      agentRuns: publication.agentRuns.map((run) => ({
        ...run,
        publication: run.publication === null ? null : {
          ...run.publication,
          status: "failed" as const,
          completedAt: snapshot.updatedAt,
        },
      })),
    })).toBe(false);
  });
});
