import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import {
  decodeRepositoryPublicationRequest,
  PullRequestPublicationFailureCodeSchema,
  type PullRequestPublicationEvidence,
  type PullRequestPublicationFailure,
  type RepositoryPublicationRequest,
} from "./domain/pull-request-publication.ts";
import { parsePublicGithubRepository } from "./domain/repository-policy.ts";
import {
  applyTextFilePatch,
  parseUnifiedPatch,
  UnsupportedValidatedPatch,
  validatePatchChangedFiles,
  type UnifiedPatchFile,
} from "./domain/unified-patch.ts";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/));
const MAX_BLOB_BYTES = 1_000_000;
const PUBLICATION_SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["'][^"'\r\n]{16,}["']/i,
] as const;

const containsLikelySecret = (value: string): boolean =>
  PUBLICATION_SECRET_PATTERNS.some((pattern) => pattern.test(value));

export class RepositoryPublicationFailed extends Schema.TaggedErrorClass<RepositoryPublicationFailed>()(
  "RepositoryPublicationFailed",
  {
    code: PullRequestPublicationFailureCodeSchema,
    message: Schema.String,
    operation: Schema.String,
    retryable: Schema.Boolean,
    statusCode: Schema.optional(Schema.Number),
  },
) {
  toFailure(): PullRequestPublicationFailure {
    return {
      code: this.code,
      message: this.message,
      operation: this.operation,
      retryable: this.retryable,
      ...(this.statusCode === undefined ? {} : { statusCode: this.statusCode }),
    };
  }
}

export interface GitHubRepository {
  readonly name: string;
  readonly fullName: string;
  readonly owner: string;
  readonly private: boolean;
  readonly archived: boolean;
  readonly defaultBranch: string;
  readonly writable: boolean;
  readonly parentFullName: string | null;
}

export interface GitHubCommit {
  readonly sha: string;
  readonly message: string;
  readonly treeSha: string;
  readonly parentShas: readonly string[];
  readonly authoredAt: string;
}

export interface GitHubTreeEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: string;
  readonly sha: string;
}

export interface GitHubPullRequest {
  readonly number: number;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly draft: boolean;
  readonly merged: boolean;
  readonly maintainerCanModify: boolean;
  readonly author: string;
  readonly headRef: string;
  readonly headSha: string;
  readonly headRepository: string | null;
  readonly baseRef: string;
}

export interface GitHubPublicationPort {
  readonly authenticatedLogin: () => Effect.Effect<string, RepositoryPublicationFailed>;
  readonly getRepository: (
    owner: string,
    repository: string,
  ) => Effect.Effect<GitHubRepository, RepositoryPublicationFailed>;
  readonly ensureFork: (
    login: string,
    upstream: GitHubRepository,
  ) => Effect.Effect<GitHubRepository, RepositoryPublicationFailed>;
  readonly compareBase: (
    upstream: GitHubRepository,
    baseSha: string,
    baseBranch: string,
  ) => Effect.Effect<{
    readonly status: string;
    readonly changedFiles: readonly string[];
    readonly complete: boolean;
  }, RepositoryPublicationFailed>;
  readonly getCommit: (
    repository: GitHubRepository,
    sha: string,
  ) => Effect.Effect<GitHubCommit, RepositoryPublicationFailed>;
  readonly getTree: (
    repository: GitHubRepository,
    treeSha: string,
  ) => Effect.Effect<readonly GitHubTreeEntry[], RepositoryPublicationFailed>;
  readonly getBlob: (
    repository: GitHubRepository,
    sha: string,
  ) => Effect.Effect<Uint8Array, RepositoryPublicationFailed>;
  readonly createBlob: (
    repository: GitHubRepository,
    content: Uint8Array,
  ) => Effect.Effect<string, RepositoryPublicationFailed>;
  readonly createTree: (
    repository: GitHubRepository,
    baseTreeSha: string,
    changes: readonly {
      readonly path: string;
      readonly mode: string;
      readonly type: "blob";
      readonly sha: string | null;
    }[],
  ) => Effect.Effect<string, RepositoryPublicationFailed>;
  readonly createCommit: (
    repository: GitHubRepository,
    input: {
      readonly message: string;
      readonly treeSha: string;
      readonly parentShas: readonly string[];
      readonly date: string;
    },
  ) => Effect.Effect<string, RepositoryPublicationFailed>;
  readonly getBranchHead: (
    repository: GitHubRepository,
    branch: string,
  ) => Effect.Effect<string | null, RepositoryPublicationFailed>;
  readonly createBranch: (
    repository: GitHubRepository,
    branch: string,
    sha: string,
  ) => Effect.Effect<void, RepositoryPublicationFailed>;
  readonly updateBranch: (
    repository: GitHubRepository,
    branch: string,
    sha: string,
  ) => Effect.Effect<void, RepositoryPublicationFailed>;
  readonly findPullRequests: (
    upstream: GitHubRepository,
    headOwner: string,
    branch: string,
  ) => Effect.Effect<readonly GitHubPullRequest[], RepositoryPublicationFailed>;
  readonly createDraftPullRequest: (
    upstream: GitHubRepository,
    input: {
      readonly title: string;
      readonly body: string;
      readonly headOwner: string;
      readonly branch: string;
      readonly baseBranch: string;
    },
  ) => Effect.Effect<GitHubPullRequest, RepositoryPublicationFailed>;
}

export interface RepositoryPublisherService {
  readonly publish: (
    request: unknown,
  ) => Effect.Effect<PullRequestPublicationEvidence, RepositoryPublicationFailed>;
}

export class RepositoryPublisher extends Context.Service<RepositoryPublisher, RepositoryPublisherService>()(
  "Polyphemus/RepositoryPublisher",
) {}

const fail = (
  code: RepositoryPublicationFailed["code"],
  operation: string,
  message: string,
  retryable = false,
): RepositoryPublicationFailed => new RepositoryPublicationFailed({
  code,
  operation,
  message,
  retryable,
});

const repositoryCoordinates = (canonicalUrl: string): { owner: string; repository: string } => {
  const [, owner, repository] = new URL(canonicalUrl).pathname.split("/");
  if (!owner || !repository) throw fail(
    "UnsupportedRepository",
    "decode-repository",
    "Repository URL does not identify a GitHub repository",
  );
  return { owner, repository };
};

const decodeUtf8 = (
  bytes: Uint8Array,
): Effect.Effect<string, RepositoryPublicationFailed> => {
  if (bytes.byteLength > MAX_BLOB_BYTES) {
    return Effect.fail(fail(
      "UnsupportedPatch",
      "materialize-patch",
      "Patch changes a file above the publication size limit",
    ));
  }
  return Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    catch: () => fail(
      "UnsupportedPatch",
      "materialize-patch",
      "Patch changes a non-UTF-8 file",
    ),
  });
};

const encodeUtf8 = (
  text: string,
): Effect.Effect<Uint8Array, RepositoryPublicationFailed> => {
  const bytes = new TextEncoder().encode(text);
  return bytes.byteLength > MAX_BLOB_BYTES
    ? Effect.fail(fail(
        "UnsupportedPatch",
        "materialize-patch",
        "Published file exceeds the publication size limit",
      ))
    : Effect.succeed(bytes);
};

const commitMessage = (request: RepositoryPublicationRequest): string => {
  const summary = request.objective.split(/\r?\n/, 1)[0]!.trim().slice(0, 100) || "Apply validated Patch";
  return `${summary}\n\nPolyphemus-Task: ${request.taskId}\nPolyphemus-Run: ${request.runId}\nPolyphemus-Publication: ${request.publicationId}`;
};

const canonicalGitCommitDate = (value: string): string | null => {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(Math.floor(milliseconds / 1_000) * 1_000).toISOString()
    : null;
};

const isExactPublicationCommit = (
  commit: GitHubCommit,
  input: {
    readonly message: string;
    readonly treeSha: string;
    readonly parentShas: readonly string[];
    readonly authoredAt: string;
  },
): boolean => commit.message === input.message &&
  commit.treeSha === input.treeSha &&
  commit.parentShas.length === input.parentShas.length &&
  commit.parentShas.every((parent, index) => parent === input.parentShas[index]) &&
  canonicalGitCommitDate(commit.authoredAt) === input.authoredAt;

const pullRequestTitle = (objective: string): string => {
  const summary = objective.split(/\r?\n/, 1)[0]!.trim().slice(0, 180);
  return `[Polyphemus] ${summary || "Validated repository Patch"}`;
};

const pullRequestBody = (request: RepositoryPublicationRequest): string => `## Polyphemus Validated Patch

This draft pull request was published autonomously after independent validation completed.

- Repository Task: \`${request.taskId}\`
- Agent Run: \`${request.runId}\`
- Recorded base: \`${request.baseSha}\`

Polyphemus cannot merge this pull request. Review the persisted Run Result and observed validation evidence before taking further action.`;

const materializeChanges = Effect.fn("RepositoryPublisher.materializeChanges")(function* (
  github: GitHubPublicationPort,
  upstream: GitHubRepository,
  target: GitHubRepository,
  baseTree: readonly GitHubTreeEntry[],
  files: readonly UnifiedPatchFile[],
) {
  const entries = new Map(baseTree.map((entry) => [entry.path, entry]));
  const changes: Array<{
    readonly path: string;
    readonly mode: string;
    readonly type: "blob";
    readonly sha: string | null;
  }> = [];

  for (const file of files) {
    const oldEntry = file.oldPath === null ? undefined : entries.get(file.oldPath);
    if (file.oldPath !== null && (oldEntry === undefined || oldEntry.type !== "blob")) {
      return yield* Effect.fail(fail(
        "BaseConflict",
        "materialize-patch",
        "Patch source file is absent from its recorded base",
      ));
    }

    let sourceText = "";
    if (oldEntry !== undefined && (file.hunks.length > 0 || file.newPath === null)) {
      sourceText = yield* decodeUtf8(yield* github.getBlob(upstream, oldEntry.sha));
    }

    if (file.oldPath !== null && (file.newPath === null || file.newPath !== file.oldPath)) {
      changes.push({ path: file.oldPath, mode: oldEntry?.mode ?? "100644", type: "blob", sha: null });
    }
    if (file.newPath === null) {
      try {
        if (applyTextFilePatch(sourceText, file) !== "") {
          return yield* Effect.fail(fail(
            "BaseConflict",
            "materialize-patch",
            "Deleted file Patch does not remove the complete recorded base file",
          ));
        }
      } catch (error) {
        return yield* Effect.fail(fail(
          "BaseConflict",
          "materialize-patch",
          error instanceof UnsupportedValidatedPatch
            ? error.message
            : "Validated Patch could not be applied to its recorded base",
        ));
      }
      continue;
    }

    const mode = file.newMode ?? oldEntry?.mode ?? "100644";
    let sha: string;
    if (file.hunks.length === 0) {
      if (oldEntry === undefined) {
        sha = yield* github.createBlob(target, new Uint8Array());
      } else {
        sha = oldEntry.sha;
      }
    } else {
      let materialized: string;
      try {
        materialized = applyTextFilePatch(sourceText, file);
      } catch (error) {
        return yield* Effect.fail(fail(
          "BaseConflict",
          "materialize-patch",
          error instanceof UnsupportedValidatedPatch
            ? error.message
            : "Validated Patch could not be applied to its recorded base",
        ));
      }
      sha = yield* github.createBlob(target, yield* encodeUtf8(materialized));
    }
    changes.push({ path: file.newPath, mode, type: "blob", sha });
  }
  return changes;
});

const ensureCompatibleBase = Effect.fn("RepositoryPublisher.ensureCompatibleBase")(
  function* (
    github: GitHubPublicationPort,
    upstream: GitHubRepository,
    baseSha: string,
    patchPaths: ReadonlySet<string>,
  ) {
    const comparison = yield* github.compareBase(
      upstream,
      baseSha,
      upstream.defaultBranch,
    );
    if (comparison.status !== "identical" && comparison.status !== "ahead") {
      return yield* Effect.fail(fail(
        "BaseConflict",
        "compare-base",
        "Recorded base revision is incompatible with the repository's current base branch",
      ));
    }
    if (!comparison.complete || comparison.changedFiles.some((path) => patchPaths.has(path))) {
      return yield* Effect.fail(fail(
        "BaseConflict",
        "compare-base",
        "The repository base changed in a file touched by the Validated Patch",
      ));
    }
  },
);

const requirePullRequestPolicy = Effect.fn("RepositoryPublisher.requirePullRequestPolicy")(
  function* (
    pull: GitHubPullRequest,
    input: {
      readonly operation: string;
      readonly login: string;
      readonly upstream: GitHubRepository;
      readonly target: GitHubRepository;
      readonly branch: string;
      readonly expectedHeadSha: string;
      readonly previousPublication: RepositoryPublicationRequest["previousPublication"];
    },
  ) {
    const expectedUrl = `https://github.com/${input.upstream.fullName}/pull/${pull.number}`;
    const expectedPrevious = input.previousPublication;
    if (pull.author.toLowerCase() !== input.login.toLowerCase() ||
        pull.state !== "open" || pull.merged || !pull.draft ||
        pull.maintainerCanModify || pull.headRef !== input.branch || pull.headSha !== input.expectedHeadSha ||
        pull.headRepository?.toLowerCase() !== input.target.fullName.toLowerCase() ||
        pull.baseRef !== input.upstream.defaultBranch ||
        pull.url.toLowerCase() !== expectedUrl.toLowerCase() ||
        (expectedPrevious !== null &&
          (pull.number !== expectedPrevious.pullRequestNumber ||
            pull.url.toLowerCase() !== expectedPrevious.pullRequestUrl.toLowerCase()))) {
      return yield* Effect.fail(fail(
        "BranchOwnershipConflict",
        input.operation,
        "Pull Request is not the expected open Agent-authored draft at the selected commit",
      ));
    }
    return pull;
  },
);

const findSinglePullRequest = Effect.fn("RepositoryPublisher.findSinglePullRequest")(
  function* (
    github: GitHubPublicationPort,
    upstream: GitHubRepository,
    target: GitHubRepository,
    branch: string,
  ) {
    const pulls = yield* github.findPullRequests(upstream, target.owner, branch);
    if (pulls.length > 1) {
      return yield* Effect.fail(fail(
        "PublicationFailed",
        "recover-pull-request",
        "More than one Pull Request matches the Agent Branch",
      ));
    }
    return pulls[0] ?? null;
  },
);

export const makeRepositoryPublisher = (
  github: GitHubPublicationPort,
): RepositoryPublisherService => {
  const publish = (unknownRequest: unknown) => Effect.gen(function* () {
    const request = yield* decodeRepositoryPublicationRequest(unknownRequest).pipe(
      Effect.mapError((error) => fail("UnsupportedPatch", "decode-publication-request", error.message)),
    );
    const commitDate = canonicalGitCommitDate(request.artifactCreatedAt);
    if (!/^task-[A-Za-z0-9-]+$/.test(request.taskId) || commitDate === null) {
      return yield* Effect.fail(fail(
        "UnsupportedPatch",
        "decode-publication-request",
        "Repository Publication identifiers or timestamps are invalid",
      ));
    }
    if (containsLikelySecret(request.objective) || containsLikelySecret(request.patch)) {
      return yield* Effect.fail(fail(
        "UnsupportedPatch",
        "scan-publication-content",
        "Publication was blocked because its public content resembles a credential",
      ));
    }
    const parsedRepository = yield* parsePublicGithubRepository(request.repositoryUrl).pipe(
      Effect.mapError((error) => fail("UnsupportedRepository", "decode-repository", error.message)),
    );
    const coordinates = yield* Effect.try({
      try: () => repositoryCoordinates(parsedRepository.canonicalUrl),
      catch: (error) => error instanceof RepositoryPublicationFailed
        ? error
        : fail("UnsupportedRepository", "decode-repository", "Repository URL is invalid"),
    });
    const files = yield* Effect.try({
      try: () => {
        const parsed = parseUnifiedPatch(request.patch);
        validatePatchChangedFiles(parsed, request.changedFiles);
        return parsed;
      },
      catch: (error) => error instanceof UnsupportedValidatedPatch
        ? fail("UnsupportedPatch", "decode-patch", error.message)
        : fail("UnsupportedPatch", "decode-patch", "Validated Patch could not be decoded"),
    });

    const login = yield* github.authenticatedLogin();
    const upstream = yield* github.getRepository(coordinates.owner, coordinates.repository);
    if (upstream.owner.toLowerCase() !== coordinates.owner.toLowerCase() ||
        upstream.name.toLowerCase() !== coordinates.repository.toLowerCase() ||
        upstream.fullName.toLowerCase() !==
          `${upstream.owner}/${upstream.name}`.toLowerCase()) {
      return yield* Effect.fail(fail(
        "UnsupportedRepository",
        "inspect-repository",
        "GitHub repository identity did not match the requested public repository",
      ));
    }
    if (upstream.private) {
      return yield* Effect.fail(fail(
        "UnsupportedRepository",
        "inspect-repository",
        "Only public GitHub repositories can be published",
      ));
    }
    if (upstream.archived) {
      return yield* Effect.fail(fail(
        "ArchivedRepository",
        "inspect-repository",
        "Archived repositories cannot receive a Pull Request Publication",
      ));
    }

    const patchPaths = new Set(files.flatMap((file) =>
      [file.oldPath, file.newPath].filter((path): path is string => path !== null)));
    yield* ensureCompatibleBase(github, upstream, request.baseSha, patchPaths);

    const baseCommit = yield* github.getCommit(upstream, request.baseSha).pipe(
      Effect.mapError((error) => error.statusCode === 404
        ? fail(
            "BaseRevisionUnavailable",
            "get-base-commit",
            "Recorded base revision is unavailable on GitHub",
          )
        : error),
    );
    if (baseCommit.sha !== request.baseSha) {
      return yield* Effect.fail(fail(
        "BaseRevisionUnavailable",
        "get-base-commit",
        "GitHub returned a different commit for the recorded base revision",
      ));
    }
    const baseTree = yield* github.getTree(upstream, baseCommit.treeSha);
    const useUpstream = upstream.writable || upstream.owner.toLowerCase() === login.toLowerCase();
    const target = useUpstream ? upstream : yield* github.ensureFork(login, upstream);
    if ((!useUpstream &&
        (target.owner.toLowerCase() !== login.toLowerCase() ||
          target.name.toLowerCase() !== upstream.name.toLowerCase() ||
          target.fullName.toLowerCase() !== `${target.owner}/${target.name}`.toLowerCase() ||
          target.private || target.archived ||
          target.parentFullName?.toLowerCase() !== upstream.fullName.toLowerCase()))) {
      return yield* Effect.fail(fail(
        "ForkUnavailable",
        "inspect-fork",
        "GitHub did not provide the expected public Agent-owned fork",
      ));
    }
    const branch = `polyphemus/${request.taskId}`;
    const previousPublication = request.previousPublication;
    if (previousPublication !== null &&
        (previousPublication.upstreamOwner.toLowerCase() !== upstream.owner.toLowerCase() ||
          previousPublication.upstreamRepository.toLowerCase() !== upstream.name.toLowerCase() ||
          previousPublication.baseBranch !== upstream.defaultBranch ||
          previousPublication.usedFork !== !useUpstream ||
          previousPublication.headOwner.toLowerCase() !== target.owner.toLowerCase() ||
          previousPublication.headRepository.toLowerCase() !== target.name.toLowerCase() ||
          previousPublication.branch !== branch)) {
      return yield* Effect.fail(fail(
        "BranchOwnershipConflict",
        "recover-agent-branch",
        "Prior publication evidence does not own the current Agent Branch target",
      ));
    }

    const changes = yield* materializeChanges(github, upstream, target, baseTree, files);
    const treeSha = yield* github.createTree(target, baseCommit.treeSha, changes);
    const expectedMessage = commitMessage(request);
    const expectedParentShas = previousPublication === null
      ? [request.baseSha]
      : previousPublication.headSha === request.baseSha
        ? [request.baseSha]
        : [previousPublication.headSha, request.baseSha];
    const expectedCommit = {
      message: expectedMessage,
      treeSha,
      parentShas: expectedParentShas,
      authoredAt: commitDate,
    };
    const existingHead = yield* github.getBranchHead(target, branch);
    const existingCommit = existingHead === null
      ? null
      : yield* github.getCommit(target, existingHead);
    if (existingCommit !== null && existingCommit.sha !== existingHead) {
      return yield* Effect.fail(fail(
        "BranchOwnershipConflict",
        "inspect-agent-branch",
        "Agent Branch head did not match the commit returned by GitHub",
      ));
    }
    const exactCurrentCommit = existingCommit !== null &&
      isExactPublicationCommit(existingCommit, expectedCommit);
    const preexistingPull = yield* findSinglePullRequest(github, upstream, target, branch);

    if (preexistingPull !== null) {
      if (existingHead === null) {
        return yield* Effect.fail(fail(
          "BranchOwnershipConflict",
          "inspect-agent-branch",
          "Agent Pull Request exists without its expected branch",
        ));
      }
      yield* requirePullRequestPolicy(preexistingPull, {
        operation: "inspect-agent-pull-request",
        login,
        upstream,
        target,
        branch,
        expectedHeadSha: existingHead,
        previousPublication,
      });
    } else if (previousPublication !== null) {
      return yield* Effect.fail(fail(
        "BranchOwnershipConflict",
        "inspect-agent-pull-request",
        "Prior publication evidence no longer identifies the Agent Pull Request",
      ));
    }

    if (existingHead !== null && !exactCurrentCommit &&
        (previousPublication === null || existingHead !== previousPublication.headSha)) {
      return yield* Effect.fail(fail(
        "BranchOwnershipConflict",
        "inspect-agent-branch",
        "Deterministic Agent Branch is not at an independently recorded Polyphemus commit",
      ));
    }
    if (existingHead === null && previousPublication !== null) {
      return yield* Effect.fail(fail(
        "BranchOwnershipConflict",
        "inspect-agent-branch",
        "Previously published Agent Branch is no longer available",
      ));
    }

    let headSha = existingHead;
    if (!exactCurrentCommit) {
      // Recheck immediately before mutation. The ref update below is
      // fast-forward-only from the independently recorded parent.
      yield* ensureCompatibleBase(github, upstream, request.baseSha, patchPaths);
      headSha = yield* github.createCommit(target, {
        message: expectedMessage,
        treeSha,
        parentShas: expectedParentShas,
        date: commitDate,
      });
      const createdCommit = yield* github.getCommit(target, headSha);
      if (createdCommit.sha !== headSha ||
          !isExactPublicationCommit(createdCommit, expectedCommit)) {
        return yield* Effect.fail(fail(
          "PublicationFailed",
          "verify-publication-commit",
          "GitHub did not materialize the exact selected publication commit",
        ));
      }
      if (existingHead === null) {
        yield* github.createBranch(target, branch, headSha).pipe(
          Effect.catch((createError) => github.getBranchHead(target, branch).pipe(
            Effect.flatMap((observed) => observed === headSha
              ? Effect.void
              : Effect.fail(createError)),
          )),
        );
      } else {
        yield* github.updateBranch(target, branch, headSha);
      }
    }
    if (headSha === null || (yield* github.getBranchHead(target, branch)) !== headSha) {
      return yield* Effect.fail(fail(
        "BranchOwnershipConflict",
        "verify-agent-branch",
        "Agent Branch moved before publication could be verified",
      ));
    }

    let pull = yield* findSinglePullRequest(github, upstream, target, branch);
    if (pull === null) {
      yield* ensureCompatibleBase(github, upstream, request.baseSha, patchPaths);
      pull = yield* github.createDraftPullRequest(upstream, {
        title: pullRequestTitle(request.objective),
        body: pullRequestBody(request),
        headOwner: target.owner,
        branch,
        baseBranch: upstream.defaultBranch,
      }).pipe(
        Effect.catch((createError) => createError.statusCode === 422
          ? findSinglePullRequest(github, upstream, target, branch).pipe(
              Effect.flatMap((recovered) => recovered === null
                ? Effect.fail(createError)
                : Effect.succeed(recovered)),
            )
          : Effect.fail(createError)),
      );
    }
    pull = yield* requirePullRequestPolicy(pull, {
      operation: "verify-draft-pull-request",
      login,
      upstream,
      target,
      branch,
      expectedHeadSha: headSha,
      previousPublication,
    });

    return {
      upstreamOwner: upstream.owner,
      upstreamRepository: upstream.name,
      baseBranch: upstream.defaultBranch,
      usedFork: !useUpstream,
      headOwner: target.owner,
      headRepository: target.name,
      branch,
      headSha: pull.headSha,
      pullRequestNumber: pull.number,
      pullRequestUrl: pull.url,
      // This literal is backed by the decoded and checked GitHub response above.
      draft: true,
    } satisfies PullRequestPublicationEvidence;
  });

  return RepositoryPublisher.of({ publish });
};

const GitHubUserSchema = Schema.Struct({ login: RequiredText });
const GitHubRepositorySchema = Schema.Struct({
  name: RequiredText,
  full_name: RequiredText,
  private: Schema.Boolean,
  archived: Schema.Boolean,
  default_branch: RequiredText,
  owner: GitHubUserSchema,
  permissions: Schema.optional(Schema.Struct({ push: Schema.Boolean })),
  parent: Schema.optional(Schema.Struct({ full_name: RequiredText })),
});
const GitHubCommitSchema = Schema.Struct({
  sha: Sha,
  message: Schema.String,
  tree: Schema.Struct({ sha: Sha }),
  author: Schema.Struct({ date: Schema.DateFromString }),
  parents: Schema.Array(Schema.Struct({ sha: Sha })),
});
const GitHubTreeSchema = Schema.Struct({
  truncated: Schema.Boolean,
  tree: Schema.Array(Schema.Struct({
    path: RequiredText,
    mode: Schema.Literals(["040000", "100644", "100755", "120000", "160000"] as const),
    type: Schema.Literals(["blob", "tree", "commit"] as const),
    sha: Sha,
  })),
});
const GitHubBlobSchema = Schema.Struct({
  sha: Sha,
  encoding: Schema.Literal("base64"),
  content: Schema.String,
});
const GitHubShaSchema = Schema.Struct({ sha: Sha });
const GitHubRefSchema = Schema.Struct({ object: Schema.Struct({ sha: Sha }) });
const GitHubErrorText = Schema.String.check(Schema.isMaxLength(2_048));
const GitHubErrorSchema = Schema.Struct({
  message: GitHubErrorText,
  errors: Schema.optional(Schema.Array(Schema.Union([
    GitHubErrorText,
    Schema.Struct({ message: Schema.optional(GitHubErrorText) }),
  ])).check(Schema.isMaxLength(20))),
});
const GitHubComparisonSchema = Schema.Struct({
  status: RequiredText,
  files: Schema.optional(Schema.Array(Schema.Struct({
    filename: RequiredText,
    previous_filename: Schema.optional(RequiredText),
  }))),
});
const GitHubPullRequestSchema = Schema.Struct({
  number: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  html_url: Schema.String.check(
    Schema.isPattern(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/),
  ),
  state: Schema.Literals(["open", "closed"] as const),
  draft: Schema.Boolean,
  merged_at: Schema.NullOr(RequiredText),
  maintainer_can_modify: Schema.Boolean,
  user: GitHubUserSchema,
  head: Schema.Struct({
    ref: RequiredText,
    sha: Sha,
    repo: Schema.NullOr(Schema.Struct({ full_name: RequiredText })),
  }),
  base: Schema.Struct({ ref: RequiredText }),
});

interface GitHubRequestOptions<A, I> {
  readonly operation: string;
  readonly method?: "GET" | "POST" | "PATCH";
  readonly path: string;
  readonly body?: unknown;
  readonly schema: Schema.Codec<A, I, never>;
  readonly notFound?: "null";
}

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodeBase64 = (
  value: string,
): Effect.Effect<Uint8Array, RepositoryPublicationFailed> => Effect.try({
  try: () => {
    const normalized = value.replace(/\s/g, "");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
      throw new Error("invalid base64");
    }
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  },
  catch: () => fail(
    "GitHubUnavailable",
    "get-base-blob",
    "GitHub blob content did not match its contract",
    true,
  ),
});

const statusFailure = (
  operation: string,
  status: number,
  githubMessage: string | null = null,
): RepositoryPublicationFailed => {
  const normalizedMessage = githubMessage?.toLowerCase() ?? "";
  const pullRequestsDisabled = operation === "create-pull-request" && status === 422 &&
    /pull requests?.*(?:disabled|not allowed|not permitted)/.test(normalizedMessage);
  const noCommits = operation === "create-pull-request" && status === 422 &&
    normalizedMessage.includes("no commits between");
  const retryable = status === 408 || status === 429 || status >= 500 ||
    (status === 422 && [
      "create-fork",
      "create-blob",
      "create-tree",
      "create-commit",
      "create-agent-branch",
    ].includes(operation)) ||
    (operation === "create-pull-request" && status === 422 &&
      !pullRequestsDisabled && !noCommits);
  const code = pullRequestsDisabled
    ? "PullRequestsDisabled" as const
    : noCommits
      ? "BaseConflict" as const
      : operation === "update-agent-branch" && status === 422
        ? "BranchOwnershipConflict" as const
        : status === 404 && (operation === "get-base-commit" || operation === "compare-base")
          ? "BaseRevisionUnavailable" as const
          : operation.includes("fork")
            ? "ForkUnavailable" as const
            : retryable
              ? "GitHubUnavailable" as const
              : "PublicationFailed" as const;
  const message = code === "PullRequestsDisabled"
    ? "GitHub has disabled pull requests for this repository"
    : code === "BaseConflict"
      ? "Validated Patch no longer differs from the repository base"
      : code === "BranchOwnershipConflict"
        ? "Agent Branch moved before its fast-forward update"
        : code === "BaseRevisionUnavailable"
        ? "Recorded base revision is unavailable on GitHub"
        : code === "ForkUnavailable"
          ? "Agent-owned fork is unavailable"
          : retryable
            ? "GitHub is temporarily unavailable"
            : "GitHub rejected the Pull Request Publication operation";
  return new RepositoryPublicationFailed({ code, operation, message, retryable, statusCode: status });
};

export const makeGitHubPublicationPort = (
  token: Redacted.Redacted<string>,
  fetchImplementation: typeof fetch = fetch,
  publisherLogin?: string,
): GitHubPublicationPort => {
  const requestRaw = <A, I>(options: GitHubRequestOptions<A, I>) => Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchImplementation(`https://api.github.com${options.path}`, {
        method: options.method ?? "GET",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${Redacted.value(token)}`,
          "Content-Type": "application/json",
          "User-Agent": "polyphemus-repository-agent",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      }),
      catch: () => fail("GitHubUnavailable", options.operation, "Could not reach GitHub", true),
    });
    if (options.notFound === "null" && response.status === 404) return null;
    if (!response.ok) {
      const githubMessage = response.status === 422
        ? yield* Effect.tryPromise({
            try: () => response.json() as Promise<unknown>,
            catch: () => null,
          }).pipe(
            Effect.flatMap((value) => value === null
              ? Effect.succeed(null)
              : Schema.decodeUnknownEffect(GitHubErrorSchema)(value).pipe(
                  Effect.match({
                    onFailure: () => null,
                    onSuccess: (error) => [
                      error.message,
                      ...(error.errors?.flatMap((detail) => typeof detail === "string"
                        ? [detail]
                        : detail.message === undefined ? [] : [detail.message]) ?? []),
                    ].join(" "),
                  }),
                )),
            Effect.catch(() => Effect.succeed(null)),
          )
        : null;
      return yield* Effect.fail(statusFailure(options.operation, response.status, githubMessage));
    }
    const value = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => fail("GitHubUnavailable", options.operation, "GitHub returned invalid JSON", true),
    });
    return yield* Schema.decodeUnknownEffect(options.schema)(value).pipe(
      Effect.mapError(() => fail(
        "GitHubUnavailable",
        options.operation,
        "GitHub response did not match its contract",
        true,
      )),
    );
  });

  const requiredRequest = <A, I>(
    options: Omit<GitHubRequestOptions<A, I>, "notFound">,
  ): Effect.Effect<A, RepositoryPublicationFailed> => requestRaw(options).pipe(
    Effect.map((value) => value as A),
  );

  const repository = (value: typeof GitHubRepositorySchema.Type): GitHubRepository => ({
    name: value.name,
    fullName: value.full_name,
    owner: value.owner.login,
    private: value.private,
    archived: value.archived,
    defaultBranch: value.default_branch,
    writable: value.permissions?.push ?? false,
    parentFullName: value.parent?.full_name ?? null,
  });

  const getRepositoryOptional = (owner: string, name: string) => requestRaw({
    operation: "get-repository",
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    schema: GitHubRepositorySchema,
    notFound: "null",
  }).pipe(Effect.map((value) => value === null ? null : repository(value)));

  const getRepository = (owner: string, name: string) => getRepositoryOptional(owner, name).pipe(
    Effect.flatMap((value) => value === null
      ? Effect.fail(fail("UnsupportedRepository", "get-repository", "GitHub repository was not found"))
      : Effect.succeed(value)),
  );

  const pull = (value: typeof GitHubPullRequestSchema.Type): GitHubPullRequest => ({
    number: value.number,
    url: value.html_url,
    state: value.state,
    draft: value.draft,
    merged: value.merged_at !== null,
    maintainerCanModify: value.maintainer_can_modify,
    author: value.user.login,
    headRef: value.head.ref,
    headSha: value.head.sha,
    headRepository: value.head.repo?.full_name ?? null,
    baseRef: value.base.ref,
  });

  return {
    // Installation tokens authenticate an App installation rather than a User,
    // so their publisher namespace is decoded from deployment configuration.
    authenticatedLogin: publisherLogin === undefined
      ? () => requiredRequest({
          operation: "authenticate-github-publisher",
          path: "/user",
          schema: GitHubUserSchema,
        }).pipe(Effect.map((value) => value.login))
      : () => Effect.succeed(publisherLogin),
    getRepository,
    ensureFork: (login, upstream) => Effect.gen(function* () {
      const existing = yield* getRepositoryOptional(login, upstream.name);
      if (existing !== null) {
        if (existing.parentFullName?.toLowerCase() !== upstream.fullName.toLowerCase()) {
          return yield* Effect.fail(fail(
            "ForkUnavailable",
            "recover-fork",
            "Agent account repository name is occupied by an unrelated repository",
          ));
        }
        return existing;
      }
      const created = repository(yield* requiredRequest({
        operation: "create-fork",
        method: "POST",
        path: `/repos/${encodeURIComponent(upstream.owner)}/${encodeURIComponent(upstream.name)}/forks`,
        body: { name: upstream.name, default_branch_only: true },
        schema: GitHubRepositorySchema,
      }));
      if (created.parentFullName?.toLowerCase() === upstream.fullName.toLowerCase()) {
        return created;
      }
      const recovered = yield* getRepositoryOptional(login, upstream.name);
      if (recovered?.parentFullName?.toLowerCase() === upstream.fullName.toLowerCase()) {
        return recovered;
      }
      return yield* Effect.fail(fail(
        "ForkUnavailable",
        "create-fork",
        "Agent-owned fork is still being prepared by GitHub",
        true,
      ));
    }),
    compareBase: (upstream, baseSha, baseBranch) => requiredRequest({
      operation: "compare-base",
      path: `/repos/${encodeURIComponent(upstream.owner)}/${encodeURIComponent(upstream.name)}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(baseBranch)}`,
      schema: GitHubComparisonSchema,
    }).pipe(Effect.map((value) => ({
      status: value.status,
      changedFiles: value.files?.flatMap((file) =>
        file.previous_filename === undefined
          ? [file.filename]
          : [file.filename, file.previous_filename]) ?? [],
      // GitHub's compare endpoint caps this embedded file list at 300.
      complete: value.status === "identical" ||
        (value.files !== undefined && value.files.length < 300),
    }))),
    getCommit: (repo, sha) => requiredRequest({
      operation: "get-commit",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/commits/${encodeURIComponent(sha)}`,
      schema: GitHubCommitSchema,
    }).pipe(Effect.map((value) => ({
      sha: value.sha,
      message: value.message,
      treeSha: value.tree.sha,
      parentShas: value.parents.map((parent) => parent.sha),
      authoredAt: new Date(
        Math.floor(value.author.date.getTime() / 1_000) * 1_000,
      ).toISOString(),
    }))),
    getTree: (repo, treeSha) => requiredRequest({
      operation: "get-base-tree",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
      schema: GitHubTreeSchema,
    }).pipe(Effect.flatMap((value) => value.truncated
      ? Effect.fail(fail("UnsupportedRepository", "get-base-tree", "Repository tree exceeds the publication limit"))
      : Effect.succeed(value.tree))),
    getBlob: (repo, sha) => requiredRequest({
      operation: "get-base-blob",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/blobs/${encodeURIComponent(sha)}`,
      schema: GitHubBlobSchema,
    }).pipe(Effect.flatMap((value) => decodeBase64(value.content))),
    createBlob: (repo, content) => requiredRequest({
      operation: "create-blob",
      method: "POST",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/blobs`,
      body: { content: encodeBase64(content), encoding: "base64" },
      schema: GitHubShaSchema,
    }).pipe(Effect.map((value) => value.sha)),
    createTree: (repo, baseTreeSha, changes) => requiredRequest({
      operation: "create-tree",
      method: "POST",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/trees`,
      body: { base_tree: baseTreeSha, tree: changes },
      schema: GitHubShaSchema,
    }).pipe(Effect.map((value) => value.sha)),
    createCommit: (repo, input) => requiredRequest({
      operation: "create-commit",
      method: "POST",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/commits`,
      body: {
        message: input.message,
        tree: input.treeSha,
        parents: input.parentShas,
        author: {
          name: "Polyphemus",
          email: "polyphemus-agent@users.noreply.github.com",
          date: input.date,
        },
        committer: {
          name: "Polyphemus",
          email: "polyphemus-agent@users.noreply.github.com",
          date: input.date,
        },
      },
      schema: GitHubShaSchema,
    }).pipe(Effect.map((value) => value.sha)),
    getBranchHead: (repo, branch) => requestRaw({
      operation: "get-agent-branch",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
      schema: GitHubRefSchema,
      notFound: "null",
    }).pipe(Effect.map((value) => value?.object.sha ?? null)),
    createBranch: (repo, branch, sha) => requiredRequest({
      operation: "create-agent-branch",
      method: "POST",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/refs`,
      body: { ref: `refs/heads/${branch}`, sha },
      schema: GitHubRefSchema,
    }).pipe(Effect.asVoid),
    updateBranch: (repo, branch, sha) => requiredRequest({
      operation: "update-agent-branch",
      method: "PATCH",
      path: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
      body: { sha, force: false },
      schema: GitHubRefSchema,
    }).pipe(Effect.asVoid),
    findPullRequests: (upstream, headOwner, branch) => {
      const query = new URLSearchParams({ state: "all", head: `${headOwner}:${branch}`, per_page: "100" });
      return requiredRequest({
        operation: "find-pull-request",
        path: `/repos/${encodeURIComponent(upstream.owner)}/${encodeURIComponent(upstream.name)}/pulls?${query}`,
        schema: Schema.Array(GitHubPullRequestSchema),
      }).pipe(Effect.map((values) => values.map(pull)));
    },
    createDraftPullRequest: (upstream, input) => requiredRequest({
      operation: "create-pull-request",
      method: "POST",
      path: `/repos/${encodeURIComponent(upstream.owner)}/${encodeURIComponent(upstream.name)}/pulls`,
      body: {
        title: input.title,
        body: input.body,
        head: `${input.headOwner}:${input.branch}`,
        base: input.baseBranch,
        draft: true,
        maintainer_can_modify: false,
      },
      schema: GitHubPullRequestSchema,
    }).pipe(Effect.map(pull)),
  };
};
