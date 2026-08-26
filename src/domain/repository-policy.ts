import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const GITHUB_SEGMENT = /^[A-Za-z0-9_.-]+$/;
const PACKAGE_MANAGER_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+sha(?:224|256|384|512)\.[A-Za-z0-9+/=_-]+)?$/;
const PACKAGE_MANAGER_SPECIFIER =
  /^(bun|npm|pnpm|yarn)@((0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+sha(?:224|256|384|512)\.[A-Za-z0-9+/=_-]+)?)$/;
const CONTAINER_BUN_VERSION = "1.3.12";
const CONTAINER_NPM_VERSION = "10.9.8";
const CONTAINER_PNPM_VERSION = "11.17.0";
const CONTAINER_YARN_CLASSIC_VERSION = "1.22.22";
const REPOSITORY_EXECUTOR = "/usr/local/bin/polyphemus-repository-exec";
export const REPOSITORY_SAFE_BUNFIG_PATH =
  "/workspace/package-manager-config/bunfig.toml";
export const REPOSITORY_SAFE_YARN_RC_FILENAME =
  ".polyphemus-yarnrc.yml";

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

const PackageScriptBodySchema = Schema.String.check(Schema.isMaxLength(16_384));
export const PackageScriptsSchema = Schema.Record(RequiredText, PackageScriptBodySchema);
export const PackageManifestSchema = Schema.Struct({
  packageManager: Schema.optional(RequiredText),
  scripts: Schema.optional(PackageScriptsSchema),
});
export type PackageManifest = typeof PackageManifestSchema.Type;

export const RepositoryPackageManagerSchema = Schema.Literals([
  "bun",
  "npm",
  "pnpm",
  "yarn",
] as const);
export type RepositoryPackageManager = typeof RepositoryPackageManagerSchema.Type;

export const RepositoryLockfileSchema = Schema.Literals([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
] as const);
export type RepositoryLockfile = typeof RepositoryLockfileSchema.Type;

export const RepositoryPackageFileSchema = Schema.Union([
  RepositoryLockfileSchema,
  Schema.Literal(".yarnrc.yml"),
]);
export const RepositoryPackageFilesSchema = Schema.Array(RepositoryPackageFileSchema);
export type RepositoryPackageFile = typeof RepositoryPackageFileSchema.Type;

export const RepositoryYarnModeSchema = Schema.Literals(["classic", "modern"] as const);
export type RepositoryYarnMode = typeof RepositoryYarnModeSchema.Type;

const PackageManagerVersionSchema = Schema.String.check(
  Schema.isPattern(PACKAGE_MANAGER_VERSION_PATTERN),
);

export const RepositoryPackageManagerSelectionSchema = Schema.Struct({
  packageManager: RepositoryPackageManagerSchema,
  packageManagerVersion: PackageManagerVersionSchema,
  lockfile: RepositoryLockfileSchema,
  yarnMode: Schema.NullOr(RepositoryYarnModeSchema),
});
export type RepositoryPackageManagerSelection =
  typeof RepositoryPackageManagerSelectionSchema.Type;

const SafeCommandArgument = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(16_384),
  Schema.isPattern(/^[^\0]+$/),
);
const SafeCommandDisplay = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(65_536),
  Schema.isPattern(/^[^\0\r\n]+$/),
);

export const RepositoryExecutionCommandSchema = Schema.Struct({
  display: SafeCommandDisplay,
  program: Schema.Literals(["bun", "corepack", "/bin/sh"] as const),
  args: Schema.Array(SafeCommandArgument).check(Schema.isMaxLength(16)),
  environment: Schema.Struct({
    YARN_IGNORE_PATH: Schema.optional(Schema.Literal("1")),
    YARN_SCRIPT_SHELL: Schema.optional(Schema.Literal("/bin/sh")),
    YARN_RC_FILENAME: Schema.optional(Schema.Literal(REPOSITORY_SAFE_YARN_RC_FILENAME)),
  }),
});
export type RepositoryExecutionCommand = typeof RepositoryExecutionCommandSchema.Type;

export const RepositoryCheckNameSchema = Schema.Literals(["tests", "typecheck", "lint"] as const);
export type RepositoryCheckName = typeof RepositoryCheckNameSchema.Type;
export const RepositoryPackageScriptSchema = Schema.Literals(["test", "typecheck", "lint"] as const);
export type RepositoryPackageScript = typeof RepositoryPackageScriptSchema.Type;

/** Legacy stored policy decoded only so rolling finalization can reject it explicitly. */
export const ValidationCommandSchema = Schema.Struct({
  name: RequiredText,
  command: RequiredText,
});
export type ValidationCommand = typeof ValidationCommandSchema.Type;

const LegacyRepositoryValidationPolicySchema = Schema.Struct({
  packageManager: RepositoryPackageManagerSchema,
  installCommand: RequiredText,
  baselineCommand: Schema.NullOr(RequiredText),
  checks: Schema.Array(ValidationCommandSchema),
});

export const RepositoryValidationCheckSchema = Schema.Struct({
  name: RepositoryCheckNameSchema,
  packageScript: RepositoryPackageScriptSchema,
  expectedScript: PackageScriptBodySchema,
  command: RepositoryExecutionCommandSchema,
});
export type RepositoryValidationCheck = typeof RepositoryValidationCheckSchema.Type;

export const RepositoryValidationPolicyV2Schema = Schema.Struct({
  version: Schema.Literal(2),
  selection: RepositoryPackageManagerSelectionSchema,
  install: RepositoryExecutionCommandSchema,
  baseline: Schema.NullOr(RepositoryCheckNameSchema),
  checks: Schema.Array(RepositoryValidationCheckSchema).check(Schema.isMaxLength(3)),
});
export type RepositoryValidationPolicyV2 = typeof RepositoryValidationPolicyV2Schema.Type;

export const RepositoryValidationPolicySchema = Schema.Union([
  LegacyRepositoryValidationPolicySchema,
  RepositoryValidationPolicyV2Schema,
]);
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

export const decodeRepositoryPackageFiles = (input: unknown) =>
  Schema.decodeUnknownEffect(RepositoryPackageFilesSchema)(input).pipe(
    Effect.mapError(() => new UnsupportedRepository({
      message: "Repository package-manager files could not be identified safely",
    })),
  );

const lockfileFor = (
  packageManager: RepositoryPackageManager,
  files: ReadonlySet<RepositoryPackageFile>,
): RepositoryLockfile | null => {
  switch (packageManager) {
    case "bun":
      return files.has("bun.lock") ? "bun.lock" : files.has("bun.lockb") ? "bun.lockb" : null;
    case "npm":
      return files.has("package-lock.json") ? "package-lock.json" : null;
    case "pnpm":
      return files.has("pnpm-lock.yaml") ? "pnpm-lock.yaml" : null;
    case "yarn":
      return files.has("yarn.lock") ? "yarn.lock" : null;
  }
};

const defaultPackageManagerVersion = (
  packageManager: RepositoryPackageManager,
): string => {
  switch (packageManager) {
    case "bun":
      return CONTAINER_BUN_VERSION;
    case "npm":
      return CONTAINER_NPM_VERSION;
    case "pnpm":
      return CONTAINER_PNPM_VERSION;
    case "yarn":
      return CONTAINER_YARN_CLASSIC_VERSION;
  }
};

const selectionIsConsistent = (selection: RepositoryPackageManagerSelection): boolean => {
  const expectedLockfiles: Readonly<Record<RepositoryPackageManager, readonly RepositoryLockfile[]>> = {
    bun: ["bun.lock", "bun.lockb"],
    npm: ["package-lock.json"],
    pnpm: ["pnpm-lock.yaml"],
    yarn: ["yarn.lock"],
  };
  const major = Number(selection.packageManagerVersion.split(".", 1)[0]);
  const expectedYarnMode = selection.packageManager === "yarn"
    ? major === 1 ? "classic" : major >= 2 ? "modern" : null
    : null;
  return expectedLockfiles[selection.packageManager].includes(selection.lockfile) &&
    selection.yarnMode === expectedYarnMode &&
    (selection.packageManager !== "bun" ||
      selection.packageManagerVersion === CONTAINER_BUN_VERSION);
};

export const selectRepositoryPackageManager = (
  manifest: PackageManifest,
  packageFiles: readonly RepositoryPackageFile[],
): Effect.Effect<RepositoryPackageManagerSelection, UnsupportedRepository> => Effect.gen(function* () {
  const files = new Set(packageFiles);
  if (files.has("bun.lock") && files.has("bun.lockb")) {
    return yield* Effect.fail(new UnsupportedRepository({
      message: "Repository contains both Bun lockfile formats",
    }));
  }

  const declared = manifest.packageManager;
  if (declared !== undefined) {
    const match = PACKAGE_MANAGER_SPECIFIER.exec(declared);
    if (match === null) {
      return yield* Effect.fail(new UnsupportedRepository({
        message: "package.json packageManager must select Bun, npm, pnpm, or Yarn at an exact version",
      }));
    }
    const packageManager = match[1] as RepositoryPackageManager;
    const packageManagerVersion = match[2]!;
    const lockfile = lockfileFor(packageManager, files);
    if (lockfile === null) {
      return yield* Effect.fail(new UnsupportedRepository({
        message: "package.json packageManager does not match a committed lockfile",
      }));
    }
    const major = Number(match[3]);
    if (packageManager === "yarn" && major === 0) {
      return yield* Effect.fail(new UnsupportedRepository({
        message: "The declared Yarn version is unsupported",
      }));
    }
    if (packageManager === "bun" && packageManagerVersion !== CONTAINER_BUN_VERSION) {
      return yield* Effect.fail(new UnsupportedRepository({
        message: `Bun repositories must use the supported ${CONTAINER_BUN_VERSION} runtime`,
      }));
    }
    return {
      packageManager,
      packageManagerVersion,
      lockfile,
      yarnMode: packageManager === "yarn"
        ? major === 1 ? "classic" : "modern"
        : null,
    };
  }

  const candidates = (["bun", "npm", "pnpm", "yarn"] as const)
    .flatMap((packageManager) => {
      const lockfile = lockfileFor(packageManager, files);
      return lockfile === null ? [] : [{ packageManager, lockfile }];
    });
  if (candidates.length !== 1) {
    return yield* Effect.fail(new UnsupportedRepository({
      message: candidates.length === 0
        ? "Repository must contain a supported package-manager lockfile"
        : "Repository has conflicting lockfiles and must declare packageManager explicitly",
    }));
  }
  const [{ packageManager, lockfile }] = candidates;
  if (packageManager === "yarn") {
    return yield* Effect.fail(new UnsupportedRepository({
      message: "Yarn repositories must declare an exact packageManager version",
    }));
  }
  return {
    packageManager,
    packageManagerVersion: defaultPackageManagerVersion(packageManager),
    lockfile,
    yarnMode: null,
  };
});

const packageManagerExecutionCommand = (
  selection: RepositoryPackageManagerSelection,
  args: readonly string[],
): RepositoryExecutionCommand => {
  const yarnEnvironment = selection.packageManager === "yarn"
    ? {
        YARN_IGNORE_PATH: "1" as const,
        ...(selection.yarnMode === "classic"
          ? { YARN_SCRIPT_SHELL: "/bin/sh" as const }
          : { YARN_RC_FILENAME: REPOSITORY_SAFE_YARN_RC_FILENAME }),
      }
    : {};
  const program = selection.packageManager === "bun" ? "bun" as const : "corepack" as const;
  const commandArgs = selection.packageManager === "bun"
    ? [...args]
    : [`${selection.packageManager}@${selection.packageManagerVersion}`, ...args];
  const prefix = selection.packageManager === "yarn"
    ? selection.yarnMode === "classic"
      ? "YARN_IGNORE_PATH=1 YARN_SCRIPT_SHELL=/bin/sh "
      : `YARN_IGNORE_PATH=1 YARN_RC_FILENAME=${REPOSITORY_SAFE_YARN_RC_FILENAME} `
    : "";
  return {
    display: `${prefix}${program} ${commandArgs.join(" ")}`,
    program,
    args: commandArgs,
    environment: yarnEnvironment,
  };
};

const installExecutionCommand = (
  selection: RepositoryPackageManagerSelection,
): RepositoryExecutionCommand => {
  switch (selection.packageManager) {
    case "bun":
      return packageManagerExecutionCommand(selection, [
        `--config=${REPOSITORY_SAFE_BUNFIG_PATH}`,
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--cwd",
        "/workspace/repository",
      ]);
    case "npm":
      return packageManagerExecutionCommand(selection, ["ci", "--ignore-scripts"]);
    case "pnpm":
      return packageManagerExecutionCommand(selection, [
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--ignore-pnpmfile",
      ]);
    case "yarn":
      return packageManagerExecutionCommand(selection, selection.yarnMode === "modern"
        ? ["install", "--immutable", "--mode=skip-build"]
        : ["install", "--frozen-lockfile", "--ignore-scripts"]);
  }
};

const checkExecutionCommand = (
  expectedScript: string,
): RepositoryExecutionCommand => ({
  display: `/bin/sh -c ${JSON.stringify(expectedScript)}`,
  program: "/bin/sh",
  args: ["-c", expectedScript],
  environment: {},
});

const commandsEqual = (
  left: RepositoryExecutionCommand,
  right: RepositoryExecutionCommand,
): boolean => left.display === right.display &&
  left.program === right.program &&
  left.args.length === right.args.length &&
  left.args.every((argument, index) => argument === right.args[index]) &&
  left.environment.YARN_IGNORE_PATH === right.environment.YARN_IGNORE_PATH &&
  left.environment.YARN_SCRIPT_SHELL === right.environment.YARN_SCRIPT_SHELL &&
  left.environment.YARN_RC_FILENAME === right.environment.YARN_RC_FILENAME;

const packageScriptForCheck = (name: RepositoryCheckName): RepositoryPackageScript =>
  name === "tests" ? "test" : name;

const policyV2IsConsistent = (policy: RepositoryValidationPolicyV2): boolean => {
  if (!selectionIsConsistent(policy.selection) ||
      !commandsEqual(policy.install, installExecutionCommand(policy.selection))) return false;
  const names = new Set(policy.checks.map((check) => check.name));
  return names.size === policy.checks.length &&
    policy.checks.every((check) =>
      check.packageScript === packageScriptForCheck(check.name) &&
      substantivePackageScript(check.expectedScript) &&
      commandsEqual(
        check.command,
        checkExecutionCommand(check.expectedScript),
      )) &&
    (policy.baseline === null || names.has(policy.baseline));
};

const legacyPolicyIsConsistent = (
  policy: typeof LegacyRepositoryValidationPolicySchema.Type,
): boolean => {
  if (policy.packageManager !== "bun" && policy.packageManager !== "npm") return false;
  const expectedInstall = policy.packageManager === "bun"
    ? "bun install --frozen-lockfile"
    : "npm ci --ignore-scripts=false";
  const expectedNames = ["tests", "typecheck", "lint"] as const;
  const commandFor = (name: typeof expectedNames[number]): string => {
    if (policy.packageManager === "bun") {
      return name === "tests" ? "bun test" : `bun run ${name}`;
    }
    return name === "tests" ? "npm test" : `npm run ${name}`;
  };
  let previousIndex = -1;
  const names = new Set<string>();
  for (const check of policy.checks) {
    const index = expectedNames.indexOf(check.name as typeof expectedNames[number]);
    if (index <= previousIndex || index < 0 || names.has(check.name) ||
        check.command !== commandFor(expectedNames[index]!)) return false;
    previousIndex = index;
    names.add(check.name);
  }
  return policy.installCommand === expectedInstall && policy.checks.length <= 3 &&
    policy.baselineCommand === (policy.checks[0]?.command ?? null);
};

export const decodeRepositoryValidationPolicy = (input: unknown) => {
  const hasVersion = typeof input === "object" && input !== null && "version" in input;
  const decoded: Effect.Effect<RepositoryValidationPolicy, unknown> = hasVersion
    ? Schema.decodeUnknownEffect(RepositoryValidationPolicyV2Schema)(input).pipe(
        Effect.flatMap((policy) => policyV2IsConsistent(policy)
          ? Effect.succeed(policy)
          : Effect.fail(new UnsupportedRepository({
              message: "Stored repository validation policy is internally inconsistent",
            }))),
      )
    : Schema.decodeUnknownEffect(LegacyRepositoryValidationPolicySchema)(input).pipe(
        Effect.flatMap((policy) => legacyPolicyIsConsistent(policy)
          ? Effect.succeed(policy)
          : Effect.fail(new UnsupportedRepository({
              message: "Stored legacy validation policy is internally inconsistent",
            }))),
      );
  return decoded.pipe(
    Effect.mapError((error) => error instanceof UnsupportedRepository
      ? error
      : new UnsupportedRepository({ message: "Stored repository validation policy is invalid" })),
  );
};

function substantivePackageScript(script: string): boolean {
  const normalized = script.trim().replace(/;+$/, "").trim().toLowerCase();
  return normalized.length > 0 &&
    !/^(?::|true|exit\s+0|(?:echo|printf)(?:\s+.*)?)$/.test(normalized) &&
    !/^node\s+(?:--eval|-e)\s+["']?(?:process\.)?exit\(0\);?["']?$/.test(normalized);
}

export const makeValidationPolicy = (input: {
  readonly selection: RepositoryPackageManagerSelection;
  readonly scripts: Readonly<Record<string, string>>;
}): RepositoryValidationPolicyV2 => {
  const checks: RepositoryValidationCheck[] = [];
  for (const [packageScript, name] of [
    ["test", "tests"],
    ["typecheck", "typecheck"],
    ["lint", "lint"],
  ] as const) {
    const expectedScript = input.scripts[packageScript];
    if (typeof expectedScript === "string" && substantivePackageScript(expectedScript)) {
      checks.push({
        name,
        packageScript,
        expectedScript,
        command: checkExecutionCommand(expectedScript),
      });
    }
  }
  return {
    version: 2,
    selection: input.selection,
    install: installExecutionCommand(input.selection),
    baseline: checks[0]?.name ?? null,
    checks: checks.slice(0, 3),
  };
};

const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;

export const renderRepositoryExecutionCommand = (
  command: RepositoryExecutionCommand,
): string => {
  const environment = [
    command.environment.YARN_IGNORE_PATH === "1" ? "YARN_IGNORE_PATH='1'" : "",
    command.environment.YARN_SCRIPT_SHELL === "/bin/sh"
      ? "YARN_SCRIPT_SHELL='/bin/sh'"
      : "",
    command.environment.YARN_RC_FILENAME === REPOSITORY_SAFE_YARN_RC_FILENAME
      ? `YARN_RC_FILENAME='${REPOSITORY_SAFE_YARN_RC_FILENAME}'`
      : "",
  ].filter(Boolean).join(" ");
  return `${environment.length > 0 ? `${environment} ` : ""}${[
    REPOSITORY_EXECUTOR,
    command.program,
    ...command.args,
  ].map(shellQuote).join(" ")}`;
};
