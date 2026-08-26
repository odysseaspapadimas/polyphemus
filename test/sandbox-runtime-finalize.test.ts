import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  makeValidationPolicy,
  REPOSITORY_SAFE_BUNFIG_PATH,
  selectRepositoryPackageManager,
} from "../src/domain/repository-policy.ts";
import {
  handleSandboxRuntimeRequest,
  signValidationPolicy,
  type SandboxRuntimeEnv,
} from "../src/sandbox-runtime.ts";
import {
  BASE_SHA_PATH,
  FIXTURE_REPOSITORY,
  HELD_OUT_DIR,
  HELD_OUT_TEST_PATH,
  LEGACY_PI_RESULT_PATH,
  PI_RESULT_PATH,
  REPOSITORY_URL_PATH,
  VALIDATION_POLICY_PATH,
} from "../src/sandbox-config.ts";

const timestamp = "2026-07-29T00:00:00.000Z";
const baseSha = "0123456789abcdef0123456789abcdef01234567";
const patch = [
  "diff --git a/src/value.ts b/src/value.ts",
  "index 7898192..422c2b7 100644",
  "--- a/src/value.ts",
  "+++ b/src/value.ts",
  "@@ -1 +1 @@",
  "-old",
  "+new",
  "",
].join("\n");
const piResult = JSON.stringify({
  version: 1,
  status: "completed",
  summary: "Updated the value",
  findings: [],
  assumptions: [],
  changedFiles: ["src/value.ts"],
  unresolvedRisks: [],
  runRequest: "Update the value",
  terminationReason: "finish_run",
  budgetUsage: {
    commands: { used: 1, limit: 12 },
    wallClock: { elapsedMs: 100, limitMs: 480_000 },
    model: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 2,
      costUsd: 0,
    },
  },
});

interface FinalizeFixture {
  readonly response: Response;
  readonly commands: readonly string[];
  readonly files: ReadonlyMap<string, string>;
  readonly managedProcessCleanups: number;
  readonly destroyed: boolean;
}

const runFinalize = async (input: {
  readonly policy: unknown;
  readonly packageScript: string;
  readonly resultPath: typeof PI_RESULT_PATH | typeof LEGACY_PI_RESULT_PATH;
  readonly repositoryUrl?: string;
  readonly managedProcessCleanupResult?: unknown;
  readonly changedFiles?: readonly string[];
  readonly changedFilesPayload?: string;
}): Promise<FinalizeFixture> => {
  const commands: string[] = [];
  let managedProcessCleanups = 0;
  let destroyed = false;
  const files = new Map<string, string>([
    [BASE_SHA_PATH, `${baseSha}\n`],
    [REPOSITORY_URL_PATH, `${input.repositoryUrl ?? "https://github.com/example/repository"}\n`],
    [VALIDATION_POLICY_PATH, JSON.stringify(input.policy)],
    [input.resultPath, piResult],
    ["/workspace/repository/package.json", JSON.stringify({
      packageManager: "npm@10.9.8",
      scripts: { test: input.packageScript },
    })],
  ]);
  const sandbox = {
    async configure() {},
    async mkdir(path: string) {
      return { success: true, path, recursive: true, timestamp };
    },
    async gitCheckout() { throw new Error("not used"); },
    async writeFile(path: string, content: string) {
      files.set(path, content);
      return { success: true, path, timestamp };
    },
    async readFile(path: string) {
      const content = files.get(path);
      if (content === undefined) throw new Error(`missing fixture path: ${path}`);
      return {
        success: true,
        path,
        content,
        timestamp,
        encoding: "utf-8",
        isBinary: false,
      };
    },
    async exec(command: string) {
      commands.push(command);
      const stdout = command.includes("'--name-only'")
        ? input.changedFilesPayload ?? Buffer.from(
            `${(input.changedFiles ?? ["src/value.ts"]).join("\0")}\0`,
            "utf8",
          ).toString("base64")
        : command.includes("'--binary'")
          ? patch
          : "";
      return {
        success: true,
        exitCode: 0,
        stdout,
        stderr: "",
        command,
        duration: 1,
        timestamp,
      };
    },
    async startProcess() { throw new Error("not used"); },
    async getProcess() {
      return {
        id: "pi-sandbox-finalize",
        command: "runner",
        status: "completed",
        async getLogs() { return { stdout: "", stderr: "" }; },
        async getStatus() { return "completed"; },
        async kill() {},
      };
    },
    async killAllProcesses() {
      managedProcessCleanups += 1;
      return input.managedProcessCleanupResult ?? 0;
    },
    async destroy() { destroyed = true; },
  };
  const secret = "sandbox-finalize-secret";
  const env = {
    Sandbox: { getByName: () => sandbox },
    MODEL_PROXY_ORIGIN: "https://model-proxy.example.test",
    SANDBOX_API_TOKEN: secret,
  } as unknown as SandboxRuntimeEnv;
  const response = await handleSandboxRuntimeRequest(new Request(
    "https://sandbox-runtime.example.test/sandbox-runs/finalize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sandboxId: "sandbox-finalize",
        processId: "pi-sandbox-finalize",
      }),
    },
  ), env);
  return {
    response,
    commands,
    files,
    get managedProcessCleanups() { return managedProcessCleanups; },
    get destroyed() { return destroyed; },
  };
};

describe("Sandbox Runtime finalization strategy", () => {
  test("seals current worktrees and rejects a changed package script", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "npm@10.9.8", scripts: {} },
      ["package-lock.json"],
    ));
    const policy = makeValidationPolicy({ selection, scripts: { test: "vitest run" } });
    const secret = "sandbox-finalize-secret";
    const authentication = await Effect.runPromise(signValidationPolicy(
      secret,
      "sandbox-finalize",
      policy,
    ));
    const fixture = await runFinalize({
      policy: { version: 1, policy, authentication },
      packageScript: "true",
      resultPath: PI_RESULT_PATH,
    });

    expect(fixture.response.status).toBe(200);
    const result = await fixture.response.json() as {
      validated: boolean;
      cleanup: string;
      changedFiles: string[];
      validation: Array<{ name: string; passed: boolean; stderrExcerpt: string }>;
    };
    expect(result.validated).toBe(false);
    expect(result.cleanup).toBe("destroyed");
    expect(result.changedFiles).toEqual(["src/value.ts"]);
    expect(result.validation).toContainEqual(expect.objectContaining({
      name: "tests",
      passed: false,
      stderrExcerpt: expect.stringContaining("changed after the recorded baseline"),
    }));
    expect(fixture.commands.some((command) =>
      command.includes("'/bin/sh' '-c' 'vitest run'"))).toBe(false);
    expect(fixture.commands.some((command) => command.includes("chmod 0550"))).toBe(true);
    expect(fixture.commands.some((command) => command.includes(
      "--git-dir=/workspace/git-metadata",
    ))).toBe(true);
    expect(fixture.commands.some((command) => command.includes("pkill"))).toBe(false);
    expect(fixture.managedProcessCleanups).toBe(2);
    expect(fixture.destroyed).toBe(true);
  });

  test("protects fixture held-out tests while keeping them readable by the repository helper", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "npm@10.9.8", scripts: {} },
      ["package-lock.json"],
    ));
    const policy = makeValidationPolicy({ selection, scripts: { test: "vitest run" } });
    const secret = "sandbox-finalize-secret";
    const authentication = await Effect.runPromise(signValidationPolicy(
      secret,
      "sandbox-finalize",
      policy,
    ));
    const fixture = await runFinalize({
      policy: { version: 1, policy, authentication },
      packageScript: "vitest run",
      resultPath: PI_RESULT_PATH,
      repositoryUrl: FIXTURE_REPOSITORY,
    });

    expect(fixture.response.status).toBe(200);
    const result = await fixture.response.json() as {
      validated: boolean;
      validation: Array<{ name: string; passed: boolean }>;
    };
    expect(result.validated).toBe(true);
    expect(result.validation).toContainEqual(expect.objectContaining({
      name: "held-out-tests",
      passed: true,
    }));
    expect(fixture.files.get(HELD_OUT_TEST_PATH)?.length).toBeGreaterThan(0);
    expect(fixture.commands.some((command) =>
      command.includes(`chmod 0750 '${HELD_OUT_DIR}'`) &&
      command.includes(`chmod 0440 '${HELD_OUT_TEST_PATH}'`))).toBe(true);
    expect(fixture.commands).toContain(
      `'/usr/local/bin/polyphemus-repository-exec' 'bun' '--config=${REPOSITORY_SAFE_BUNFIG_PATH}' 'test' '--cwd' '/workspace/repository' '${HELD_OUT_TEST_PATH}'`,
    );
  });

  test("preserves NUL-delimited changed paths across the Sandbox text boundary", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "npm@10.9.8", scripts: {} },
      ["package-lock.json"],
    ));
    const policy = makeValidationPolicy({ selection, scripts: { test: "vitest run" } });
    const secret = "sandbox-finalize-secret";
    const authentication = await Effect.runPromise(signValidationPolicy(
      secret,
      "sandbox-finalize",
      policy,
    ));
    const changedFiles = ["src/first.ts", "src/line\nbreak.ts"];
    const fixture = await runFinalize({
      policy: { version: 1, policy, authentication },
      packageScript: "vitest run",
      resultPath: PI_RESULT_PATH,
      changedFiles,
    });

    expect(fixture.response.status).toBe(200);
    await expect(fixture.response.json()).resolves.toMatchObject({ changedFiles });
    expect(fixture.commands.some((command) =>
      command.includes("/usr/bin/base64 -w0") && command.includes("changed-files.z"))).toBe(true);
  });

  test("rejects malformed encoded changed-file evidence", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "npm@10.9.8", scripts: {} },
      ["package-lock.json"],
    ));
    const policy = makeValidationPolicy({ selection, scripts: { test: "vitest run" } });
    const secret = "sandbox-finalize-secret";
    const authentication = await Effect.runPromise(signValidationPolicy(
      secret,
      "sandbox-finalize",
      policy,
    ));
    const fixture = await runFinalize({
      policy: { version: 1, policy, authentication },
      packageScript: "vitest run",
      resultPath: PI_RESULT_PATH,
      changedFilesPayload: "not-base64",
    });

    expect(fixture.response.status).toBe(500);
    await expect(fixture.response.json()).resolves.toMatchObject({
      error: "SandboxOperationFailed",
      operation: "decode-changed-files",
    });
    expect(fixture.destroyed).toBe(true);
  });

  test("rejects malformed managed-process cleanup results at the Sandbox boundary", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "npm@10.9.8", scripts: {} },
      ["package-lock.json"],
    ));
    const policy = makeValidationPolicy({ selection, scripts: { test: "vitest run" } });
    const secret = "sandbox-finalize-secret";
    const authentication = await Effect.runPromise(signValidationPolicy(
      secret,
      "sandbox-finalize",
      policy,
    ));
    const fixture = await runFinalize({
      policy: { version: 1, policy, authentication },
      packageScript: "vitest run",
      resultPath: PI_RESULT_PATH,
      managedProcessCleanupResult: "zero",
    });

    expect(fixture.response.status).toBe(500);
    await expect(fixture.response.json()).resolves.toMatchObject({
      error: "SandboxOperationFailed",
      operation: "cleanup-runner-agent-processes",
    });
    expect(fixture.managedProcessCleanups).toBe(1);
    expect(fixture.destroyed).toBe(true);
  });

  test("rejects pre-strategy runs instead of issuing legacy validated claims", async () => {
    const fixture = await runFinalize({
      policy: {
        packageManager: "npm",
        installCommand: "npm ci --ignore-scripts=false",
        baselineCommand: "npm test",
        checks: [{ name: "tests", command: "npm test" }],
      },
      packageScript: "npm test",
      resultPath: LEGACY_PI_RESULT_PATH,
    });

    expect(fixture.response.status).toBe(500);
    await expect(fixture.response.json()).resolves.toEqual({
      error: "SandboxOperationFailed",
      operation: "unsupported-legacy-runtime",
      message: "This Agent Run predates the current validation boundary and must be rerun",
    });
    expect(fixture.commands).not.toContain("npm test");
    expect(fixture.commands.some((command) => command.includes("git diff"))).toBe(false);
    expect(fixture.destroyed).toBe(true);
  });
});
