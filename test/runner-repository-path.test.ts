import { describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepositoryPathResolver } from "../runner/repository-path.ts";

describe("runner repository path policy", () => {
  test("allows repository files while rejecting Git metadata and escaping symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "polyphemus-path-"));
    const repository = join(root, "repository");
    const outside = join(root, "outside");
    try {
      await mkdir(join(repository, ".git"), { recursive: true });
      await mkdir(outside);
      await writeFile(join(repository, "source.ts"), "export {};\n");
      await writeFile(join(repository, ".git", "config"), "[core]\n");
      await writeFile(join(outside, "secret"), "not repository data\n");
      await symlink(join(repository, ".git"), join(repository, "git-link"));
      await symlink(outside, join(repository, "outside-link"));

      const repositoryPath = makeRepositoryPathResolver(repository);
      await expect(repositoryPath("source.ts")).resolves.toBe(
        await realpath(join(repository, "source.ts")),
      );
      await expect(repositoryPath("new/directory/file.ts", { mayNotExist: true }))
        .resolves.toBe(join(repository, "new/directory/file.ts"));

      for (const path of [
        ".git/config",
        "git-link/config",
        "outside-link/secret",
        "../outside/secret",
      ]) {
        await expect(repositoryPath(path)).rejects.toThrow();
      }
      await expect(repositoryPath("outside-link/new-file", { mayNotExist: true }))
        .rejects.toThrow();
      await expect(repositoryPath(".git/new-file", { mayNotExist: true }))
        .rejects.toThrow("Git metadata is not accessible");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
