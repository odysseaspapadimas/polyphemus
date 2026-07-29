import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  decodePiActivityEvent,
  decodeSandboxRunStartRequest,
  InvalidSandboxRequest,
} from "../src/domain/sandbox-run.ts";

describe("sandbox run contracts", () => {
  test("decodes a valid start request", async () => {
    const result = await Effect.runPromise(decodeSandboxRunStartRequest({
      sandboxId: "run-1",
      repositoryUrl: "https://github.com/example/fixture",
      task: "Fix the interval merge defect",
    }));

    expect(result.sandboxId).toBe("run-1");
  });

  test("rejects an empty task with a typed boundary error", async () => {
    const exit = await Effect.runPromiseExit(decodeSandboxRunStartRequest({
      sandboxId: "run-1",
      repositoryUrl: "https://github.com/example/fixture",
      task: " ",
    }));

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain(InvalidSandboxRequest.name);
    }
  });

  test("ignores non-product runner output", () => {
    expect(Option.isNone(decodePiActivityEvent({ type: "debug", value: "raw" }))).toBe(true);
  });
});
