import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const GITHUB_SEGMENT = /^[A-Za-z0-9_.-]+$/;

export class InvalidRepositoryUrl extends Schema.TaggedErrorClass<InvalidRepositoryUrl>()(
  "InvalidRepositoryUrl",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

export class UnsupportedRepository extends Schema.TaggedErrorClass<UnsupportedRepository>()(
  "UnsupportedRepository",
  { message: Schema.String },
) {}

export const PublicGithubRepositorySchema = Schema.Struct({
  owner: RequiredText,
  repository: RequiredText,
  canonicalUrl: RequiredText,
});
export type PublicGithubRepository = typeof PublicGithubRepositorySchema.Type;

export const PackageScriptsSchema = Schema.Record(RequiredText, Schema.String);
export const PackageManifestSchema = Schema.Struct({
  scripts: Schema.optional(PackageScriptsSchema),
});
export type PackageManifest = typeof PackageManifestSchema.Type;

export const RepositoryPackageManagerSchema = Schema.Literals(["bun", "npm"] as const);
export type RepositoryPackageManager = typeof RepositoryPackageManagerSchema.Type;

export const ValidationCommandSchema = Schema.Struct({
  name: RequiredText,
  command: RequiredText,
});
export type ValidationCommand = typeof ValidationCommandSchema.Type;

export const RepositoryValidationPolicySchema = Schema.Struct({
  packageManager: RepositoryPackageManagerSchema,
  installCommand: RequiredText,
  baselineCommand: Schema.NullOr(RequiredText),
  checks: Schema.Array(ValidationCommandSchema),
});
export type RepositoryValidationPolicy = typeof RepositoryValidationPolicySchema.Type;

export const parsePublicGithubRepository = (
  input: string,
): Effect.Effect<PublicGithubRepository, InvalidRepositoryUrl> => Effect.gen(function* () {
  const url = yield* Effect.try({
    try: () => new URL(input.trim()),
    catch: (cause) => new InvalidRepositoryUrl({ message: "Repository URL is malformed", cause }),
  });
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return yield* Effect.fail(new InvalidRepositoryUrl({
      message: "Repository must be a public HTTPS github.com URL without credentials, query, or fragment",
    }));
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    return yield* Effect.fail(new InvalidRepositoryUrl({
      message: "Repository URL must contain exactly an owner and repository",
    }));
  }
  const owner = segments[0]!;
  const repository = segments[1]!.replace(/\.git$/, "");
  if (
    owner.length > 100 ||
    repository.length === 0 ||
    repository.length > 100 ||
    !GITHUB_SEGMENT.test(owner) ||
    !GITHUB_SEGMENT.test(repository) ||
    owner === "." || owner === ".." || repository === "." || repository === ".."
  ) {
    return yield* Effect.fail(new InvalidRepositoryUrl({
      message: "Repository owner or name is invalid",
    }));
  }
  return {
    owner,
    repository,
    canonicalUrl: `https://github.com/${owner}/${repository}`,
  };
});

export const decodePackageManifest = (input: unknown) =>
  Schema.decodeUnknownEffect(PackageManifestSchema)(input).pipe(
    Effect.mapError((cause) => new UnsupportedRepository({
      message: `package.json does not match the supported project shape: ${String(cause)}`,
    })),
  );

export const decodeRepositoryValidationPolicy = (input: unknown) =>
  Schema.decodeUnknownEffect(RepositoryValidationPolicySchema)(input).pipe(
    Effect.mapError(() => new UnsupportedRepository({
      message: "Stored repository validation policy is invalid",
    })),
  );

export const makeValidationPolicy = (input: {
  readonly packageManager: RepositoryPackageManager;
  readonly scripts: Readonly<Record<string, string>>;
}): RepositoryValidationPolicy => {
  const checks: ValidationCommand[] = [];
  if (typeof input.scripts.test === "string" && input.scripts.test.trim().length > 0) {
    checks.push({
      name: "tests",
      command: input.packageManager === "bun" ? "bun test" : "npm test",
    });
  }
  if (typeof input.scripts.typecheck === "string" && input.scripts.typecheck.trim().length > 0) {
    checks.push({
      name: "typecheck",
      command: input.packageManager === "bun" ? "bun run typecheck" : "npm run typecheck",
    });
  }
  if (typeof input.scripts.lint === "string" && input.scripts.lint.trim().length > 0) {
    checks.push({
      name: "lint",
      command: input.packageManager === "bun" ? "bun run lint" : "npm run lint",
    });
  }
  return {
    packageManager: input.packageManager,
    installCommand: input.packageManager === "bun"
      ? "bun install --frozen-lockfile"
      : "npm ci --ignore-scripts=false",
    baselineCommand: checks[0]?.command ?? null,
    checks: checks.slice(0, 3),
  };
};
