import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { issueModelProxyToken } from "./domain/model-proxy-token.ts";
import {
  decodePackageManifest,
  decodeRepositoryValidationPolicy,
  makeValidationPolicy,
  parsePublicGithubRepository,
  type RepositoryPackageManager,
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
  BASE_SHA_PATH,
  CONTROL_DIR,
  HELD_OUT_TEST_PATH,
  MAX_EXCERPT_CHARACTERS,
  PI_RESULT_PATH,
  REPOSITORY_DIR,
  REPOSITORY_URL_PATH,
  FIXTURE_REPOSITORY,
  VALIDATION_POLICY_PATH,
} from "./sandbox-config.ts";

interface ExecResult {
  readonly exitCode: number;
  readonly success: boolean;
  readonly duration: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface SandboxProcess {
  readonly status: unknown;
  readonly getLogs: () => Promise<{ readonly stdout: string; readonly stderr: string }>;
  readonly getStatus: () => Promise<unknown>;
  readonly kill: (signal: string) => Promise<unknown>;
}

interface SandboxStub {
  readonly configure?: (configuration: unknown) => Promise<unknown>;
  readonly mkdir: (path: string, options?: unknown) => Promise<unknown>;
  readonly gitCheckout: (repository: string, options?: unknown) => Promise<unknown>;
  readonly exec: (command: string, options?: unknown) => Promise<ExecResult>;
  readonly writeFile: (path: string, content: string, options?: unknown) => Promise<unknown>;
  readonly readFile: (path: string, options?: unknown) => Promise<{ readonly content: unknown }>;
  readonly startProcess: (command: string, options?: unknown) => Promise<unknown>;
  readonly getProcess: (processId: string) => Promise<SandboxProcess | null>;
  readonly destroy: () => Promise<unknown>;
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

const getRunSandbox = (env: SandboxRuntimeEnv, sandboxId: string): SandboxStub => {
  const sandbox = env.Sandbox.getByName(sandboxId);
  void sandbox.configure?.({
    transport: "rpc",
    keepAlive: true,
    labels: { application: "polyphemus", workload: "agent-run" },
  });
  return sandbox;
};

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

const exec = (
  sandbox: ReturnType<typeof getRunSandbox>,
  operation: string,
  command: string,
  options?: { readonly cwd?: string; readonly timeout?: number },
) => sandboxEffect(operation, () => sandbox.exec(command, options));

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
  yield* sandboxEffect("create-control-directory", () =>
    sandbox.mkdir(CONTROL_DIR, { recursive: true }));
  yield* sandboxEffect("clone-repository", () => sandbox.gitCheckout(repository.canonicalUrl, {
    targetDir: REPOSITORY_DIR,
    depth: 1,
    cloneTimeoutMs: 120_000,
  }));

  const base = yield* exec(sandbox, "read-base-sha", "git rev-parse HEAD", {
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
  yield* sandboxEffect("store-base-sha", () => sandbox.writeFile(BASE_SHA_PATH, `${baseSha}\n`));
  yield* sandboxEffect("store-repository-url", () =>
    sandbox.writeFile(REPOSITORY_URL_PATH, `${repository.canonicalUrl}\n`));

  const packageJson = yield* sandboxEffect("read-package-manifest", () =>
    sandbox.readFile(`${REPOSITORY_DIR}/package.json`));
  const manifest = yield* Effect.try({
    try: () => JSON.parse(String(packageJson.content)) as unknown,
    catch: (cause) => SandboxOperationFailed.fromUnknown("parse-package-manifest", cause),
  }).pipe(
    Effect.flatMap(decodePackageManifest),
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("decode-package-manifest", error)),
  );
  const packageManagerResult = yield* exec(
    sandbox,
    "detect-package-manager",
    "if [ -f bun.lock ] || [ -f bun.lockb ]; then printf bun; elif [ -f package-lock.json ]; then printf npm; else printf unsupported; fi",
    { cwd: REPOSITORY_DIR, timeout: 30_000 },
  );
  const detectedPackageManager = packageManagerResult.stdout.trim();
  if (detectedPackageManager !== "bun" && detectedPackageManager !== "npm") {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "detect-package-manager",
      message: "Repository must contain bun.lock, bun.lockb, or package-lock.json",
    }));
  }
  const packageManager: RepositoryPackageManager = detectedPackageManager;
  const validationPolicy = makeValidationPolicy({
    packageManager,
    scripts: manifest.scripts ?? {},
  });
  yield* sandboxEffect("store-validation-policy", () =>
    sandbox.writeFile(VALIDATION_POLICY_PATH, JSON.stringify(validationPolicy)));

  const install = yield* exec(sandbox, "install-repository", validationPolicy.installCommand, {
    cwd: REPOSITORY_DIR,
    // Older npm lockfiles may need one registry metadata refresh even when the
    // dependency graph is small. Keep installation finite but allow that path.
    timeout: 300_000,
  });
  if (!install.success) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "install-repository",
      message: excerpt(install.stderr || install.stdout),
    }));
  }

  const initialTest = validationPolicy.baselineCommand === null
    ? { exitCode: 0 }
    : yield* exec(sandbox, "record-baseline", validationPolicy.baselineCommand, {
        cwd: REPOSITORY_DIR,
        timeout: 120_000,
      });

  const modelProxyToken = yield* issueModelProxyToken(
    env.SANDBOX_API_TOKEN,
    input.sandboxId,
  ).pipe(
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("issue-model-proxy-token", error)),
  );
  const processId = `pi-${input.sandboxId}`;
  yield* sandboxEffect("start-pi-runner", () => sandbox.startProcess(
    "bun /opt/polyphemus/main.ts",
    {
      cwd: REPOSITORY_DIR,
      processId,
      autoCleanup: false,
      env: {
        POLYPHEMUS_MODEL_PROXY_TOKEN: modelProxyToken,
        POLYPHEMUS_MODEL_PROXY_URL: `${env.MODEL_PROXY_ORIGIN}/v1`,
        POLYPHEMUS_TASK: input.task,
        POLYPHEMUS_REPOSITORY_DIR: REPOSITORY_DIR,
        POLYPHEMUS_RESULT_PATH: PI_RESULT_PATH,
      },
    },
  ));

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
  const process = yield* sandboxEffect("get-pi-process", () => sandbox.getProcess(input.processId));
  const logs = process === null
    ? { stdout: "", stderr: "" }
    : yield* sandboxEffect("get-pi-logs", () => process.getLogs());
  const processStatus = yield* decodeProcessStatus(process?.status ?? "missing");

  return json({
    sandboxId: input.sandboxId,
    processId: input.processId,
    status: processStatus,
    events: parseEvents(logs.stdout),
    stderrExcerpt: excerpt(logs.stderr),
  } satisfies SandboxProcessStatusResult);
});

const collectFinalResult = (
  sandbox: ReturnType<typeof getRunSandbox>,
  sandboxId: string,
  processId: string,
) => Effect.gen(function* () {
  const process = yield* sandboxEffect("get-pi-process", () => sandbox.getProcess(processId));
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
  const logs = yield* sandboxEffect("get-pi-logs", () => process.getLogs());
  const storedResult = yield* sandboxEffect("read-pi-result", () => sandbox.readFile(PI_RESULT_PATH));
  const pi = yield* Effect.try({
    try: () => JSON.parse(String(storedResult.content)) as unknown,
    catch: (cause) => SandboxOperationFailed.fromUnknown("parse-pi-result", cause),
  }).pipe(Effect.flatMap(decodePiRunResult));

  const base = yield* sandboxEffect("read-base-sha", () => sandbox.readFile(BASE_SHA_PATH));
  const baseSha = String(base.content).trim();
  if (!/^[0-9a-f]{40}$/.test(baseSha)) {
    return yield* Effect.fail(new SandboxOperationFailed({
      operation: "read-base-sha",
      message: "Stored base revision is invalid",
    }));
  }

  const storedRepository = yield* sandboxEffect("read-repository-url", () =>
    sandbox.readFile(REPOSITORY_URL_PATH));
  const repositoryUrl = String(storedRepository.content).trim();
  const repository = yield* parsePublicGithubRepository(repositoryUrl).pipe(
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("decode-repository-url", error)),
  );
  const storedPolicy = yield* sandboxEffect("read-validation-policy", () =>
    sandbox.readFile(VALIDATION_POLICY_PATH));
  const validationPolicy = yield* Effect.try({
    try: () => JSON.parse(String(storedPolicy.content)) as unknown,
    catch: (cause) => SandboxOperationFailed.fromUnknown("parse-validation-policy", cause),
  }).pipe(
    Effect.flatMap(decodeRepositoryValidationPolicy),
    Effect.mapError((error) => SandboxOperationFailed.fromUnknown("decode-validation-policy", error)),
  );

  const validation: ValidationResult[] = [];
  for (const check of validationPolicy.checks) {
    const result = yield* exec(sandbox, `validate-${check.name}`, check.command, {
      cwd: REPOSITORY_DIR,
      timeout: 120_000,
    });
    validation.push(validationResult(check.name, check.command, result));
  }
  if (repository.canonicalUrl === FIXTURE_REPOSITORY) {
    yield* sandboxEffect("write-held-out-test", () =>
      sandbox.writeFile(HELD_OUT_TEST_PATH, HELD_OUT_TEST_SOURCE));
    const heldOutCommand = `bun test ${HELD_OUT_TEST_PATH}`;
    const heldOut = yield* exec(
      sandbox,
      "validate-held-out-test",
      heldOutCommand,
      { cwd: REPOSITORY_DIR, timeout: 60_000 },
    );
    validation.push(validationResult("held-out-tests", heldOutCommand, heldOut));
  }
  const changed = yield* exec(sandbox, "collect-changed-files", `git diff --name-only ${baseSha}`, {
    cwd: REPOSITORY_DIR,
    timeout: 30_000,
  });
  const diff = yield* exec(sandbox, "collect-patch", `git diff --binary --no-ext-diff ${baseSha}`, {
    cwd: REPOSITORY_DIR,
    timeout: 30_000,
  });
  const diffCheck = yield* exec(sandbox, "validate-diff", "git diff --check", {
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
    changedFiles: changed.stdout.split("\n").map((path) => path.trim()).filter(Boolean),
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

  return yield* collectFinalResult(sandbox, input.sandboxId, input.processId).pipe(
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
  const process = yield* sandboxEffect("get-pi-process", () => sandbox.getProcess(input.processId));
  let events: readonly PiActivityEvent[] = [];
  if (process !== null) {
    const status = yield* sandboxEffect("read-pi-status", () => process.getStatus()).pipe(
      Effect.flatMap(decodeProcessStatus),
    );
    if (status === "starting" || status === "running") {
      yield* sandboxEffect("kill-pi-process", () => process.kill("SIGTERM"));
    }
    const logs = yield* sandboxEffect("get-pi-logs", () => process.getLogs()).pipe(
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
