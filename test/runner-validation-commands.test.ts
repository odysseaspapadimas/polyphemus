import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  makeValidationPolicy,
  selectRepositoryPackageManager,
} from "../src/domain/repository-policy.ts";
import {
  decodeValidationCommands,
  resolveBoundedOperation,
} from "../runner/validation-commands.ts";

const npmPolicy = {
  version: 1,
  checks: [{
    name: "tests",
    packageScript: "test",
    expectedScript: "vitest run",
    command: {
      display: "/bin/sh -c \"vitest run\"",
      program: "/bin/sh",
      args: ["-c", "vitest run"],
      environment: {},
    },
  }],
};

describe("runner validation command policy", () => {
  test("accepts the canonical worker contract and resolves exact argv", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "pnpm@11.17.0", scripts: {} },
      ["pnpm-lock.yaml"],
    ));
    const repositoryPolicy = makeValidationPolicy({
      selection,
      scripts: { test: "vitest", typecheck: "tsc --noEmit" },
    });
    const policy = decodeValidationCommands(JSON.stringify({
      version: 1,
      checks: repositoryPolicy.checks,
    }));

    expect(resolveBoundedOperation(policy, "tests")).toEqual({
      display: "/bin/sh -c \"vitest\"",
      program: "/bin/sh",
      args: ["-c", "vitest"],
      environment: {},
    });
    expect(resolveBoundedOperation(policy, "typecheck")).toEqual({
      display: "/bin/sh -c \"tsc --noEmit\"",
      program: "/bin/sh",
      args: ["-c", "tsc --noEmit"],
      environment: {},
    });
  });

  test("keeps Git inspection to fixed read-only argv", () => {
    const policy = decodeValidationCommands(JSON.stringify(npmPolicy));
    const safeGit = [
      "--git-dir=/workspace/git-metadata",
      "--work-tree=/workspace/repository",
      "--no-replace-objects",
      "-c", "safe.directory=/workspace/repository",
      "-c", "core.hooksPath=/dev/null",
      "-c", "core.fsmonitor=false",
      "-c", "core.pager=cat",
      "-c", "diff.external=",
    ];
    expect(resolveBoundedOperation(policy, "git-status")).toEqual({
      display: "git status --short",
      program: "git",
      args: [...safeGit, "status", "--short"],
      environment: {},
    });
    expect(resolveBoundedOperation(policy, "git-diff")).toEqual({
      display: "git diff --no-ext-diff --",
      program: "git",
      args: [...safeGit, "diff", "--no-ext-diff", "--no-textconv", "--"],
      environment: {},
    });
    expect(resolveBoundedOperation(policy, "git-diff-check")).toEqual({
      display: "git diff --check",
      program: "git",
      args: [...safeGit, "diff", "--no-ext-diff", "--no-textconv", "--check"],
      environment: {},
    });
  });

  test("runs only the authenticated script body through the fixed shell", () => {
    const expectedScript = "eslint . && node -e \"console.log('ok')\"";
    const policy = decodeValidationCommands(JSON.stringify({
      version: 1,
      checks: [{
        name: "lint",
        packageScript: "lint",
        expectedScript,
        command: {
          display: `/bin/sh -c ${JSON.stringify(expectedScript)}`,
          program: "/bin/sh",
          args: ["-c", expectedScript],
          environment: {},
        },
      }],
    }));
    expect(resolveBoundedOperation(policy, "lint")).toEqual({
      display: `/bin/sh -c ${JSON.stringify(expectedScript)}`,
      program: "/bin/sh",
      args: ["-c", expectedScript],
      environment: {},
    });
  });

  test("rejects arbitrary scripts, executables, environment, duplicates, and extra fields", () => {
    const invalid = [
      {
        ...npmPolicy,
        checks: [{
          ...npmPolicy.checks[0]!,
          command: { ...npmPolicy.checks[0]!.command, args: ["-c", "true"] },
        }],
      },
      {
        ...npmPolicy,
        checks: [{
          ...npmPolicy.checks[0]!,
          command: { ...npmPolicy.checks[0]!.command, program: "bash", args: ["-lc", "id"] },
        }],
      },
      {
        ...npmPolicy,
        checks: [{
          ...npmPolicy.checks[0]!,
          command: { ...npmPolicy.checks[0]!.command, environment: { PATH: "/tmp" } },
        }],
      },
      { ...npmPolicy, checks: [npmPolicy.checks[0], npmPolicy.checks[0]] },
      { ...npmPolicy, unexpected: true },
      {
        ...npmPolicy,
        checks: [{
          ...npmPolicy.checks[0]!,
          command: { ...npmPolicy.checks[0]!.command, display: "npm test" },
        }],
      },
      {
        ...npmPolicy,
        checks: [{ ...npmPolicy.checks[0]!, packageScript: "lint" }],
      },
      {
        ...npmPolicy,
        checks: [{ ...npmPolicy.checks[0]!, expectedScript: "   " }],
      },
      {
        ...npmPolicy,
        checks: [{
          ...npmPolicy.checks[0]!,
          expectedScript: "true",
          command: {
            display: "/bin/sh -c \"true\"",
            program: "/bin/sh",
            args: ["-c", "true"],
            environment: {},
          },
        }],
      },
    ];
    for (const value of invalid) {
      expect(() => decodeValidationCommands(JSON.stringify(value))).toThrow();
    }
  });

  test("rejects missing checks and malformed configuration without executing", () => {
    const policy = decodeValidationCommands(JSON.stringify(npmPolicy));
    expect(() => resolveBoundedOperation(policy, "typecheck")).toThrow(
      "Validation check is unavailable: typecheck",
    );
    expect(() => decodeValidationCommands(undefined)).toThrow();
    expect(() => decodeValidationCommands("{" )).toThrow();
  });
});
