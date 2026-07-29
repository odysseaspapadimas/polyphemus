import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import {
  makeGitHubPublicationPort,
  makeRepositoryPublisher,
  RepositoryPublicationFailed,
  type GitHubCommit,
  type GitHubPublicationPort,
  type GitHubPullRequest,
  type GitHubRepository,
} from "../src/RepositoryPublisher.ts";

const BASE_SHA = "a".repeat(40);
const BASE_TREE_SHA = "b".repeat(40);
const BASE_BLOB_SHA = "1".repeat(40);
const PATCH_BLOB_SHA = "c".repeat(40);
const PATCH_TREE_SHA = "d".repeat(40);
const HEAD_SHA = "e".repeat(40);
const PREVIOUS_SHA = "9".repeat(40);
const RACING_SHA = "8".repeat(40);

const upstream: GitHubRepository = {
  name: "repository",
  fullName: "upstream/repository",
  owner: "upstream",
  private: false,
  archived: false,
  defaultBranch: "main",
  writable: false,
  parentFullName: null,
};
const fork: GitHubRepository = {
  ...upstream,
  fullName: "polyphemus-agent/repository",
  owner: "polyphemus-agent",
  writable: true,
  parentFullName: upstream.fullName,
};

const request = {
  taskId: "task-1",
  runId: "run-1",
  publicationId: "publication-run-1",
  repositoryUrl: "https://github.com/upstream/repository",
  objective: "Fix one bounded defect",
  baseSha: BASE_SHA,
  patch: `diff --git a/value.txt b/value.txt
index 1111111..2222222 100644
--- a/value.txt
+++ b/value.txt
@@ -1 +1 @@
-old
+new
`,
  changedFiles: ["value.txt"],
  artifactCreatedAt: "2026-07-29T12:00:00.000Z",
  previousPublication: null,
};

const previousPublication = {
  upstreamOwner: upstream.owner,
  upstreamRepository: upstream.name,
  baseBranch: upstream.defaultBranch,
  usedFork: true,
  headOwner: fork.owner,
  headRepository: fork.name,
  branch: "polyphemus/task-1",
  headSha: PREVIOUS_SHA,
  pullRequestNumber: 7,
  pullRequestUrl: "https://github.com/upstream/repository/pull/7",
  draft: true as const,
};

const makePort = (options: {
  readonly comparison?: string;
  readonly changedBaseFiles?: readonly string[];
  readonly baseChangesAfterFirstCheck?: boolean;
  readonly existingHumanBranch?: boolean;
  readonly existingPublication?: "open" | "closed" | "ready";
  readonly failFirstPull?: boolean;
  readonly duplicatePullRace?: boolean;
  readonly wrongCreatedHead?: boolean;
} = {}) => {
  let branchHead: string | null = options.existingHumanBranch
    ? "f".repeat(40)
    : options.existingPublication === undefined ? null : PREVIOUS_SHA;
  let pull: GitHubPullRequest | null = options.existingPublication === undefined
    ? null
    : {
        number: 7,
        url: previousPublication.pullRequestUrl,
        state: options.existingPublication === "closed" ? "closed" : "open",
        draft: options.existingPublication !== "ready",
        merged: false,
        maintainerCanModify: false,
        author: "polyphemus-agent",
        headRef: previousPublication.branch,
        headSha: PREVIOUS_SHA,
        headRepository: fork.fullName,
        baseRef: upstream.defaultBranch,
      };
  const commits = new Map<string, GitHubCommit>();
  if (options.existingHumanBranch) {
    commits.set(branchHead!, {
      sha: branchHead!,
      treeSha: PATCH_TREE_SHA,
      message: "Human commit",
      parentShas: [BASE_SHA],
      authoredAt: request.artifactCreatedAt,
    });
  }
  if (options.existingPublication !== undefined) {
    commits.set(PREVIOUS_SHA, {
      sha: PREVIOUS_SHA,
      treeSha: BASE_TREE_SHA,
      message: "Previous Polyphemus publication",
      parentShas: [BASE_SHA],
      authoredAt: "2026-07-28T12:00:00.000Z",
    });
  }
  let commitCreates = 0;
  let pullCreates = 0;
  let forkEnsures = 0;
  let comparisons = 0;
  let branchUpdates = 0;
  let lastCommitParents: readonly string[] = [];

  const port: GitHubPublicationPort = {
    authenticatedLogin: () => Effect.succeed("polyphemus-agent"),
    getRepository: () => Effect.succeed(upstream),
    ensureFork: () => Effect.sync(() => { forkEnsures += 1; return fork; }),
    compareBase: () => Effect.sync(() => {
      comparisons += 1;
      return {
        status: options.comparison ?? "ahead",
        changedFiles: options.baseChangesAfterFirstCheck && comparisons > 1
          ? ["value.txt"]
          : options.changedBaseFiles ?? [],
        complete: true,
      };
    }),
    getCommit: (repository, sha) => {
      if (repository.fullName === upstream.fullName && sha === BASE_SHA) {
        return Effect.succeed({
          sha: BASE_SHA,
          treeSha: BASE_TREE_SHA,
          message: "Base",
          parentShas: [],
          authoredAt: "2026-07-28T12:00:00.000Z",
        });
      }
      const commit = commits.get(sha);
      if (commit === undefined) throw new Error(`missing fake commit ${sha}`);
      return Effect.succeed(commit);
    },
    getTree: () => Effect.succeed([{
      path: "value.txt",
      mode: "100644",
      type: "blob",
      sha: BASE_BLOB_SHA,
    }]),
    getBlob: () => Effect.succeed(new TextEncoder().encode("old\n")),
    createBlob: (_repository, content) => {
      expect(new TextDecoder().decode(content)).toBe("new\n");
      return Effect.succeed(PATCH_BLOB_SHA);
    },
    createTree: (_repository, baseTreeSha, changes) => {
      expect(baseTreeSha).toBe(BASE_TREE_SHA);
      expect(changes).toEqual([{
        path: "value.txt",
        mode: "100644",
        type: "blob",
        sha: PATCH_BLOB_SHA,
      }]);
      return Effect.succeed(PATCH_TREE_SHA);
    },
    createCommit: (_repository, input) => Effect.sync(() => {
      commitCreates += 1;
      lastCommitParents = input.parentShas;
      const commit = {
        sha: HEAD_SHA,
        treeSha: input.treeSha,
        message: input.message,
        parentShas: input.parentShas,
        // GitHub serializes Git commit dates at whole-second precision and
        // omits the redundant `.000` fraction in its REST response.
        authoredAt: input.date.replace(/\.000Z$/, "Z"),
      };
      commits.set(HEAD_SHA, commit);
      return HEAD_SHA;
    }),
    getBranchHead: () => Effect.succeed(branchHead),
    createBranch: (_repository, _branch, sha) => Effect.sync(() => { branchHead = sha; }),
    updateBranch: (_repository, _branch, sha) => Effect.sync(() => {
      branchUpdates += 1;
      branchHead = sha;
    }),
    findPullRequests: () => Effect.succeed(
      pull === null || branchHead === null ? [] : [{ ...pull, headSha: branchHead }],
    ),
    createDraftPullRequest: (_repository, input) => {
      pullCreates += 1;
      if (options.failFirstPull && pullCreates === 1) {
        return Effect.fail(new RepositoryPublicationFailed({
          code: "GitHubUnavailable",
          operation: "create-pull-request",
          message: "GitHub is temporarily unavailable",
          retryable: true,
        }));
      }
      return Effect.suspend(() => {
        pull = {
          number: 7,
          url: "https://github.com/upstream/repository/pull/7",
          state: "open",
          draft: true,
          merged: false,
          maintainerCanModify: false,
          author: "polyphemus-agent",
          headRef: input.branch,
          headSha: options.wrongCreatedHead ? RACING_SHA : branchHead!,
          headRepository: fork.fullName,
          baseRef: input.baseBranch,
        };
        return options.duplicatePullRace
          ? Effect.fail(new RepositoryPublicationFailed({
              code: "GitHubUnavailable",
              operation: "create-pull-request",
              message: "GitHub is temporarily unavailable",
              retryable: true,
              statusCode: 422,
            }))
          : Effect.succeed(pull);
      });
    },
  };

  return {
    port,
    get counts() { return { commitCreates, pullCreates, forkEnsures }; },
    get branchUpdates() { return branchUpdates; },
    get comparisons() { return comparisons; },
    get lastCommitParents() { return lastCommitParents; },
  };
};

describe("RepositoryPublisher", () => {
  test("creates an agent fork, deterministic branch, commit, and draft pull request idempotently", async () => {
    const fixture = makePort();
    const publisher = makeRepositoryPublisher(fixture.port);
    const first = await Effect.runPromise(publisher.publish(request));
    const second = await Effect.runPromise(publisher.publish(request));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      usedFork: true,
      branch: "polyphemus/task-1",
      headSha: HEAD_SHA,
      pullRequestNumber: 7,
      draft: true,
    });
    expect(fixture.counts).toEqual({ commitCreates: 1, pullCreates: 1, forkEnsures: 2 });
  });

  test("accepts GitHub's equivalent whole-second commit date representation", async () => {
    const fixture = makePort();
    const evidence = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish({
        ...request,
        artifactCreatedAt: "2026-07-29T12:00:00.987Z",
      }),
    );

    expect(evidence.headSha).toBe(HEAD_SHA);
    expect(fixture.counts.commitCreates).toBe(1);
  });

  test("recovers an owned commit and branch after a transient pull-request failure", async () => {
    const fixture = makePort({ failFirstPull: true });
    const publisher = makeRepositoryPublisher(fixture.port);
    const firstFailure = await Effect.runPromise(
      publisher.publish(request).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );
    expect(firstFailure?.retryable).toBe(true);

    const recovered = await Effect.runPromise(publisher.publish(request));
    expect(recovered.pullRequestNumber).toBe(7);
    expect(fixture.counts).toEqual({ commitCreates: 1, pullCreates: 2, forkEnsures: 2 });
  });

  test("fails safely instead of force-updating a non-Polyphemus branch", async () => {
    const fixture = makePort({ existingHumanBranch: true });
    const failure = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish(request).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );
    expect(failure?.code).toBe("BranchOwnershipConflict");
    expect(fixture.counts.commitCreates).toBe(0);
  });

  test("rejects an incompatible current base before publishing", async () => {
    const fixture = makePort({ comparison: "diverged" });
    const failure = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish(request).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );
    expect(failure?.code).toBe("BaseConflict");
    expect(fixture.counts).toEqual({ commitCreates: 0, pullCreates: 0, forkEnsures: 0 });
  });

  test("rejects a base advance that touched a Patch file", async () => {
    const fixture = makePort({ changedBaseFiles: ["value.txt"] });
    const failure = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish(request).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );
    expect(failure?.code).toBe("BaseConflict");
    expect(fixture.counts.commitCreates).toBe(0);
  });

  test("fast-forwards only from independently recorded prior publication evidence", async () => {
    const fixture = makePort({ existingPublication: "open" });
    const evidence = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish({
        ...request,
        runId: "run-2",
        publicationId: "publication-run-2",
        previousPublication,
      }),
    );

    expect(evidence.headSha).toBe(HEAD_SHA);
    expect(fixture.lastCommitParents).toEqual([PREVIOUS_SHA, BASE_SHA]);
    expect(fixture.branchUpdates).toBe(1);
    expect(fixture.counts).toEqual({ commitCreates: 1, pullCreates: 0, forkEnsures: 1 });
  });

  test("checks existing pull-request policy before mutating its branch", async () => {
    const fixture = makePort({ existingPublication: "closed" });
    const failure = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish({
        ...request,
        runId: "run-2",
        publicationId: "publication-run-2",
        previousPublication,
      }).pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => null })),
    );

    expect(failure?.code).toBe("BranchOwnershipConflict");
    expect(fixture.counts.commitCreates).toBe(0);
    expect(fixture.branchUpdates).toBe(0);
  });

  test("rejects a created pull request whose observed head is not the selected commit", async () => {
    const fixture = makePort({ wrongCreatedHead: true });
    const failure = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish(request).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );

    expect(failure?.code).toBe("BranchOwnershipConflict");
    expect(failure?.operation).toBe("verify-draft-pull-request");
  });

  test("rediscovers a draft pull request created by a concurrent 422 race", async () => {
    const fixture = makePort({ duplicatePullRace: true });
    const evidence = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish(request),
    );

    expect(evidence.pullRequestNumber).toBe(7);
    expect(fixture.counts.pullCreates).toBe(1);
  });

  test("rechecks base compatibility immediately before branch mutation", async () => {
    const fixture = makePort({ baseChangesAfterFirstCheck: true });
    const failure = await Effect.runPromise(
      makeRepositoryPublisher(fixture.port).publish(request).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );

    expect(failure?.code).toBe("BaseConflict");
    expect(fixture.comparisons).toBe(2);
    expect(fixture.counts.commitCreates).toBe(0);
    expect(fixture.branchUpdates).toBe(0);
  });

  test("decodes and canonicalizes GitHub commit timestamps", async () => {
    const port = makeGitHubPublicationPort(
      Redacted.make("placeholder"),
      (async () => new Response(JSON.stringify({
        sha: HEAD_SHA,
        message: "Commit",
        tree: { sha: PATCH_TREE_SHA },
        author: { date: "2026-07-29T12:00:00Z" },
        parents: [{ sha: BASE_SHA }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch,
    );

    const commit = await Effect.runPromise(port.getCommit(fork, HEAD_SHA));
    expect(commit.authoredAt).toBe("2026-07-29T12:00:00.000Z");
  });

  test("uses a non-forced GitHub ref update", async () => {
    let updateBody: unknown;
    const port = makeGitHubPublicationPort(
      Redacted.make("placeholder"),
      (async (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        updateBody = JSON.parse(String(init?.body)) as unknown;
        return new Response(JSON.stringify({ object: { sha: HEAD_SHA } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch,
    );

    await Effect.runPromise(port.updateBranch(fork, "polyphemus/task-1", HEAD_SHA));
    expect(updateBody).toEqual({ sha: HEAD_SHA, force: false });
  });

  test("maps malformed GitHub blob encoding to a typed boundary failure", async () => {
    const port = makeGitHubPublicationPort(
      Redacted.make("placeholder"),
      (async () => new Response(JSON.stringify({
        sha: BASE_BLOB_SHA,
        encoding: "base64",
        content: "%%%",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch,
    );
    const failure = await Effect.runPromise(port.getBlob(fork, BASE_BLOB_SHA).pipe(
      Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
    ));
    expect(failure?.code).toBe("GitHubUnavailable");
    expect(failure?.operation).toBe("get-base-blob");
  });

  test("classifies only an explicit GitHub 422 policy message as disabled pull requests", async () => {
    const port = makeGitHubPublicationPort(
      Redacted.make("placeholder"),
      (async () => new Response(JSON.stringify({
        message: "Validation Failed",
        errors: [{ message: "Pull requests are not permitted for this repository" }],
      }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch,
    );
    const failure = await Effect.runPromise(port.createDraftPullRequest(upstream, {
      title: "Draft",
      body: "Evidence",
      headOwner: fork.owner,
      branch: "polyphemus/task-1",
      baseBranch: upstream.defaultBranch,
    }).pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => null })));

    expect(failure?.code).toBe("PullRequestsDisabled");
    expect(failure?.retryable).toBe(false);
  });

  test("keeps the GitHub credential out of structured failures", async () => {
    const secret = "github-secret-that-must-not-escape";
    const port = makeGitHubPublicationPort(
      Redacted.make(secret),
      (async () => {
        throw new Error(`request failed with Bearer ${secret}`);
      }) as unknown as typeof fetch,
    );
    const failure = await Effect.runPromise(
      port.authenticatedLogin().pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => null }),
      ),
    );
    expect(failure?.code).toBe("GitHubUnavailable");
    expect(JSON.stringify(failure)).not.toContain(secret);
  });
});
