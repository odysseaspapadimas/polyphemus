import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  makeValidationPolicy,
  selectRepositoryPackageManager,
} from "../src/domain/repository-policy.ts";
import {
  decodeSandboxExecResult,
  decodeSandboxReadFileResult,
  decodeStoredValidationPolicy,
  signValidationPolicy,
} from "../src/sandbox-runtime.ts";

const execResult = {
  success: true,
  exitCode: 0,
  stdout: "ok\n",
  stderr: "",
  command: "bun test",
  duration: 42,
  timestamp: "2026-07-29T00:00:00.000Z",
};

describe("Sandbox SDK result boundaries", () => {
  test("decodes a complete command result", async () => {
    await expect(Effect.runPromise(decodeSandboxExecResult("test-command", execResult)))
      .resolves.toEqual(execResult);
  });

  test("rejects malformed and internally inconsistent command results", async () => {
    for (const value of [
      { ...execResult, stdout: 42 },
      { ...execResult, success: false },
      { ...execResult, exitCode: 1 },
      { ...execResult, duration: -1 },
    ]) {
      await expect(Effect.runPromise(decodeSandboxExecResult("test-command", value)))
        .rejects.toMatchObject({
          _tag: "SandboxOperationFailed",
          operation: "test-command",
        });
    }
    await expect(Effect.runPromise(decodeSandboxExecResult(
      "test-command",
      execResult,
      "git diff --check",
    ))).rejects.toMatchObject({ _tag: "SandboxOperationFailed" });
  });

  test("authenticates current stored policy and rejects tampering or downgrade", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "pnpm@11.17.0", scripts: {} },
      ["pnpm-lock.yaml"],
    ));
    const policy = makeValidationPolicy({ selection, scripts: { test: "vitest" } });
    const secret = "boundary-test-secret";
    const sandboxId = "sandbox-boundary-test";
    const authentication = await Effect.runPromise(signValidationPolicy(
      secret,
      sandboxId,
      policy,
    ));
    const envelope = { version: 1, policy, authentication } as const;
    await expect(Effect.runPromise(decodeStoredValidationPolicy(
      secret,
      sandboxId,
      envelope,
    ))).resolves.toEqual(policy);

    await expect(Effect.runPromise(decodeStoredValidationPolicy(
      secret,
      sandboxId,
      {
        ...envelope,
        policy: { ...policy, checks: [] },
      },
    ))).rejects.toMatchObject({
      _tag: "SandboxOperationFailed",
      operation: "authenticate-validation-policy",
    });
    await expect(Effect.runPromise(decodeStoredValidationPolicy(
      secret,
      sandboxId,
      policy,
    ))).rejects.toMatchObject({ _tag: "SandboxOperationFailed" });
    await expect(Effect.runPromise(decodeStoredValidationPolicy(
      secret,
      "sandbox-other",
      envelope,
    ))).rejects.toMatchObject({
      _tag: "SandboxOperationFailed",
      operation: "authenticate-validation-policy",
    });
  });

  test("requires a successful text file result", async () => {
    const result = {
      success: true,
      path: "/workspace/control/value",
      content: "value\n",
      timestamp: "2026-07-29T00:00:00.000Z",
      encoding: "utf-8",
      size: 6,
    } as const;
    await expect(Effect.runPromise(decodeSandboxReadFileResult("read-value", result)))
      .resolves.toEqual(result);
    for (const value of [
      { ...result, success: false },
      { ...result, encoding: "base64" },
      { ...result, isBinary: true },
    ]) {
      await expect(Effect.runPromise(decodeSandboxReadFileResult("read-value", value)))
        .rejects.toMatchObject({
          _tag: "SandboxOperationFailed",
          operation: "read-value",
        });
    }
    await expect(Effect.runPromise(decodeSandboxReadFileResult(
      "read-value",
      result,
      "/workspace/control/other",
    ))).rejects.toMatchObject({ _tag: "SandboxOperationFailed" });
  });
});
