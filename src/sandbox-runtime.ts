import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { issueModelProxyToken } from "./domain/model-proxy-token.ts";
import {
  decodePackageManifest,
  decodeRepositoryPackageFiles,
  decodeRepositoryValidationPolicy,
  makeValidationPolicy,
  parsePublicGithubRepository,
  renderRepositoryExecutionCommand,
  REPOSITORY_SAFE_BUNFIG_PATH,
  REPOSITORY_SAFE_YARN_RC_FILENAME,
  selectRepositoryPackageManager,
  type RepositoryValidationPolicy,
} from "./domain/repository-policy.ts";
import {
  decodePiActivityEvent,
  decodePiRunResult,
  decodeSandboxRunStartRequest,
  decodeSandboxProcessRequest,
  InvalidSandboxRequest,
  type PiActivityEvent,
  type SandboxCancelResult,
  type SandboxRunResult,
  SandboxOperationFailed,
  type SandboxRunStartResult,
  SandboxProcessStatusSchema,
  type SandboxProcessStatusResult,
  type ValidationResult,
} from "./domain/sandbox-run.ts";
import { HELD_OUT_TEST_SOURCE } from "./held-out-test.ts";
import {
  AGENT_STATE_DIR,
  BASE_SHA_PATH,
  CONTROL_DIR,
  FIXTURE_REPOSITORY,
  GIT_EVIDENCE_DIR,
  GIT_EVIDENCE_INDEX,
  GIT_EVIDENCE_OBJECTS,
  GIT_METADATA_DIR,
  HELD_OUT_DIR,
  HELD_OUT_TEST_PATH,
  MAX_EXCERPT_CHARACTERS,
  MODEL_PROXY_TOKEN_PATH,
  PACKAGE_MANAGER_CONFIG_DIR,
  PI_RESULT_PATH,
  REPOSITORY_DIR,
  REPOSITORY_URL_PATH,
  RESULT_DIR,
  VALIDATION_POLICY_PATH,
} from "./sandbox-config.ts";

const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));
const SandboxExecResultSchema = Schema.Struct({
  success: Schema.Boolean,
  exitCode: Schema.Number.check(Schema.isInt()),
  stdout: Schema.String,
  stderr: Schema.String,
  command: Schema.String,
  duration: NonNegativeNumber,
  timestamp: Schema.String,
  sessionId: Schema.optional(Schema.String),
});
type ExecResult = typeof SandboxExecResultSchema.Type;

const SandboxReadFileResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  path: Schema.String,
  content: Schema.String,
  timestamp: Schema.String,
  exitCode: Schema.optional(Schema.Number.check(Schema.isInt())),
  encoding: Schema.optional(Schema.Literals(["utf-8", "base64"] as const)),
  isBinary: Schema.optional(Schema.Boolean),
  mimeType: Schema.optional(Schema.String),
  size: Schema.optional(NonNegativeNumber),
});

const SandboxProcessLogsSchema = Schema.Struct({
  stdout: Schema.String,
  stderr: Schema.String,
});
type SandboxProcessLogs = typeof SandboxProcessLogsSchema.Type;

const SandboxMkdirResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  path: Schema.String,
  recursive: Schema.Boolean,
  timestamp: Schema.String,
  exitCode: Schema.optional(Schema.Number.check(Schema.isInt())),
});
const SandboxWriteFileResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  path: Schema.String,
  timestamp: Schema.String,
  exitCode: Schema.optional(Schema.Number.check(Schema.isInt())),
});
const SandboxGitCheckoutResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  repoUrl: Schema.String,
  branch: Schema.String,
  targetDir: Schema.String,
  timestamp: Schema.String,
  exitCode: Schema.optional(Schema.Number.check(Schema.isInt())),
});
const SandboxProcessViewSchema = Schema.Struct({
  id: Schema.String,
  command: Schema.String,
  status: Schema.Literals([
    "starting",
    "running",
    "completed",
    "failed",
    "killed",
    "error",
  ] as const),
});
const StoredValidationPolicyEnvelopeSchema = Schema.Struct({
  version: Schema.Literal(1),
  policy: Schema.Unknown,
  authentication: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
});

interface SandboxProcess {
  readonly id: string;
  readonly command: string;
  readonly status: unknown;
  readonly getLogs: () => Promise<unknown>;
  readonly getStatus: () => Promise<unknown>;
  readonly kill: (signal: string) => Promise<void>;
}

interface SandboxStub {
  readonly configure?: (configuration: unknown) => Promise<void>;
  readonly mkdir: (path: string, options?: unknown) => Promise<unknown>;
  readonly gitCheckout: (repository: string, options?: unknown) => Promise<unknown>;
  readonly exec: (command: string, options?: unknown) => Promise<unknown>;
  readonly writeFile: (path: string, content: string, options?: unknown) => Promise<unknown>;
  readonly readFile: (path: string, options?: unknown) => Promise<unknown>;
  readonly startProcess: (command: string, options?: unknown) => Promise<unknown>;
  readonly getProcess: (processId: string) => Promise<unknown>;
  readonly destroy: () => Promise<void>;
}

interface SandboxNamespace {
  readonly getByName: (name: string) => SandboxStub;
}

export interface SandboxRuntimeEnv {
  readonly Sandbox: SandboxNamespace;
  readonly MODEL_PROXY_ORIGIN: string;
  readonly SANDBOX_API_TOKEN: string;
}

const json = (value: unknown, init?: ResponseInit): Response => Response.json(value, init);
const excerpt = (value: string): string => value.slice(0, MAX_EXCERPT_CHARACTERS);
const REPOSITORY_EXECUTOR = "/usr/local/bin/polyphemus-repository-exec";
const REPOSITORY_CLEANUP = "/usr/local/bin/polyphemus-repository-cleanup";
const AGENT_EXECUTOR = "/usr/local/bin/polyphemus-agent-exec";
const COREPACK_HOME = "/var/lib/polyphemus-corepack";
const RUNNER_DIR = "/opt/polyphemus";
const SAFE_YARN_RC_PATH = `${REPOSITORY_DIR}/${REPOSITORY_SAFE_YARN_RC_FILENAME}`;
const SAFE_YARN_RC_SOURCE = [
  "nodeLinker: node-modules",
  "enableScripts: false",
  "enableTelemetry: false",
  "",
].join("\n");
const REPOSITORY_UID = 10_001;
const AGENT_UID = 10_002;
const WORKSPACE_GID = 20_000;
const SAFE_GIT_ARGS = [
  `--git-dir=${GIT_METADATA_DIR}`,
  `--work-tree=${REPOSITORY_DIR}`,
  "--no-replace-objects",
  "-c", `safe.directory=${REPOSITORY_DIR}`,
  "-c", "core.hooksPath=/dev/null",
  "-c", "core.fsmonitor=false",
  "-c", "core.pager=cat",
  "-c", "diff.external=",
] as const;
const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;
const repositoryCommand = (program: string, args: readonly string[]): string =>
  [REPOSITORY_EXECUTOR, program, ...args].map(shellQuote).join(" ");
const repositoryGitCommand = (args: readonly string[]): string =>
  repositoryCommand("git", [...SAFE_GIT_ARGS, ...args]);
const evidenceGitCommand = (args: readonly string[]): string => [
  `GIT_INDEX_FILE=${shellQuote(GIT_EVIDENCE_INDEX)}`,
  `GIT_OBJECT_DIRECTORY=${shellQuote(GIT_EVIDENCE_OBJECTS)}`,
  `GIT_ALTERNATE_OBJECT_DIRECTORIES=${shellQuote(`${GIT_METADATA_DIR}/objects`)}`,
  repositoryGitCommand(args),
].join(" ");
const validationPolicyAuthenticationInput = (
  sandboxId: string,
  policy: unknown,
): ArrayBuffer => new TextEncoder().encode(
  `polyphemus-validation-policy-v1\0${sandboxId}\0${JSON.stringify(policy)}`,
).buffer as ArrayBuffer;

const validationPolicyKey = (secret: string): Promise<CryptoKey> => crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

const encodeBase64Url = (value: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const decodeBase64Url = (value: string): ArrayBuffer => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(`${base64}${"=".repeat((4 - base64.length % 4) % 4)}`);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
};

export const signValidationPolicy = (
  secret: string,
  sandboxId: string,
  policy: RepositoryValidationPolicy,
) => Effect.tryPromise({
  try: async () => encodeBase64Url(await crypto.subtle.sign(
    "HMAC",
    await validationPolicyKey(secret),
    validationPolicyAuthenticationInput(sandboxId, policy),
  )),
  catch: (cause) => SandboxOperationFailed.fromUnknown("authenticate-validation-policy", cause),
});

interface DecodedStoredValidationPolicy {
  readonly policy: RepositoryValidationPolicy;
  readonly storage: "legacy" | "current";
}

const decodeStoredValidationPolicyWithFormat = (
  secret: string,
  sandboxId: string,
  input: unknown,
): Effect.Effect<DecodedStoredValidationPolicy, SandboxOperationFailed> => Effect.gen(function* () {
  const versioned = typeof input === "object" && input !== null && "version" in input;
  if (!versioned) {
    const legacy = yield* decodeRepositoryValidationPolicy(input).pipe(
      Effect.mapError((cause) => SandboxOperationFailed.fromUnknown(
        "decode-validation-policy",
        cause,
      )),
    );
    if ("version" in legacy) {
      return yield* Effect.fail(new SandboxOperationFailed({
        operation: "decode-validation-policy",
        message: "Unsigned versioned validation policy is not accepted",
      }));
    }
    return { policy: legacy, storage: "legacy" as const };
  }

  const envelope = yield* Schema.decodeUnknownEffect(StoredValidationPolicyEnvelopeSchema)(input).pipe(
    Effect.mapError((cause) => SandboxOperationFailed.fromUnknown(
      "decode-validation-policy-envelope",
      cause,
    )),
  );
  const authenticated = yield* Effect.tryPromise({
    try: async () => crypto.subtle.verify(
      "HMAC",
      await validationPolicyKey(secret),
      decodeBase64Url(envelope.authentication),
      validationPolicyAuthenticationInput(sandboxId, envelope.policy),
    ),
    catch: (cause) => SandboxOperationFailed.fromUnknown(
      "authenticate-validation-policy",
      cause,
    ),
  });
  if (!authenticated) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "authenticate-validation-policy",
      message: "Stored validation policy authentication failed",
    }));
  }
  const policy = yield* decodeRepositoryValidationPolicy(envelope.policy).pipe(
    Effect.mapError((cause) => SandboxOperationFailed.fromUnknown(
      "decode-validation-policy",
      cause,
    )),
  );
  if (!("version" in policy)) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "decode-validation-policy",
      message: "Authenticated validation policy must use the current format",
    }));
  }
  return { policy, storage: "current" as const };
});

export const decodeStoredValidationPolicy = (
  secret: string,
  sandboxId: string,
  input: unknown,
): Effect.Effect<RepositoryValidationPolicy, SandboxOperationFailed> =>
  decodeStoredValidationPolicyWithFormat(secret, sandboxId, input).pipe(
    Effect.map(({ policy }) => policy),
  );

const sandboxEffect = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => SandboxOperationFailed.fromUnknown(operation, cause),
  });

const requestJson = (request: Request) =>
  Effect.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: (cause) => new InvalidSandboxRequest({ message: "Request body must be JSON", cause }),
  });

const parseEvents = (stdout: string): readonly PiActivityEvent[] => {
  const events: PiActivityEvent[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const decoded = decodePiActivityEvent(JSON.parse(line) as unknown);
      if (Option.isSome(decoded)) events.push(decoded.value);
    } catch {
      // Raw provider, model, and process lines are deliberately not product events.
    }
  }
  return events;
};

const getRunSandbox = (env: SandboxRuntimeEnv, sandboxId: string): SandboxStub =>
  env.Sandbox.getByName(sandboxId);

const configureRunSandbox = (sandbox: SandboxStub) => sandboxEffect(
  "configure-sandbox",
  () => sandbox.configure === undefined
    ? Promise.resolve()
    : sandbox.configure({
        transport: "rpc",
        keepAlive: true,
        labels: { application: "polyphemus", workload: "agent-run" },
      }),
);

const validSandboxId = (sandboxId: string): boolean =>
  /^sandbox-[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(sandboxId);

const validateRunRequest = (input: {
  readonly sandboxId: string;
  readonly repositoryUrl: string;
  readonly expectedBaseSha?: string;
}) => Effect.gen(function* () {
  if (!validSandboxId(input.sandboxId)) {
    return yield* Effect.fail(new InvalidSandboxRequest({
      message: "sandboxId must be a lowercase sandbox-* identifier",
    }));
  }
  const repository = yield* parsePublicGithubRepository(input.repositoryUrl).pipe(
    Effect.mapError((error) => new InvalidSandboxRequest({ message: error.message, cause: error })),
  );
  if (input.expectedBaseSha !== undefined && !/^[0-9a-f]{40}$/.test(input.expectedBaseSha)) {
    return yield* Effect.fail(new InvalidSandboxRequest({
      message: "expectedBaseSha must be a full lowercase Git revision",
    }));
  }
  return repository;
});

const malformedSandboxResult = (operation: string, cause: unknown) =>
  new SandboxOperationFailed({
    operation,
    message: "Sandbox returned a malformed operation result",
    cause,
  });

export const decodeSandboxExecResult = (
  operation: string,
  input: unknown,
  expectedCommand?: string,
) => Schema.decodeUnknownEffect(SandboxExecResultSchema)(input).pipe(
  Effect.flatMap((result) => result.success === (result.exitCode === 0) &&
      (expectedCommand === undefined || result.command === expectedCommand)
    ? Effect.succeed(result)
    : Effect.fail(malformedSandboxResult(operation, "command result is inconsistent"))),
  Effect.mapError((cause) => cause instanceof SandboxOperationFailed
    ? cause
    : malformedSandboxResult(operation, cause)),
);

export const decodeSandboxReadFileResult = (
  operation: string,
  input: unknown,
  expectedPath?: string,
) => Schema.decodeUnknownEffect(SandboxReadFileResultSchema)(input).pipe(
  Effect.flatMap((result) => result.encoding !== "base64" && result.isBinary !== true &&
      (expectedPath === undefined || result.path === expectedPath)
    ? Effect.succeed(result)
    : Effect.fail(malformedSandboxResult(operation, "file result is not the requested text file"))),
  Effect.mapError((cause) => cause instanceof SandboxOperationFailed
    ? cause
    : malformedSandboxResult(operation, cause)),
);

const decodeSandboxProcessLogs = (operation: string, input: unknown) =>
  Schema.decodeUnknownEffect(SandboxProcessLogsSchema)(input).pipe(
    Effect.mapError((cause) => malformedSandboxResult(operation, cause)),
  );

const exec = (
  sandbox: ReturnType<typeof getRunSandbox>,
  operation: string,
  command: string,
  options?: { readonly cwd?: string; readonly timeout?: number },
) => sandboxEffect(operation, () => sandbox.exec(command, options)).pipe(
  Effect.flatMap((result) => decodeSandboxExecResult(operation, result, command)),
);

const stopRepositoryProcesses = (
  sandbox: ReturnType<typeof getRunSandbox>,
  operation: string,
) => Effect.gen(function* () {
  const result = yield* exec(sandbox, operation, shellQuote(REPOSITORY_CLEANUP), {
    timeout: 10_000,
  });
  if (!result.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation,
      message: excerpt(result.stderr || result.stdout || "Repository subprocess cleanup failed"),
    }));
  }
});

const stopAgentProcesses = (
  sandbox: ReturnType<typeof getRunSandbox>,
  operation: string,
) => exec(
  sandbox,
  operation,
  "/usr/bin/pkill -KILL -u 10002 >/dev/null 2>&1 || true",
  { timeout: 10_000 },
).pipe(Effect.asVoid);

const readTextFile = (
  sandbox: ReturnType<typeof getRunSandbox>,
  operation: string,
  path: string,
) => sandboxEffect(operation, () => sandbox.readFile(path)).pipe(
  Effect.flatMap((result) => decodeSandboxReadFileResult(operation, result, path)),
  Effect.map((result) => result.content),
);

const readProcessLogs = (
  operation: string,
  process: SandboxProcess,
): Effect.Effect<SandboxProcessLogs, SandboxOperationFailed> =>
  sandboxEffect(operation, () => process.getLogs()).pipe(
    Effect.flatMap((result) => decodeSandboxProcessLogs(operation, result)),
  );

const createDirectory = (
  sandbox: SandboxStub,
  operation: string,
  path: string,
) => sandboxEffect(operation, () => sandbox.mkdir(path, { recursive: true })).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(SandboxMkdirResultSchema)),
  Effect.flatMap((result) => result.path === path && result.recursive
    ? Effect.succeed(result)
    : Effect.fail(malformedSandboxResult(operation, "directory result is inconsistent"))),
  Effect.mapError((cause) => cause instanceof SandboxOperationFailed
    ? cause
    : malformedSandboxResult(operation, cause)),
);

const writeTextFile = (
  sandbox: SandboxStub,
  operation: string,
  path: string,
  content: string,
) => sandboxEffect(operation, () => sandbox.writeFile(path, content)).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(SandboxWriteFileResultSchema)),
  Effect.flatMap((result) => result.path === path
    ? Effect.succeed(result)
    : Effect.fail(malformedSandboxResult(operation, "write result path is inconsistent"))),
  Effect.mapError((cause) => cause instanceof SandboxOperationFailed
    ? cause
    : malformedSandboxResult(operation, cause)),
);

const cloneRepository = (
  sandbox: SandboxStub,
  repositoryUrl: string,
) => sandboxEffect("clone-repository", () => sandbox.gitCheckout(repositoryUrl, {
  targetDir: REPOSITORY_DIR,
  depth: 1,
  cloneTimeoutMs: 120_000,
})).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(SandboxGitCheckoutResultSchema)),
  Effect.flatMap((result) => result.repoUrl === repositoryUrl && result.targetDir === REPOSITORY_DIR
    ? Effect.succeed(result)
    : Effect.fail(malformedSandboxResult("clone-repository", "checkout result is inconsistent"))),
  Effect.mapError((cause) => cause instanceof SandboxOperationFailed
    ? cause
    : malformedSandboxResult("clone-repository", cause)),
);

const decodeSandboxProcess = (
  operation: string,
  input: unknown,
  expectedProcessId?: string,
  expectedCommand?: string,
): Effect.Effect<SandboxProcess, SandboxOperationFailed> =>
  Schema.decodeUnknownEffect(SandboxProcessViewSchema)(input).pipe(
    Effect.flatMap((view) => {
      const candidate = input as Record<PropertyKey, unknown>;
      return (expectedProcessId === undefined || view.id === expectedProcessId) &&
          (expectedCommand === undefined || view.command === expectedCommand) &&
          typeof candidate.getLogs === "function" &&
          typeof candidate.getStatus === "function" &&
          typeof candidate.kill === "function"
        ? Effect.succeed(input as SandboxProcess)
        : Effect.fail(malformedSandboxResult(operation, "process result is inconsistent"));
    }),
    Effect.mapError((cause) => cause instanceof SandboxOperationFailed
      ? cause
      : malformedSandboxResult(operation, cause)),
  );

const startSandboxProcess = (
  sandbox: SandboxStub,
  processId: string,
  command: string,
  options: unknown,
) => sandboxEffect("start-pi-runner", () => sandbox.startProcess(command, options)).pipe(
  Effect.flatMap((process) => decodeSandboxProcess(
    "start-pi-runner",
    process,
    processId,
    command,
  )),
);

const getSandboxProcess = (
  sandbox: SandboxStub,
  operation: string,
  processId: string,
) => sandboxEffect(operation, () => sandbox.getProcess(processId)).pipe(
  Effect.flatMap((process) => process === null
    ? Effect.succeed(null)
    : decodeSandboxProcess(operation, process, processId)),
);

const decodeProcessStatus = (input: unknown) =>
  Schema.decodeUnknownEffect(SandboxProcessStatusSchema)(input).pipe(
    Effect.mapError((cause) => SandboxOperationFailed.fromUnknown("decode-process-status", cause)),
  );

const validationResult = (name: string, command: string, result: ExecResult): ValidationResult => ({
  name,
  command,
  exitCode: result.exitCode,
  passed: result.exitCode === 0,
  durationMs: result.duration,
  stdoutExcerpt: excerpt(result.stdout),
  stderrExcerpt: excerpt(result.stderr),
});

const startRun = (request: Request, env: SandboxRuntimeEnv) => Effect.gen(function* () {
  const input = yield* requestJson(request).pipe(Effect.flatMap(decodeSandboxRunStartRequest));
  const repository = yield* validateRunRequest(input);

  const sandbox = getRunSandbox(env, input.sandboxId);
  yield* configureRunSandbox(sandbox);
  yield* createDirectory(sandbox, "create-control-directory", CONTROL_DIR);
  yield* createDirectory(sandbox, "create-result-directory", RESULT_DIR);
  yield* createDirectory(
    sandbox,
    "create-package-manager-config-directory",
    PACKAGE_MANAGER_CONFIG_DIR,
  );
  yield* writeTextFile(
    sandbox,
    "write-safe-bun-config",
    REPOSITORY_SAFE_BUNFIG_PATH,
    "",
  );
  yield* cloneRepository(sandbox, repository.canonicalUrl);
  const reservedYarnConfig = yield* exec(
    sandbox,
    "reserve-safe-yarn-config",
    `test ! -e ${shellQuote(SAFE_YARN_RC_PATH)} && test ! -L ${shellQuote(SAFE_YARN_RC_PATH)}`,
    { timeout: 30_000 },
  );
  if (!reservedYarnConfig.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "reserve-safe-yarn-config",
      message: "Repository conflicts with the reserved validation configuration path",
    }));
  }
  yield* writeTextFile(
    sandbox,
    "write-safe-yarn-config",
    SAFE_YARN_RC_PATH,
    SAFE_YARN_RC_SOURCE,
  );
  const prepareRepository = [
    `test ! -e ${shellQuote(GIT_METADATA_DIR)}`,
    `mv ${shellQuote(`${REPOSITORY_DIR}/.git`)} ${shellQuote(GIT_METADATA_DIR)}`,
    `chown -R 0:${WORKSPACE_GID} ${shellQuote(GIT_METADATA_DIR)}`,
    `chmod -R u=rwX,g=rX,o= ${shellQuote(GIT_METADATA_DIR)}`,
    `chown -R ${REPOSITORY_UID}:${WORKSPACE_GID} ${shellQuote(REPOSITORY_DIR)}`,
    `chmod -R u+rwX,g+rwX,o-rwx ${shellQuote(REPOSITORY_DIR)}`,
    `find ${shellQuote(REPOSITORY_DIR)} -type d -exec chmod g+s {} +`,
    `chown 0:${WORKSPACE_GID} ${shellQuote(REPOSITORY_DIR)} ${shellQuote(SAFE_YARN_RC_PATH)}`,
    `chmod 3770 ${shellQuote(REPOSITORY_DIR)}`,
    `chmod 0440 ${shellQuote(SAFE_YARN_RC_PATH)}`,
    `test -d ${shellQuote(PACKAGE_MANAGER_CONFIG_DIR)}`,
    `test ! -L ${shellQuote(PACKAGE_MANAGER_CONFIG_DIR)}`,
    `test -f ${shellQuote(REPOSITORY_SAFE_BUNFIG_PATH)}`,
    `test ! -L ${shellQuote(REPOSITORY_SAFE_BUNFIG_PATH)}`,
    `chown -R 0:${WORKSPACE_GID} ${shellQuote(PACKAGE_MANAGER_CONFIG_DIR)}`,
    `chmod 0750 ${shellQuote(PACKAGE_MANAGER_CONFIG_DIR)}`,
    `chmod 0440 ${shellQuote(REPOSITORY_SAFE_BUNFIG_PATH)}`,
    `chown ${AGENT_UID}:${WORKSPACE_GID} ${shellQuote(RESULT_DIR)}`,
    `chmod 0700 ${shellQuote(RESULT_DIR)}`,
    `chown -R 0:0 ${shellQuote(CONTROL_DIR)}`,
    `chmod 0700 ${shellQuote(CONTROL_DIR)}`,
  ].join(" && ");
  const prepared = yield* exec(
    sandbox,
    "prepare-repository-permissions",
    prepareRepository,
    { timeout: 60_000 },
  );
  if (!prepared.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "prepare-repository-permissions",
      message: excerpt(prepared.stderr || prepared.stdout),
    }));
  }

  const base = yield* exec(sandbox, "read-base-sha", repositoryGitCommand([
    "rev-parse",
    "HEAD",
  ]), {
    cwd: REPOSITORY_DIR,
    timeout: 30_000,
  });
  const baseSha = base.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(baseSha)) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "verify-base-sha",
      message: "Repository resolved to an invalid base revision",
    }));
  }
  if (input.expectedBaseSha !== undefined && baseSha !== input.expectedBaseSha) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "verify-base-sha",
      message: `Repository resolved to ${baseSha}, expected ${input.expectedBaseSha}`,
    }));
  }
  yield* writeTextFile(sandbox, "store-base-sha", BASE_SHA_PATH, `${baseSha}\n`);
  yield* writeTextFile(
    sandbox,
    "store-repository-url",
    REPOSITORY_URL_PATH,
    `${repository.canonicalUrl}\n`,
  );

  const packageJson = yield* readTextFile(
    sandbox,
    "read-package-manifest",
    `${REPOSITORY_DIR}/package.json`,
  );
  const manifest = yield* Effect.try({
    try: () => JSON.parse(packageJson) as unknown,
    catch: (cause) => SandboxOperationFailed.fromUnknown("parse-package-manifest", cause),
  }).pipe(
    Effect.flatMap(decodePackageManifest),
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("decode-package-manifest", error)),
  );
  const packageFilesResult = yield* exec(
    sandbox,
    "detect-package-manager",
    "for file in bun.lock bun.lockb package-lock.json pnpm-lock.yaml yarn.lock .yarnrc.yml; do if [ -f \"$file\" ]; then printf '%s\\n' \"$file\"; fi; done",
    { cwd: REPOSITORY_DIR, timeout: 30_000 },
  );
  if (!packageFilesResult.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "detect-package-manager",
      message: "Repository package-manager files could not be inspected",
    }));
  }
  const packageFiles = yield* decodeRepositoryPackageFiles(
    packageFilesResult.stdout.split("\n").map((file) => file.trim()).filter(Boolean),
  ).pipe(
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("detect-package-manager", error)),
  );
  const selection = yield* selectRepositoryPackageManager(manifest, packageFiles).pipe(
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("detect-package-manager", error)),
  );
  if (selection.packageManager !== "bun") {
    const specifier = `${selection.packageManager}@${selection.packageManagerVersion}`;
    const restoreCorepackPermissions = `chmod -R a-w ${shellQuote(COREPACK_HOME)}`;
    const prepareCorepack = [
      "set -eu",
      `chmod -R u+w ${shellQuote(COREPACK_HOME)}`,
      `trap ${shellQuote(restoreCorepackPermissions)} EXIT`,
      `COREPACK_HOME=${shellQuote(COREPACK_HOME)} corepack install --global ${shellQuote(specifier)}`,
    ].join("; ");
    const preparedPackageManager = yield* exec(
      sandbox,
      "prepare-package-manager",
      prepareCorepack,
      { timeout: 120_000 },
    );
    if (!preparedPackageManager.success) {
      return yield* Effect.fail(new SandboxOperationFailed({
        operation: "prepare-package-manager",
        message: excerpt(preparedPackageManager.stderr || preparedPackageManager.stdout),
      }));
    }
  }
  const validationPolicy = makeValidationPolicy({
    selection,
    scripts: manifest.scripts ?? {},
  });
  const policyAuthentication = yield* signValidationPolicy(
    env.SANDBOX_API_TOKEN,
    input.sandboxId,
    validationPolicy,
  );
  yield* writeTextFile(
    sandbox,
    "store-validation-policy",
    VALIDATION_POLICY_PATH,
    JSON.stringify({
      version: 1,
      policy: validationPolicy,
      authentication: policyAuthentication,
    }),
  );

  const install = yield* exec(
    sandbox,
    "install-repository",
    renderRepositoryExecutionCommand(validationPolicy.install),
    {
      cwd: selection.packageManager === "bun" ? RUNNER_DIR : REPOSITORY_DIR,
      // Older npm lockfiles may need one registry metadata refresh even when the
      // dependency graph is small. Keep installation finite but allow that path.
      timeout: 300_000,
    },
  );
  yield* stopRepositoryProcesses(sandbox, "cleanup-install-processes");
  if (!install.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "install-repository",
      message: excerpt(install.stderr || install.stdout),
    }));
  }

  const baselineCheck = validationPolicy.baseline === null
    ? undefined
    : validationPolicy.checks.find((check) => check.name === validationPolicy.baseline);
  const initialTest = baselineCheck === undefined
    ? { exitCode: 0 }
    : yield* exec(
        sandbox,
        "record-baseline",
        renderRepositoryExecutionCommand(baselineCheck.command),
        { cwd: REPOSITORY_DIR, timeout: 120_000 },
      );
  yield* stopRepositoryProcesses(sandbox, "cleanup-baseline-processes");

  const modelProxyToken = yield* issueModelProxyToken(
    env.SANDBOX_API_TOKEN,
    input.sandboxId,
  ).pipe(
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("issue-model-proxy-token", error)),
  );
  const prepareAgentStateCommand = [
    `rm -rf ${shellQuote(AGENT_STATE_DIR)}`,
    `install -d -m 0700 -o ${AGENT_UID} -g ${WORKSPACE_GID} ${shellQuote(AGENT_STATE_DIR)}`,
  ].join(" && ");
  const preparedAgentState = yield* exec(
    sandbox,
    "prepare-agent-state",
    prepareAgentStateCommand,
    { timeout: 30_000 },
  );
  if (!preparedAgentState.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "prepare-agent-state",
      message: excerpt(preparedAgentState.stderr || preparedAgentState.stdout),
    }));
  }
  yield* writeTextFile(
    sandbox,
    "store-model-proxy-token",
    MODEL_PROXY_TOKEN_PATH,
    modelProxyToken,
  ).pipe(Effect.mapError(() => new SandboxOperationFailed({
    operation: "store-model-proxy-token",
    message: "Could not store the scoped model proxy grant",
  })));
  const protectedToken = yield* exec(
    sandbox,
    "protect-model-proxy-token",
    [
      `chown ${AGENT_UID}:${WORKSPACE_GID} ${shellQuote(MODEL_PROXY_TOKEN_PATH)}`,
      `chmod 0600 ${shellQuote(MODEL_PROXY_TOKEN_PATH)}`,
    ].join(" && "),
    { timeout: 30_000 },
  );
  if (!protectedToken.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "protect-model-proxy-token",
      message: excerpt(protectedToken.stderr || protectedToken.stdout),
    }));
  }

  const processId = `pi-${input.sandboxId}`;
  const runnerCommand =
    `${AGENT_EXECUTOR} bun --config ${REPOSITORY_SAFE_BUNFIG_PATH} /opt/polyphemus/main.ts`;
  yield* startSandboxProcess(sandbox, processId, runnerCommand, {
    cwd: RUNNER_DIR,
    processId,
    autoCleanup: false,
    env: {
      POLYPHEMUS_MODEL_PROXY_URL: `${env.MODEL_PROXY_ORIGIN}/v1`,
      POLYPHEMUS_TASK: input.task,
      POLYPHEMUS_VALIDATION_COMMANDS: JSON.stringify({
        version: 1,
        checks: validationPolicy.checks,
      }),
    },
  });

  return json({
    sandboxId: input.sandboxId,
    processId,
    baseSha,
    initialTestExitCode: initialTest.exitCode,
  } satisfies SandboxRunStartResult, { status: 202 });
});

const statusRun = (request: Request, env: SandboxRuntimeEnv) => Effect.gen(function* () {
  const input = yield* requestJson(request).pipe(Effect.flatMap(decodeSandboxProcessRequest));
  if (!validSandboxId(input.sandboxId)) {
    return yield* Effect.fail(new InvalidSandboxRequest({ message: "Invalid sandboxId" }));
  }
  const sandbox = getRunSandbox(env, input.sandboxId);
  yield* configureRunSandbox(sandbox);
  const process = yield* getSandboxProcess(sandbox, "get-pi-process", input.processId);
  const logs = process === null
    ? { stdout: "", stderr: "" }
    : yield* readProcessLogs("get-pi-logs", process);
  const processStatus = yield* decodeProcessStatus(process?.status ?? "missing");

  return json({
    sandboxId: input.sandboxId,
    processId: input.processId,
    status: processStatus,
    events: parseEvents(logs.stdout),
    stderrExcerpt: excerpt(logs.stderr),
  } satisfies SandboxProcessStatusResult);
});

const scriptIntegrityFailure = (
  name: string,
  command: string,
  packageScript: string,
): ValidationResult => ({
  name,
  command,
  exitCode: 1,
  passed: false,
  durationMs: 0,
  stdoutExcerpt: "",
  stderrExcerpt: `package.json script ${packageScript} changed after the recorded baseline`,
});

const collectFinalResult = (
  sandbox: ReturnType<typeof getRunSandbox>,
  sandboxId: string,
  processId: string,
  validationPolicySecret: string,
) => Effect.gen(function* () {
  const process = yield* getSandboxProcess(sandbox, "get-pi-process", processId);
  if (process === null) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "finalize-pi-process",
      message: "Pi process was not found",
    }));
  }
  const status = yield* sandboxEffect("read-pi-status", () => process.getStatus()).pipe(
    Effect.flatMap(decodeProcessStatus),
  );
  if (status === "starting" || status === "running") {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "run-not-finished",
      message: `Pi process is still ${status}`,
    }));
  }
  const logs = yield* readProcessLogs("get-pi-logs", process);

  const baseSha = (yield* readTextFile(sandbox, "read-base-sha", BASE_SHA_PATH)).trim();
  if (!/^[0-9a-f]{40}$/.test(baseSha)) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "read-base-sha",
      message: "Stored base revision is invalid",
    }));
  }

  const repositoryUrl = (yield* readTextFile(
    sandbox,
    "read-repository-url",
    REPOSITORY_URL_PATH,
  )).trim();
  const repository = yield* parsePublicGithubRepository(repositoryUrl).pipe(
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("decode-repository-url", error)),
  );
  const storedPolicy = yield* readTextFile(
    sandbox,
    "read-validation-policy",
    VALIDATION_POLICY_PATH,
  );
  const storedPolicyValue = yield* Effect.try({
    try: () => JSON.parse(storedPolicy) as unknown,
    catch: (cause) => SandboxOperationFailed.fromUnknown("parse-validation-policy", cause),
  });
  const decodedPolicy = yield* decodeStoredValidationPolicyWithFormat(
    validationPolicySecret,
    sandboxId,
    storedPolicyValue,
  );
  const validationPolicy = decodedPolicy.policy;
  if (decodedPolicy.storage !== "current") {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "unsupported-legacy-runtime",
      message: "This Agent Run predates the current validation boundary and must be rerun",
    }));
  }
  if (!("version" in validationPolicy)) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "decode-validation-policy",
      message: "Current validation policy format was not preserved",
    }));
  }
  yield* stopRepositoryProcesses(sandbox, "cleanup-runner-repository-processes");
  yield* stopAgentProcesses(sandbox, "cleanup-runner-agent-processes");

  const storedResult = yield* readTextFile(sandbox, "read-pi-result", PI_RESULT_PATH);
  const pi = yield* Effect.try({
    try: () => JSON.parse(storedResult) as unknown,
    catch: (cause) => SandboxOperationFailed.fromUnknown("parse-pi-result", cause),
  }).pipe(Effect.flatMap(decodePiRunResult));

  const validation: ValidationResult[] = [];
  const cleanedDependencies = yield* exec(
    sandbox,
    "clean-final-dependencies",
    `find ${shellQuote(REPOSITORY_DIR)} -xdev -name node_modules -prune -exec rm -rf -- {} +`,
    { timeout: 120_000 },
  );
  if (!cleanedDependencies.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "clean-final-dependencies",
      message: excerpt(cleanedDependencies.stderr || cleanedDependencies.stdout),
    }));
  }
  const finalInstallCommand = renderRepositoryExecutionCommand(validationPolicy.install);
  const finalInstall = yield* exec(
    sandbox,
    "install-final-dependencies",
    finalInstallCommand,
    {
      cwd: validationPolicy.selection.packageManager === "bun" ? RUNNER_DIR : REPOSITORY_DIR,
      timeout: 300_000,
    },
  );
  yield* stopRepositoryProcesses(sandbox, "cleanup-final-install-processes");
  validation.push(validationResult(
    "dependency-install",
    validationPolicy.install.display,
    finalInstall,
  ));

  const sealedManifest = yield* exec(
    sandbox,
    "seal-package-manifest",
    [
      `chown 0:${WORKSPACE_GID} ${shellQuote(REPOSITORY_DIR)}`,
      `chmod 0550 ${shellQuote(REPOSITORY_DIR)}`,
      `test -f ${shellQuote(`${REPOSITORY_DIR}/package.json`)}`,
      `test ! -L ${shellQuote(`${REPOSITORY_DIR}/package.json`)}`,
      `chown --no-dereference 0:${WORKSPACE_GID} ${shellQuote(`${REPOSITORY_DIR}/package.json`)}`,
      `chmod 0440 ${shellQuote(`${REPOSITORY_DIR}/package.json`)}`,
    ].join(" && "),
    { timeout: 30_000 },
  );
  if (!sealedManifest.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "seal-package-manifest",
      message: excerpt(sealedManifest.stderr || sealedManifest.stdout),
    }));
  }

  for (const check of validationPolicy.checks) {
    const packageJson = yield* readTextFile(
      sandbox,
      `read-package-manifest-${check.name}`,
      `${REPOSITORY_DIR}/package.json`,
    );
    const manifest = yield* Effect.try({
      try: () => JSON.parse(packageJson) as unknown,
      catch: (cause) => SandboxOperationFailed.fromUnknown("parse-package-manifest", cause),
    }).pipe(
      Effect.flatMap(decodePackageManifest),
      Effect.mapError((error) => SandboxOperationFailed.fromUnknown("decode-package-manifest", error)),
    );
    if (manifest.scripts?.[check.packageScript] !== check.expectedScript) {
      validation.push(scriptIntegrityFailure(
        check.name,
        check.command.display,
        check.packageScript,
      ));
      continue;
    }

    const command = renderRepositoryExecutionCommand(check.command);
    const result = yield* exec(sandbox, `validate-${check.name}`, command, {
      cwd: REPOSITORY_DIR,
      timeout: 120_000,
    });
    yield* stopRepositoryProcesses(sandbox, `cleanup-${check.name}-processes`);
    validation.push(validationResult(check.name, check.command.display, result));
  }

  if (repository.canonicalUrl === FIXTURE_REPOSITORY) {
    yield* createDirectory(sandbox, "create-held-out-directory", HELD_OUT_DIR);
    yield* writeTextFile(
      sandbox,
      "write-held-out-test",
      HELD_OUT_TEST_PATH,
      HELD_OUT_TEST_SOURCE,
    );
    const protectedHeldOutTest = yield* exec(
      sandbox,
      "protect-held-out-test",
      [
        `test -d ${shellQuote(HELD_OUT_DIR)}`,
        `test ! -L ${shellQuote(HELD_OUT_DIR)}`,
        `test -f ${shellQuote(HELD_OUT_TEST_PATH)}`,
        `test ! -L ${shellQuote(HELD_OUT_TEST_PATH)}`,
        `chown --no-dereference 0:${WORKSPACE_GID} ${shellQuote(HELD_OUT_DIR)} ${shellQuote(HELD_OUT_TEST_PATH)}`,
        `chmod 0750 ${shellQuote(HELD_OUT_DIR)}`,
        `chmod 0440 ${shellQuote(HELD_OUT_TEST_PATH)}`,
      ].join(" && "),
      { timeout: 30_000 },
    );
    if (!protectedHeldOutTest.success) {
      return yield* Effect.fail(new SandboxOperationFailed({
        operation: "protect-held-out-test",
        message: excerpt(protectedHeldOutTest.stderr || protectedHeldOutTest.stdout),
      }));
    }
    const heldOutCommand = repositoryCommand("bun", [
      "--config",
      REPOSITORY_SAFE_BUNFIG_PATH,
      "test",
      "--cwd",
      REPOSITORY_DIR,
      HELD_OUT_TEST_PATH,
    ]);
    const heldOut = yield* exec(
      sandbox,
      "validate-held-out-test",
      heldOutCommand,
      { cwd: RUNNER_DIR, timeout: 60_000 },
    );
    yield* stopRepositoryProcesses(sandbox, "cleanup-held-out-test-processes");
    validation.push(validationResult("held-out-tests", heldOutCommand, heldOut));
  }

  const removedSafeYarnConfig = yield* exec(
    sandbox,
    "remove-safe-yarn-config",
    `test -f ${shellQuote(SAFE_YARN_RC_PATH)} && test ! -L ${shellQuote(SAFE_YARN_RC_PATH)} && rm -- ${shellQuote(SAFE_YARN_RC_PATH)}`,
    { timeout: 30_000 },
  );
  if (!removedSafeYarnConfig.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "remove-safe-yarn-config",
      message: excerpt(removedSafeYarnConfig.stderr || removedSafeYarnConfig.stdout),
    }));
  }
  yield* stopRepositoryProcesses(sandbox, "cleanup-final-repository-processes");
  yield* stopAgentProcesses(sandbox, "cleanup-final-agent-processes");
  const frozen = yield* exec(
    sandbox,
    "freeze-repository-worktree",
    `chmod -R a-w ${shellQuote(REPOSITORY_DIR)}`,
    { timeout: 60_000 },
  );
  if (!frozen.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "freeze-repository-worktree",
      message: excerpt(frozen.stderr || frozen.stdout),
    }));
  }
  yield* stopRepositoryProcesses(sandbox, "verify-no-final-repository-processes");

  const preparedEvidenceIndex = yield* exec(
    sandbox,
    "prepare-git-evidence-index",
    [
      `test ! -e ${shellQuote(GIT_EVIDENCE_DIR)}`,
      `install -d -m 0700 -o ${REPOSITORY_UID} -g ${WORKSPACE_GID} ${shellQuote(GIT_EVIDENCE_DIR)} ${shellQuote(GIT_EVIDENCE_OBJECTS)}`,
      `cp ${shellQuote(`${GIT_METADATA_DIR}/index`)} ${shellQuote(GIT_EVIDENCE_INDEX)}`,
      `chown --no-dereference ${REPOSITORY_UID}:${WORKSPACE_GID} ${shellQuote(GIT_EVIDENCE_INDEX)}`,
      `chmod 0600 ${shellQuote(GIT_EVIDENCE_INDEX)}`,
    ].join(" && "),
    { timeout: 30_000 },
  );
  if (!preparedEvidenceIndex.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "prepare-git-evidence-index",
      message: excerpt(preparedEvidenceIndex.stderr || preparedEvidenceIndex.stdout),
    }));
  }
  const indexedUntrackedFiles = yield* exec(
    sandbox,
    "index-untracked-evidence",
    evidenceGitCommand(["add", "--intent-to-add", "--all", "--", "."]),
    { cwd: REPOSITORY_DIR, timeout: 60_000 },
  );
  yield* stopRepositoryProcesses(sandbox, "cleanup-git-evidence-processes");
  if (!indexedUntrackedFiles.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "index-untracked-evidence",
      message: excerpt(indexedUntrackedFiles.stderr || indexedUntrackedFiles.stdout),
    }));
  }
  const sealedEvidenceIndex = yield* exec(
    sandbox,
    "seal-git-evidence-index",
    [
      `chown -R 0:${WORKSPACE_GID} ${shellQuote(GIT_EVIDENCE_DIR)}`,
      `chmod -R u=rwX,g=rX,o= ${shellQuote(GIT_EVIDENCE_DIR)}`,
    ].join(" && "),
    { timeout: 30_000 },
  );
  if (!sealedEvidenceIndex.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "seal-git-evidence-index",
      message: excerpt(sealedEvidenceIndex.stderr || sealedEvidenceIndex.stdout),
    }));
  }

  const gitCommand = evidenceGitCommand;
  const changedCommand = gitCommand([
    "diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", baseSha, "--",
  ]);
  const changed = yield* exec(sandbox, "collect-changed-files", changedCommand, {
    cwd: REPOSITORY_DIR,
    timeout: 30_000,
  });
  const diffCommand = gitCommand([
    "diff", "--binary", "--no-ext-diff", "--no-textconv", baseSha, "--",
  ]);
  const diff = yield* exec(sandbox, "collect-patch", diffCommand, {
    cwd: REPOSITORY_DIR,
    timeout: 30_000,
  });
  if (!changed.success || !diff.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "collect-patch",
      message: excerpt(diff.stderr || changed.stderr || "Git evidence collection failed"),
    }));
  }
  const diffCheckCommand = gitCommand([
    "diff", "--no-ext-diff", "--no-textconv", "--check",
  ]);
  const diffCheck = yield* exec(sandbox, "validate-diff", diffCheckCommand, {
    cwd: REPOSITORY_DIR,
    timeout: 30_000,
  });

  validation.push(validationResult("diff-check", "git diff --check", diffCheck));

  return {
    version: 1 as const,
    sandboxId,
    processId,
    repositoryUrl: repository.canonicalUrl,
    runRequest: pi.runRequest,
    runAssumptions: pi.assumptions,
    baseSha,
    pi,
    events: parseEvents(logs.stdout),
    changedFiles: changed.stdout.split("\0").filter((path) => path.length > 0),
    patch: diff.stdout,
    validation,
    validated: validationPolicy.checks.length > 0 &&
      validation.every((result) => result.passed) &&
      diff.stdout.trim().length > 0,
  };
});

const finalizeRun = (request: Request, env: SandboxRuntimeEnv) => Effect.gen(function* () {
  const input = yield* requestJson(request).pipe(Effect.flatMap(decodeSandboxProcessRequest));
  if (!validSandboxId(input.sandboxId)) {
    return yield* Effect.fail(new InvalidSandboxRequest({ message: "Invalid sandboxId" }));
  }
  const sandbox = getRunSandbox(env, input.sandboxId);
  yield* configureRunSandbox(sandbox);

  return yield* collectFinalResult(
    sandbox,
    input.sandboxId,
    input.processId,
    env.SANDBOX_API_TOKEN,
  ).pipe(
    Effect.matchEffect({
      onFailure: (error) => sandboxEffect("destroy-sandbox", () => sandbox.destroy()).pipe(
        Effect.ignore,
        Effect.flatMap(() => Effect.fail(error)),
      ),
      onSuccess: (result) => sandboxEffect("destroy-sandbox", () => sandbox.destroy()).pipe(
        Effect.match({
          onFailure: () => json({ ...result, cleanup: "failed" } satisfies SandboxRunResult),
          onSuccess: () => json({ ...result, cleanup: "destroyed" } satisfies SandboxRunResult),
        }),
      ),
    }),
  );
});

const cancelRun = (request: Request, env: SandboxRuntimeEnv) => Effect.gen(function* () {
  const input = yield* requestJson(request).pipe(Effect.flatMap(decodeSandboxProcessRequest));
  if (!validSandboxId(input.sandboxId)) {
    return yield* Effect.fail(new InvalidSandboxRequest({ message: "Invalid sandboxId" }));
  }
  const sandbox = getRunSandbox(env, input.sandboxId);
  yield* configureRunSandbox(sandbox);
  const process = yield* getSandboxProcess(sandbox, "get-pi-process", input.processId);
  let events: readonly PiActivityEvent[] = [];
  if (process !== null) {
    const status = yield* sandboxEffect("read-pi-status", () => process.getStatus()).pipe(
      Effect.flatMap(decodeProcessStatus),
    );
    if (status === "starting" || status === "running") {
      yield* sandboxEffect("kill-pi-process", () => process.kill("SIGTERM"));
    }
    const logs = yield* readProcessLogs("get-pi-logs", process).pipe(
      Effect.match({
        onFailure: () => ({ stdout: "", stderr: "" }),
        onSuccess: (value) => value,
      }),
    );
    events = parseEvents(logs.stdout);
  }

  const cleanup = yield* sandboxEffect("destroy-sandbox", () => sandbox.destroy()).pipe(
    Effect.match({ onFailure: () => "failed" as const, onSuccess: () => "destroyed" as const }),
  );
  return json({
    sandboxId: input.sandboxId,
    processId: input.processId,
    status: "cancelled",
    events,
    cleanup,
  } satisfies SandboxCancelResult);
});

const route = (request: Request, env: SandboxRuntimeEnv) => {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return Effect.succeed(json({ status: "ok", sandboxTransport: "rpc" }));
  }

  const authorization = request.headers.get("Authorization");
  if (authorization !== `Bearer ${env.SANDBOX_API_TOKEN}`) {
    return Effect.succeed(json({ error: "Unauthorized" }, { status: 401 }));
  }
  if (url.pathname === "/sandbox-runs/start" && request.method === "POST") return startRun(request, env);
  if (url.pathname === "/sandbox-runs/status" && request.method === "POST") return statusRun(request, env);
  if (url.pathname === "/sandbox-runs/finalize" && request.method === "POST") return finalizeRun(request, env);
  if (url.pathname === "/sandbox-runs/cancel" && request.method === "POST") return cancelRun(request, env);
  return Effect.succeed(json({ error: "Not found" }, { status: 404 }));
};

const handle = (request: Request, env: SandboxRuntimeEnv) => route(request, env).pipe(
  Effect.catchTags({
    InvalidSandboxRequest: (error) => Effect.succeed(json({ error: error._tag, message: error.message }, { status: 400 })),
    SandboxOperationFailed: (error) => Effect.succeed(json({
      error: error._tag,
      operation: error.operation,
      message: error.message,
    }, { status: error.operation === "run-not-finished" ? 409 : 500 })),
  }),
);

export const handleSandboxRuntimeRequest = (
  request: Request,
  env: SandboxRuntimeEnv,
): Promise<Response> => Effect.runPromise(handle(request, env));
