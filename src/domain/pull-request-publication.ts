import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/));
const GitHubPullRequestUrl = Schema.String.check(
  Schema.isPattern(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/),
);
const PositiveInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
export const MAX_PULL_REQUEST_PUBLICATION_ATTEMPTS = 5;
const PublicationAttempt = PositiveInteger.check(
  Schema.isLessThanOrEqualTo(MAX_PULL_REQUEST_PUBLICATION_ATTEMPTS),
);

export const PullRequestPublicationStatusSchema = Schema.Literals([
  "pending",
  "preparing",
  "publishing",
  "complete",
  "failed",
] as const);
export type PullRequestPublicationStatus = typeof PullRequestPublicationStatusSchema.Type;

export const PullRequestPublicationFailureCodeSchema = Schema.Literals([
  "PublicationWorkflowStartFailed",
  "PatchNotValidated",
  "EmptyPatch",
  "UnsupportedPatch",
  "UnsupportedRepository",
  "ArchivedRepository",
  "PullRequestsDisabled",
  "ForkUnavailable",
  "BaseRevisionUnavailable",
  "BaseConflict",
  "BranchOwnershipConflict",
  "GitHubUnavailable",
  "PublicationFailed",
] as const);
export type PullRequestPublicationFailureCode =
  typeof PullRequestPublicationFailureCodeSchema.Type;

export const PullRequestPublicationFailureSchema = Schema.Struct({
  code: PullRequestPublicationFailureCodeSchema,
  message: RequiredText,
  operation: RequiredText,
  retryable: Schema.Boolean,
  statusCode: Schema.optional(Schema.Number),
});
export type PullRequestPublicationFailure = typeof PullRequestPublicationFailureSchema.Type;

export const PullRequestPublicationEvidenceSchema = Schema.Struct({
  upstreamOwner: RequiredText,
  upstreamRepository: RequiredText,
  baseBranch: RequiredText,
  usedFork: Schema.Boolean,
  headOwner: RequiredText,
  headRepository: RequiredText,
  branch: RequiredText,
  headSha: Sha,
  pullRequestNumber: PositiveInteger,
  pullRequestUrl: GitHubPullRequestUrl,
  draft: Schema.Literal(true),
});
export type PullRequestPublicationEvidence = typeof PullRequestPublicationEvidenceSchema.Type;

export const PullRequestPublicationSnapshotSchema = Schema.Struct({
  version: Schema.Literal(1),
  publicationId: RequiredText,
  attempt: PublicationAttempt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
  sourceRunId: RequiredText,
  patchArtifactKey: RequiredText,
  publicationArtifactKey: Schema.NullOr(RequiredText),
  baseSha: Sha,
  branch: RequiredText,
  status: PullRequestPublicationStatusSchema,
  activity: RequiredText,
  evidence: Schema.NullOr(PullRequestPublicationEvidenceSchema),
  failure: Schema.NullOr(PullRequestPublicationFailureSchema),
  createdAt: RequiredText,
  updatedAt: RequiredText,
  completedAt: Schema.NullOr(RequiredText),
});
export type PullRequestPublicationSnapshot = typeof PullRequestPublicationSnapshotSchema.Type;

export const OptionalPullRequestPublicationSchema = Schema.NullOr(
  PullRequestPublicationSnapshotSchema,
).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null)));

export const StartPullRequestPublicationInputSchema = Schema.Struct({
  taskId: RequiredText,
  runId: RequiredText,
  publicationId: RequiredText,
  attempt: PublicationAttempt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
  patchArtifactKey: RequiredText,
  baseSha: Sha,
  branch: RequiredText,
  now: RequiredText,
});
export type StartPullRequestPublicationInput =
  typeof StartPullRequestPublicationInputSchema.Type;

export const MarkPullRequestPublicationInputSchema = Schema.Struct({
  taskId: RequiredText,
  runId: RequiredText,
  publicationId: RequiredText,
  attempt: PublicationAttempt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
  status: Schema.Literals(["preparing", "publishing"] as const),
  activity: RequiredText,
  now: RequiredText,
});

export const CompletePullRequestPublicationInputSchema = Schema.Struct({
  taskId: RequiredText,
  runId: RequiredText,
  publicationId: RequiredText,
  attempt: PublicationAttempt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
  publicationArtifactKey: RequiredText,
  evidence: PullRequestPublicationEvidenceSchema,
  now: RequiredText,
});

export const FailPullRequestPublicationInputSchema = Schema.Struct({
  taskId: RequiredText,
  runId: RequiredText,
  publicationId: RequiredText,
  attempt: PublicationAttempt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
  publicationArtifactKey: Schema.NullOr(RequiredText),
  failure: PullRequestPublicationFailureSchema,
  now: RequiredText,
});

export const RetryPullRequestPublicationInputSchema = Schema.Struct({
  taskId: RequiredText,
  runId: RequiredText,
  publicationId: RequiredText,
  now: RequiredText,
});
export type RetryPullRequestPublicationInput =
  typeof RetryPullRequestPublicationInputSchema.Type;

export const RepositoryPublicationRequestSchema = Schema.Struct({
  taskId: RequiredText,
  runId: RequiredText,
  publicationId: RequiredText,
  repositoryUrl: RequiredText,
  objective: RequiredText,
  baseSha: Sha,
  patch: Schema.String,
  changedFiles: Schema.Array(RequiredText),
  artifactCreatedAt: RequiredText,
  previousPublication: Schema.NullOr(PullRequestPublicationEvidenceSchema),
});
export type RepositoryPublicationRequest = typeof RepositoryPublicationRequestSchema.Type;

export const PullRequestPublicationWorkflowInputSchema =
  StartPullRequestPublicationInputSchema;
export type PullRequestPublicationWorkflowInput =
  typeof PullRequestPublicationWorkflowInputSchema.Type;

export const PullRequestPublicationArtifactSchema = Schema.Struct({
  version: Schema.Literal(1),
  taskId: RequiredText,
  runId: RequiredText,
  publicationId: RequiredText,
  attempt: PublicationAttempt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
  patchArtifactKey: RequiredText,
  baseSha: Sha,
  createdAt: RequiredText,
  terminal: Schema.Union([
    Schema.Struct({
      status: Schema.Literal("complete"),
      evidence: PullRequestPublicationEvidenceSchema,
    }),
    Schema.Struct({
      status: Schema.Literal("failed"),
      failure: PullRequestPublicationFailureSchema,
    }),
  ]),
});
export type PullRequestPublicationArtifact = typeof PullRequestPublicationArtifactSchema.Type;

export const PullRequestPublicationWorkflowResultSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("complete"),
    taskId: RequiredText,
    runId: RequiredText,
    publicationId: RequiredText,
    attempt: PublicationAttempt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
    publicationArtifactKey: RequiredText,
    evidence: PullRequestPublicationEvidenceSchema,
  }),
  Schema.Struct({
    status: Schema.Literal("failed"),
    taskId: RequiredText,
    runId: RequiredText,
    publicationId: RequiredText,
    attempt: PublicationAttempt.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
    publicationArtifactKey: Schema.NullOr(RequiredText),
    failure: PullRequestPublicationFailureSchema,
  }),
]);
export type PullRequestPublicationWorkflowResult =
  typeof PullRequestPublicationWorkflowResultSchema.Type;

export const pullRequestPublicationArtifactKey = (
  taskId: string,
  runId: string,
  attempt: number,
): string => attempt === 1
  ? `repository-tasks/${taskId}/agent-runs/${runId}/pull-request-publication.json`
  : `repository-tasks/${taskId}/agent-runs/${runId}/pull-request-publication-attempt-${attempt}.json`;

export const pullRequestPublicationWorkflowId = (
  publicationId: string,
  attempt: number,
): string => attempt === 1 ? publicationId : `${publicationId}-attempt-${attempt}`;

export class InvalidPullRequestPublicationData extends Schema.TaggedErrorClass<InvalidPullRequestPublicationData>()(
  "InvalidPullRequestPublicationData",
  { message: Schema.String },
) {}

const decode = <A, I>(schema: Schema.Codec<A, I, never>, message: string) =>
  (input: unknown): Effect.Effect<A, InvalidPullRequestPublicationData> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError(() => new InvalidPullRequestPublicationData({ message })),
    );

export const decodeRepositoryPublicationRequest = decode(
  RepositoryPublicationRequestSchema,
  "Invalid Repository Publication request",
);

export const decodePullRequestPublicationWorkflowInput = decode(
  PullRequestPublicationWorkflowInputSchema,
  "Invalid Pull Request Publication Workflow input",
);

export const decodePullRequestPublicationArtifact = decode(
  PullRequestPublicationArtifactSchema,
  "Stored Pull Request Publication evidence is invalid",
);
