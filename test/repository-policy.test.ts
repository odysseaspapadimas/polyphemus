import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  makeValidationPolicy,
  parsePublicGithubRepository,
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

  test("derives bounded validation from declared package scripts", () => {
    expect(makeValidationPolicy({
      packageManager: "npm",
      scripts: { test: "vitest", typecheck: "tsc --noEmit", release: "publish" },
    })).toEqual({
      packageManager: "npm",
      installCommand: "npm ci --ignore-scripts=false",
      baselineCommand: "npm test",
      checks: [
        { name: "tests", command: "npm test" },
        { name: "typecheck", command: "npm run typecheck" },
      ],
    });
  });
});
