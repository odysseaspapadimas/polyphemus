import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  decodeRepositoryValidationPolicy,
  makeValidationPolicy,
  parsePublicGithubRepository,
  renderRepositoryExecutionCommand,
  selectRepositoryPackageManager,
  type PackageManifest,
  type RepositoryPackageFile,
} from "../src/domain/repository-policy.ts";

describe("public repository policy", () => {
  test("canonicalizes one public GitHub repository URL", async () => {
    await expect(Effect.runPromise(parsePublicGithubRepository(
      "https://github.com/effect-ts/effect.git/",
    ))).resolves.toEqual({
      owner: "effect-ts",
      repository: "effect",
      canonicalUrl: "https://github.com/effect-ts/effect",
    });
  });

  test("rejects credentials, non-GitHub hosts, and repository subpaths", async () => {
    for (const url of [
      "https://token@github.com/owner/repository",
      "https://gitlab.com/owner/repository",
      "https://github.com/owner/repository/issues/1",
    ]) {
      await expect(Effect.runPromise(parsePublicGithubRepository(url))).rejects.toMatchObject({
        _tag: "InvalidRepositoryUrl",
      });
    }
  });

  test("pins each supported package manager in frozen install and check commands", async () => {
    const cases = [
      {
        packageManager: "bun@1.3.12",
        files: ["bun.lock"] as const,
        install: "bun --config=/workspace/package-manager-config/bunfig.toml install --frozen-lockfile --ignore-scripts --cwd /workspace/repository",
        renderedInstall: "'/usr/local/bin/polyphemus-repository-exec' 'bun' '--config=/workspace/package-manager-config/bunfig.toml' 'install' '--frozen-lockfile' '--ignore-scripts' '--cwd' '/workspace/repository'",
      },
      {
        packageManager: "npm@10.9.8",
        files: ["package-lock.json"] as const,
        install: "corepack npm@10.9.8 ci --ignore-scripts",
        renderedInstall: "'/usr/local/bin/polyphemus-repository-exec' 'corepack' 'npm@10.9.8' 'ci' '--ignore-scripts'",
      },
      {
        packageManager: "pnpm@11.17.0",
        files: ["pnpm-lock.yaml"] as const,
        install: "corepack pnpm@11.17.0 install --frozen-lockfile --ignore-scripts --ignore-pnpmfile",
        renderedInstall: "'/usr/local/bin/polyphemus-repository-exec' 'corepack' 'pnpm@11.17.0' 'install' '--frozen-lockfile' '--ignore-scripts' '--ignore-pnpmfile'",
      },
      {
        packageManager: "yarn@1.22.22",
        files: ["yarn.lock"] as const,
        install: "YARN_IGNORE_PATH=1 YARN_SCRIPT_SHELL=/bin/sh corepack yarn@1.22.22 install --frozen-lockfile --ignore-scripts",
        renderedInstall: "YARN_IGNORE_PATH='1' YARN_SCRIPT_SHELL='/bin/sh' '/usr/local/bin/polyphemus-repository-exec' 'corepack' 'yarn@1.22.22' 'install' '--frozen-lockfile' '--ignore-scripts'",
      },
      {
        packageManager: "yarn@4.18.0",
        files: ["yarn.lock", ".yarnrc.yml"] as const,
        install: "YARN_IGNORE_PATH=1 YARN_RC_FILENAME=.polyphemus-yarnrc.yml corepack yarn@4.18.0 install --immutable --mode=skip-build",
        renderedInstall: "YARN_IGNORE_PATH='1' YARN_RC_FILENAME='.polyphemus-yarnrc.yml' '/usr/local/bin/polyphemus-repository-exec' 'corepack' 'yarn@4.18.0' 'install' '--immutable' '--mode=skip-build'",
      },
    ] as const;

    for (const item of cases) {
      const selection = await Effect.runPromise(selectRepositoryPackageManager(
        { packageManager: item.packageManager, scripts: {} },
        item.files,
      ));
      const policy = makeValidationPolicy({
        selection,
        scripts: { test: "vitest", typecheck: "tsc --noEmit", release: "publish" },
      });
      expect(policy.version).toBe(2);
      expect(policy.install.display).toBe(item.install);
      expect(policy.checks.map((check) => ({
        packageScript: check.packageScript,
        expectedScript: check.expectedScript,
        command: check.command.display,
      }))).toEqual([
        { packageScript: "test", expectedScript: "vitest", command: "/bin/sh -c \"vitest\"" },
        { packageScript: "typecheck", expectedScript: "tsc --noEmit", command: "/bin/sh -c \"tsc --noEmit\"" },
      ]);
      expect(renderRepositoryExecutionCommand(policy.install)).toBe(item.renderedInstall);
    }
  });

  test("infers one unambiguous non-Yarn lockfile with a pinned default", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { scripts: {} },
      ["pnpm-lock.yaml"],
    ));
    expect(selection).toEqual({
      packageManager: "pnpm",
      packageManagerVersion: "11.17.0",
      lockfile: "pnpm-lock.yaml",
      yarnMode: null,
    });
  });

  test("uses an exact packageManager declaration to disambiguate lockfiles", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "pnpm@11.17.0+sha512.ABC=", scripts: {} },
      ["package-lock.json", "pnpm-lock.yaml"],
    ));
    expect(selection).toEqual({
      packageManager: "pnpm",
      packageManagerVersion: "11.17.0+sha512.ABC=",
      lockfile: "pnpm-lock.yaml",
      yarnMode: null,
    });
  });

  test("binds validation policy to the recorded package script body", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "npm@10.9.8", scripts: {} },
      ["package-lock.json"],
    ));
    const original = makeValidationPolicy({ selection, scripts: { test: "vitest run" } });
    const weakened = makeValidationPolicy({ selection, scripts: { test: "true" } });
    expect(original.checks[0]?.expectedScript).toBe("vitest run");
    expect(weakened.checks).toEqual([]);
    expect(original).not.toEqual(weakened);
  });

  test("round-trips a canonical stored policy and accepts the legacy shape", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "npm@10.9.8", scripts: {} },
      ["package-lock.json"],
    ));
    const policy = makeValidationPolicy({ selection, scripts: { test: "bun test" } });
    await expect(Effect.runPromise(decodeRepositoryValidationPolicy(
      JSON.parse(JSON.stringify(policy)) as unknown,
    ))).resolves.toEqual(policy);

    const legacy = {
      packageManager: "npm",
      installCommand: "npm ci --ignore-scripts=false",
      baselineCommand: "npm test",
      checks: [{ name: "tests", command: "npm test" }],
    } as const;
    await expect(Effect.runPromise(decodeRepositoryValidationPolicy(legacy)))
      .resolves.toMatchObject({ packageManager: "npm" });
    await expect(Effect.runPromise(decodeRepositoryValidationPolicy({
      ...legacy,
      version: 2,
    }))).rejects.toMatchObject({ _tag: "UnsupportedRepository" });
    await expect(Effect.runPromise(decodeRepositoryValidationPolicy({
      ...legacy,
      checks: [{ name: "tests", command: "rm -rf /workspace" }],
    }))).rejects.toMatchObject({ _tag: "UnsupportedRepository" });
  });

  test("rejects a structurally valid policy whose selection or commands were changed", async () => {
    const selection = await Effect.runPromise(selectRepositoryPackageManager(
      { packageManager: "yarn@4.18.0", scripts: {} },
      ["yarn.lock"],
    ));
    const policy = makeValidationPolicy({ selection, scripts: { test: "vitest" } });
    const tamperedPolicies = [
      { ...policy, selection: { ...policy.selection, yarnMode: "classic" } },
      { ...policy, install: { ...policy.install, args: ["yarn@4.18.0", "install"] } },
      {
        ...policy,
        checks: [{
          ...policy.checks[0]!,
          command: { ...policy.checks[0]!.command, args: ["yarn@4.18.0", "run", "release"] },
        }],
      },
      {
        ...policy,
        checks: [{ ...policy.checks[0]!, expectedScript: "   " }],
      },
      {
        ...policy,
        checks: [{
          ...policy.checks[0]!,
          expectedScript: "true",
          command: {
            display: "/bin/sh -c \"true\"",
            program: "/bin/sh" as const,
            args: ["-c", "true"],
            environment: {},
          },
        }],
      },
    ];
    for (const tampered of tamperedPolicies) {
      await expect(Effect.runPromise(decodeRepositoryValidationPolicy(tampered)))
        .rejects.toMatchObject({ _tag: "UnsupportedRepository" });
    }
  });

  test("fails closed for ambiguous, mismatched, and unsupported repository metadata", async () => {
    const cases: ReadonlyArray<readonly [PackageManifest, readonly RepositoryPackageFile[]]> = [
      [{ scripts: {} }, ["package-lock.json", "pnpm-lock.yaml"]],
      [{ packageManager: "pnpm@11.17.0", scripts: {} }, ["package-lock.json"]],
      [{ scripts: {} }, ["yarn.lock"]],
      [{ packageManager: "pnpm@latest", scripts: {} }, ["pnpm-lock.yaml"]],
      [{ packageManager: "bun@1.3.12", scripts: {} }, ["bun.lock", "bun.lockb"]],
      [{ packageManager: "bun@1.3.14", scripts: {} }, ["bun.lock"]],
      [{ packageManager: "yarn@0.32.0", scripts: {} }, ["yarn.lock"]],
      [{ scripts: {} }, []],
    ];
    for (const [manifest, files] of cases) {
      await expect(Effect.runPromise(selectRepositoryPackageManager(manifest, files)))
        .rejects.toMatchObject({ _tag: "UnsupportedRepository" });
    }
  });
});
