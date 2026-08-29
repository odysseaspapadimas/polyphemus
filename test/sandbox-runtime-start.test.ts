import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  REPOSITORY_SAFE_BUNFIG_PATH,
  REPOSITORY_SAFE_YARN_RC_FILENAME,
} from "../src/domain/repository-policy.ts";
import {
  decodeStoredValidationPolicy,
  handleSandboxRuntimeRequest,
  type SandboxRuntimeEnv,
} from "../src/sandbox-runtime.ts";
import {
  GIT_METADATA_DIR,
  MODEL_PROXY_TOKEN_PATH,
  VALIDATION_POLICY_PATH,
} from "../src/sandbox-config.ts";

const timestamp = "2026-07-29T00:00:00.000Z";
const baseSha = "0123456789abcdef0123456789abcdef01234567";

describe("Sandbox Runtime start adapter", () => {
  test("persists an authenticated strategy and starts the isolated runner identity", async () => {
    const files = new Map<string, string>();
    const commands: string[] = [];
    const executions: Array<{ command: string; options: unknown }> = [];
    let configured = false;
    let sandboxConfiguration: unknown;
    let startedCommand: string | undefined;
    let startedOptions: Record<string, unknown> | undefined;

    const sandbox = {
      async configure(configuration: unknown) {
        configured = true;
        sandboxConfiguration = configuration;
      },
      async mkdir(path: string, options?: unknown) {
        expect(configured).toBe(true);
        return {
          success: true,
          path,
          recursive: (options as { recursive?: boolean } | undefined)?.recursive === true,
          timestamp,
        };
      },
      async gitCheckout(repoUrl: string, options?: unknown) {
        const targetDir = (options as { targetDir?: string }).targetDir!;
        return { success: true, repoUrl, branch: "main", targetDir, timestamp };
      },
      async exec(command: string, options?: unknown) {
        commands.push(command);
        executions.push({ command, options });
        const stdout = command.includes("rev-parse")
          ? `${baseSha}\n`
          : command.startsWith("for file in ")
            ? "pnpm-lock.yaml\n"
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
      async writeFile(path: string, content: string) {
        files.set(path, content);
        return { success: true, path, timestamp };
      },
      async readFile(path: string) {
        expect(path).toBe("/workspace/repository/package.json");
        return {
          success: true,
          path,
          content: JSON.stringify({
            packageManager: "pnpm@11.17.0",
            scripts: { test: "vitest" },
          }),
          timestamp,
          encoding: "utf-8",
          isBinary: false,
        };
      },
      async startProcess(command: string, options?: unknown) {
        startedCommand = command;
        startedOptions = options as Record<string, unknown>;
        const processId = (startedOptions.processId as string);
        return {
          id: processId,
          command,
          status: "running",
          async getLogs() { return { stdout: "", stderr: "" }; },
          async getStatus() { return "running"; },
          async kill() {},
        };
      },
      async getProcess() { return null; },
      async destroy() {},
    };
    const secret = "sandbox-runtime-boundary-secret";
    const env = {
      Sandbox: { getByName: () => sandbox },
      MODEL_PROXY_ORIGIN: "https://model-proxy.example.test",
      SANDBOX_API_TOKEN: secret,
      VALIDATION_POLICY_SIGNING_KEY: secret,
      MODEL_GRANT_SIGNING_KEY: secret,
    } as unknown as SandboxRuntimeEnv;

    const response = await handleSandboxRuntimeRequest(new Request(
      "https://sandbox-runtime.example.test/sandbox-runs/start",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sandboxId: "sandbox-pnpm-strategy",
          repositoryUrl: "https://github.com/example/repository",
          task: "Make one bounded change",
        }),
      },
    ), env);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      sandboxId: "sandbox-pnpm-strategy",
      baseSha,
      initialTestExitCode: 0,
    });
    expect(sandboxConfiguration).toEqual({
      transport: "http",
      keepAlive: true,
      labels: { application: "polyphemus", workload: "agent-run" },
    });
    expect(commands.some((command) => command.includes(
      "'/usr/local/bin/polyphemus-repository-exec' 'corepack' 'pnpm@11.17.0' 'install' '--frozen-lockfile' '--ignore-scripts' '--ignore-pnpmfile'",
    ))).toBe(true);
    expect(commands.some((command) => command.includes(
      `mv '/workspace/repository/.git' '${GIT_METADATA_DIR}'`,
    ))).toBe(true);
    expect(commands.filter((command) => command.includes(
      "/usr/local/bin/polyphemus-repository-cleanup",
    )).length).toBeGreaterThanOrEqual(2);
    const baseline = executions.find(({ command }) =>
      command.includes("'/bin/sh' '-c' 'vitest'"));
    expect(baseline?.options).toMatchObject({ timeout: 300_000 });
    expect(startedCommand).toBe(
      `/usr/local/bin/polyphemus-agent-exec bun --config=${REPOSITORY_SAFE_BUNFIG_PATH} /opt/polyphemus/main.ts`,
    );
    expect(startedOptions?.cwd).toBe("/opt/polyphemus");
    const runnerEnvironment = startedOptions?.env as Record<string, string>;
    expect(runnerEnvironment.POLYPHEMUS_MODEL_PROXY_TOKEN).toBeUndefined();
    expect(runnerEnvironment.POLYPHEMUS_RESULT_PATH).toBeUndefined();
    expect(files.has(MODEL_PROXY_TOKEN_PATH)).toBe(true);
    expect(files.get(REPOSITORY_SAFE_BUNFIG_PATH)).toBe("");
    expect(files.get(`/workspace/repository/${REPOSITORY_SAFE_YARN_RC_FILENAME}`))
      .toContain("enableScripts: false");
    expect(commands.some((command) => command.includes(
      `chmod 0600 '${MODEL_PROXY_TOKEN_PATH}'`,
    ))).toBe(true);

    const storedEnvelope = JSON.parse(files.get(VALIDATION_POLICY_PATH)!) as unknown;
    const storedPolicy = await Effect.runPromise(decodeStoredValidationPolicy(
      secret,
      "sandbox-pnpm-strategy",
      storedEnvelope,
    ));
    expect(storedPolicy).toMatchObject({
      version: 2,
      selection: {
        packageManager: "pnpm",
        packageManagerVersion: "11.17.0",
      },
      checks: [{
        name: "tests",
        packageScript: "test",
        expectedScript: "vitest",
      }],
    });
  });
});
