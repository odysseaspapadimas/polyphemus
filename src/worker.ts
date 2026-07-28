import {
  getSandbox,
  type ExecResult,
  Sandbox,
} from "@cloudflare/sandbox";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  decodePiActivityEvent,
  decodePiRunResult,
  decodeSpikeStartRequest,
  decodeSpikeStatusRequest,
  InvalidSpikeRequest,
  type PiActivityEvent,
  type SpikeCancelResult,
  type SpikeFinalResult,
  SpikeOperationFailed,
  type SpikeStartResult,
  type SpikeStatusResult,
  type ValidationResult,
} from "./domain/spike.ts";
import { HELD_OUT_TEST_SOURCE } from "./held-out-test.ts";
import {
  BASE_SHA_PATH,
  CONTROL_DIR,
  HELD_OUT_TEST_PATH,
  MAX_EXCERPT_CHARACTERS,
  PI_RESULT_PATH,
  REPOSITORY_DIR,
  SPIKE_FIXTURE_BASE_SHA,
  SPIKE_FIXTURE_REPOSITORY,
} from "./spike-config.ts";

export { Sandbox } from "@cloudflare/sandbox";

interface Env {
  readonly Sandbox: DurableObjectNamespace<Sandbox>;
  readonly OPENCODE_API_KEY: string;
  readonly SPIKE_API_TOKEN: string;
  readonly SANDBOX_TRANSPORT: "rpc";
}

const json = (value: unknown, init?: ResponseInit): Response => Response.json(value, init);
const excerpt = (value: string): string => value.slice(0, MAX_EXCERPT_CHARACTERS);

const sandboxEffect = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => SpikeOperationFailed.fromUnknown(operation, cause),
  });

const requestJson = (request: Request) =>
  Effect.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: (cause) => new InvalidSpikeRequest({ message: "Request body must be JSON", cause }),
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

const getRunSandbox = (env: Env, sandboxId: string) =>
  getSandbox(env.Sandbox, sandboxId, {
    transport: "rpc",
    enableDefaultSession: false,
    keepAlive: true,
    normalizeId: true,
    labels: { application: "polyphemus", workload: "feasibility-spike" },
  });

const validSandboxId = (sandboxId: string): boolean =>
  /^spike-[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(sandboxId);

const requireFixtureRequest = (input: {
  readonly sandboxId: string;
  readonly repositoryUrl: string;
  readonly expectedBaseSha?: string;
}) => {
  if (!validSandboxId(input.sandboxId)) {
    return Effect.fail(new InvalidSpikeRequest({ message: "sandboxId must be a lowercase spike-* identifier" }));
  }
  if (input.repositoryUrl.replace(/\/$/, "") !== SPIKE_FIXTURE_REPOSITORY) {
    return Effect.fail(new InvalidSpikeRequest({ message: "The feasibility Worker only accepts the pinned fixture repository" }));
  }
  if (input.expectedBaseSha !== undefined && input.expectedBaseSha !== SPIKE_FIXTURE_BASE_SHA) {
    return Effect.fail(new InvalidSpikeRequest({ message: "expectedBaseSha does not match the pinned fixture revision" }));
  }
  return Effect.void;
};

const exec = (
  sandbox: ReturnType<typeof getRunSandbox>,
  operation: string,
  command: string,
  options?: { readonly cwd?: string; readonly timeout?: number },
) => sandboxEffect(operation, () => sandbox.exec(command, options));

const validationResult = (name: string, command: string, result: ExecResult): ValidationResult => ({
  name,
  command,
  exitCode: result.exitCode,
  passed: result.exitCode === 0,
  durationMs: result.duration,
  stdoutExcerpt: excerpt(result.stdout),
  stderrExcerpt: excerpt(result.stderr),
});

const startRun = (request: Request, env: Env) => Effect.gen(function* () {
  const input = yield* requestJson(request).pipe(Effect.flatMap(decodeSpikeStartRequest));
  yield* requireFixtureRequest(input);

  const sandbox = getRunSandbox(env, input.sandboxId);
  yield* sandboxEffect("create-control-directory", () =>
    sandbox.mkdir(CONTROL_DIR, { recursive: true }));
  yield* sandboxEffect("clone-fixture", () => sandbox.gitCheckout(input.repositoryUrl, {
    targetDir: REPOSITORY_DIR,
    depth: 1,
    cloneTimeoutMs: 120_000,
  }));

  const base = yield* exec(sandbox, "read-base-sha", "git rev-parse HEAD", {
    cwd: REPOSITORY_DIR,
    timeout: 30_000,
  });
  const baseSha = base.stdout.trim();
  if (baseSha !== SPIKE_FIXTURE_BASE_SHA) {
    return yield* Effect.fail(new SpikeOperationFailed({
      operation: "verify-base-sha",
      message: `Fixture resolved to ${baseSha || "an empty revision"}, expected ${SPIKE_FIXTURE_BASE_SHA}`,
    }));
  }
  yield* sandboxEffect("store-base-sha", () => sandbox.writeFile(BASE_SHA_PATH, `${baseSha}\n`));

  const install = yield* exec(sandbox, "install-fixture", "bun install --frozen-lockfile", {
    cwd: REPOSITORY_DIR,
    timeout: 120_000,
  });
  if (!install.success) {
    return yield* Effect.fail(new SpikeOperationFailed({
      operation: "install-fixture",
      message: excerpt(install.stderr || install.stdout),
    }));
  }

  const initialTest = yield* exec(sandbox, "verify-defective-baseline", "bun test", {
    cwd: REPOSITORY_DIR,
    timeout: 60_000,
  });
  if (initialTest.success) {
    return yield* Effect.fail(new SpikeOperationFailed({
      operation: "verify-defective-baseline",
      message: "Pinned fixture unexpectedly passed before Pi ran",
    }));
  }

  const processId = `pi-${input.sandboxId}`;
  yield* sandboxEffect("start-pi-runner", () => sandbox.startProcess(
    "bun /opt/polyphemus/main.ts",
    {
      cwd: REPOSITORY_DIR,
      processId,
      autoCleanup: false,
      env: {
        OPENCODE_API_KEY: env.OPENCODE_API_KEY,
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
  } satisfies SpikeStartResult, { status: 202 });
});

const statusRun = (request: Request, env: Env) => Effect.gen(function* () {
  const input = yield* requestJson(request).pipe(Effect.flatMap(decodeSpikeStatusRequest));
  if (!validSandboxId(input.sandboxId)) {
    return yield* Effect.fail(new InvalidSpikeRequest({ message: "Invalid sandboxId" }));
  }
  const sandbox = getRunSandbox(env, input.sandboxId);
  const process = yield* sandboxEffect("get-pi-process", () => sandbox.getProcess(input.processId));
  const logs = process === null
    ? { stdout: "", stderr: "" }
    : yield* sandboxEffect("get-pi-logs", () => process.getLogs());

  return json({
    sandboxId: input.sandboxId,
    processId: input.processId,
    status: process?.status ?? "missing",
    events: parseEvents(logs.stdout),
    stderrExcerpt: excerpt(logs.stderr),
  } satisfies SpikeStatusResult);
});

const collectFinalResult = (
  sandbox: ReturnType<typeof getRunSandbox>,
  sandboxId: string,
  processId: string,
) => Effect.gen(function* () {
  const process = yield* sandboxEffect("get-pi-process", () => sandbox.getProcess(processId));
  if (process === null) {
    return yield* Effect.fail(new SpikeOperationFailed({
      operation: "finalize-pi-process",
      message: "Pi process was not found",
    }));
  }
  const status = yield* sandboxEffect("read-pi-status", () => process.getStatus());
  if (status === "starting" || status === "running") {
    return yield* Effect.fail(new SpikeOperationFailed({
      operation: "run-not-finished",
      message: `Pi process is still ${status}`,
    }));
  }
  const logs = yield* sandboxEffect("get-pi-logs", () => process.getLogs());
  const storedResult = yield* sandboxEffect("read-pi-result", () => sandbox.readFile(PI_RESULT_PATH));
  const pi = yield* Effect.try({
    try: () => JSON.parse(String(storedResult.content)) as unknown,
    catch: (cause) => SpikeOperationFailed.fromUnknown("parse-pi-result", cause),
  }).pipe(Effect.flatMap(decodePiRunResult));

  const base = yield* sandboxEffect("read-base-sha", () => sandbox.readFile(BASE_SHA_PATH));
  const baseSha = String(base.content).trim();
  if (!/^[0-9a-f]{40}$/.test(baseSha)) {
    return yield* Effect.fail(new SpikeOperationFailed({
      operation: "read-base-sha",
      message: "Stored base revision is invalid",
    }));
  }

  yield* sandboxEffect("write-held-out-test", () =>
    sandbox.writeFile(HELD_OUT_TEST_PATH, HELD_OUT_TEST_SOURCE));

  const visible = yield* exec(sandbox, "validate-visible-tests", "bun test", {
    cwd: REPOSITORY_DIR,
    timeout: 60_000,
  });
  const typecheck = yield* exec(sandbox, "validate-typecheck", "bun run typecheck", {
    cwd: REPOSITORY_DIR,
    timeout: 60_000,
  });
  const heldOut = yield* exec(
    sandbox,
    "validate-held-out-test",
    `bun test ${HELD_OUT_TEST_PATH}`,
    { cwd: REPOSITORY_DIR, timeout: 60_000 },
  );
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

  const validation = [
    validationResult("visible-tests", "bun test", visible),
    validationResult("typecheck", "bun run typecheck", typecheck),
    validationResult("held-out-tests", `bun test ${HELD_OUT_TEST_PATH}`, heldOut),
    validationResult("diff-check", "git diff --check", diffCheck),
  ];

  return {
    version: 1 as const,
    sandboxId,
    processId,
    repositoryUrl: SPIKE_FIXTURE_REPOSITORY,
    runRequest: pi.runRequest,
    runAssumptions: pi.assumptions,
    baseSha,
    pi,
    events: parseEvents(logs.stdout),
    changedFiles: changed.stdout.split("\n").map((path) => path.trim()).filter(Boolean),
    patch: diff.stdout,
    validation,
    validated: validation.every((result) => result.passed) && diff.stdout.trim().length > 0,
  };
});

const finalizeRun = (request: Request, env: Env) => Effect.gen(function* () {
  const input = yield* requestJson(request).pipe(Effect.flatMap(decodeSpikeStatusRequest));
  if (!validSandboxId(input.sandboxId)) {
    return yield* Effect.fail(new InvalidSpikeRequest({ message: "Invalid sandboxId" }));
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
          onFailure: () => json({ ...result, cleanup: "failed" } satisfies SpikeFinalResult),
          onSuccess: () => json({ ...result, cleanup: "destroyed" } satisfies SpikeFinalResult),
        }),
      ),
    }),
  );
});

const cancelRun = (request: Request, env: Env) => Effect.gen(function* () {
  const input = yield* requestJson(request).pipe(Effect.flatMap(decodeSpikeStatusRequest));
  if (!validSandboxId(input.sandboxId)) {
    return yield* Effect.fail(new InvalidSpikeRequest({ message: "Invalid sandboxId" }));
  }
  const sandbox = getRunSandbox(env, input.sandboxId);
  const process = yield* sandboxEffect("get-pi-process", () => sandbox.getProcess(input.processId));
  let events: readonly PiActivityEvent[] = [];
  if (process !== null) {
    const status = yield* sandboxEffect("read-pi-status", () => process.getStatus());
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
  } satisfies SpikeCancelResult);
});

const route = (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return Effect.succeed(json({ status: "ok", sandboxTransport: env.SANDBOX_TRANSPORT }));
  }

  const authorization = request.headers.get("Authorization");
  if (authorization !== `Bearer ${env.SPIKE_API_TOKEN}`) {
    return Effect.succeed(json({ error: "Unauthorized" }, { status: 401 }));
  }
  if (url.pathname === "/spike/start" && request.method === "POST") return startRun(request, env);
  if (url.pathname === "/spike/status" && request.method === "POST") return statusRun(request, env);
  if (url.pathname === "/spike/finalize" && request.method === "POST") return finalizeRun(request, env);
  if (url.pathname === "/spike/cancel" && request.method === "POST") return cancelRun(request, env);
  return Effect.succeed(json({ error: "Not found" }, { status: 404 }));
};

const handle = (request: Request, env: Env) => route(request, env).pipe(
  Effect.catchTags({
    InvalidSpikeRequest: (error) => Effect.succeed(json({ error: error._tag, message: error.message }, { status: 400 })),
    SpikeOperationFailed: (error) => Effect.succeed(json({
      error: error._tag,
      operation: error.operation,
      message: error.message,
    }, { status: error.operation === "run-not-finished" ? 409 : 500 })),
  }),
);

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return Effect.runPromise(handle(request, env));
  },
};
