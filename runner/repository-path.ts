import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export interface RepositoryPathOptions {
  readonly mayNotExist?: boolean;
}

class RepositoryPathError extends Error {}

const isWithin = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

const isGitMetadata = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate);
  return path === ".git" || path.startsWith(".git/");
};

const assertRepositoryPath = (root: string, candidate: string): void => {
  if (!isWithin(root, candidate)) {
    throw new RepositoryPathError("Path is outside the repository");
  }
  if (isGitMetadata(root, candidate)) {
    throw new RepositoryPathError("Git metadata is not accessible");
  }
};

const isMissingPathError = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";

export const makeRepositoryPathResolver = (repositoryDirectory: string) => {
  const repositoryRoot = realpath(repositoryDirectory);

  return async (
    input: string,
    options: RepositoryPathOptions = {},
  ): Promise<string> => {
    const root = await repositoryRoot;
    const lexical = resolve(root, input);
    assertRepositoryPath(root, lexical);

    if (!options.mayNotExist) {
      const resolved = await realpath(lexical);
      assertRepositoryPath(root, resolved);
      return resolved;
    }

    const missing: string[] = [];
    let cursor = lexical;
    while (true) {
      try {
        const existing = await realpath(cursor);
        assertRepositoryPath(root, existing);
        const resolved = resolve(existing, ...missing.reverse());
        assertRepositoryPath(root, resolved);
        return resolved;
      } catch (cause) {
        if (cause instanceof RepositoryPathError || !isMissingPathError(cause)) throw cause;
        const parent = dirname(cursor);
        if (parent === cursor) throw cause;
        missing.push(relative(parent, cursor));
        cursor = parent;
      }
    }
  };
};
