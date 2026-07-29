import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { makeRepositoryPathResolver } from "./repository-path.ts";

const REPOSITORY_DIR = "/workspace/repository";
const MAX_DIRECTORY_ENTRIES = 100_000;

const OperationSchema = Type.Union([
  Type.Literal("read"),
  Type.Literal("access-read"),
  Type.Literal("access-read-write"),
  Type.Literal("write"),
  Type.Literal("mkdir"),
  Type.Literal("exists"),
  Type.Literal("stat"),
  Type.Literal("readdir"),
  Type.Literal("glob"),
]);
const PathSchema = Type.String({ minLength: 1, maxLength: 4_096 });
const DirectoryEntriesSchema = Type.Array(
  Type.String({ maxLength: 4_096 }),
  { maxItems: MAX_DIRECTORY_ENTRIES },
);
const GlobRequestSchema = Type.Object({
  pattern: Type.String({ minLength: 1, maxLength: 4_096 }),
  cwd: PathSchema,
  ignore: Type.Array(Type.String({ maxLength: 4_096 }), { maxItems: 16 }),
  limit: Type.Integer({ minimum: 1, maximum: 10_000 }),
}, { additionalProperties: false });
type GlobRequest = Static<typeof GlobRequestSchema>;

const fail = (message: string): never => {
  throw new Error(message);
};

const readStdin = async (): Promise<Buffer> =>
  Buffer.from(await new Response(Bun.stdin.stream()).arrayBuffer());

const writeJson = (value: unknown): void => {
  process.stdout.write(JSON.stringify(value));
};

const isIgnoredPath = (path: string, ignored: readonly string[]): boolean => {
  const segments = path.split("/");
  if (segments.includes(".git") || segments.includes("node_modules")) return true;
  return ignored.some((pattern) =>
    pattern.includes(".git") && segments.includes(".git") ||
    pattern.includes("node_modules") && segments.includes("node_modules"));
};

const main = async (): Promise<void> => {
  const operation: unknown = process.argv[2];
  if (!Value.Check(OperationSchema, operation)) fail("Unknown repository file operation");

  const repositoryPath = makeRepositoryPathResolver(REPOSITORY_DIR);
  if (operation === "glob") {
    const input: unknown = JSON.parse((await readStdin()).toString("utf8"));
    if (!Value.Check(GlobRequestSchema, input)) fail("Invalid repository glob request");
    const request = input as GlobRequest;
    const safeCwd = await repositoryPath(request.cwd);
    const files: string[] = [];
    for await (const path of new Bun.Glob(request.pattern).scan({
      cwd: safeCwd,
      dot: true,
      onlyFiles: true,
    })) {
      if (isIgnoredPath(path, request.ignore)) continue;
      files.push(path);
      if (files.length >= request.limit) break;
    }
    if (!Value.Check(DirectoryEntriesSchema, files)) fail("Malformed repository glob result");
    writeJson(files);
    return;
  }

  const path: unknown = process.argv[3];
  if (!Value.Check(PathSchema, path)) fail("Invalid repository path");
  const requestedPath = path as string;

  switch (operation) {
    case "read": {
      const contents = await readFile(await repositoryPath(requestedPath));
      process.stdout.write(contents);
      return;
    }
    case "access-read":
      await access(await repositoryPath(requestedPath), fsConstants.R_OK);
      return;
    case "access-read-write":
      await access(await repositoryPath(requestedPath), fsConstants.R_OK | fsConstants.W_OK);
      return;
    case "write":
      await writeFile(
        await repositoryPath(requestedPath, { mayNotExist: true }),
        await readStdin(),
      );
      return;
    case "mkdir":
      await mkdir(
        await repositoryPath(requestedPath, { mayNotExist: true }),
        { recursive: true },
      );
      return;
    case "exists": {
      try {
        await lstat(await repositoryPath(requestedPath));
        writeJson({ exists: true });
      } catch {
        writeJson({ exists: false });
      }
      return;
    }
    case "stat": {
      const result = await stat(await repositoryPath(requestedPath));
      writeJson({ isDirectory: result.isDirectory() });
      return;
    }
    case "readdir": {
      const entries = (await readdir(await repositoryPath(requestedPath)))
        .filter((entry) => entry !== ".git");
      if (!Value.Check(DirectoryEntriesSchema, entries)) {
        fail("Malformed repository directory result");
      }
      writeJson(entries);
      return;
    }
  }
};

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : "Repository file operation failed");
  process.exitCode = 1;
});
