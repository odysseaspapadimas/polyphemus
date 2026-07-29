import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import {
  CreateRepositoryTaskCommandSchema,
  CreateRepositoryTaskResultSchema,
  type CreateRepositoryTaskCommand,
} from "../src/domain/repository-agent-rpc.ts";

const validCommand: CreateRepositoryTaskCommand = {
  principal: { userId: "developer@example.com" },
  request: {
    repositoryUrl: "https://github.com/example/repository",
    task: "Fix one bounded defect",
  },
};

// This contract is intentionally derived from the schema, not maintained as a
// second handwritten wire type.
// @ts-expect-error an RPC create command must carry the complete Run Request
const compileTimeMismatch: CreateRepositoryTaskCommand = { principal: validCommand.principal };
void compileTimeMismatch;

describe("Repository Agent RPC contracts", () => {
  test("decodes a valid command and rejects malformed boundary values", async () => {
    expect(Schema.decodeUnknownSync(CreateRepositoryTaskCommandSchema)(validCommand)).toEqual(validCommand);
    const exit = await Effect.runPromiseExit(
      Schema.decodeUnknownEffect(CreateRepositoryTaskCommandSchema)({
        principal: { userId: "developer@example.com" },
        request: { repositoryUrl: "", task: "" },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  test("accepts plain domain-failure envelopes and rejects custom error instances", async () => {
    const failure = Schema.decodeUnknownSync(CreateRepositoryTaskResultSchema)({
      ok: false,
      error: {
        _tag: "RepositoryTaskConflict",
        message: "Repository Task already has an active Agent Run",
      },
    });
    expect(failure.ok).toBe(false);

    const malformed = await Effect.runPromiseExit(
      Schema.decodeUnknownEffect(CreateRepositoryTaskResultSchema)({
        ok: false,
        error: new Error("transport classes do not cross RPC"),
      }),
    );
    expect(Exit.isFailure(malformed)).toBe(true);
  });
});
