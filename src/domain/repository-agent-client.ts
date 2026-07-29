import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import {
  SandboxCancelResultSchema,
  SandboxProcessStatusResultSchema,
  SandboxRunResultSchema,
  SandboxRunStartResultSchema,
} from "./sandbox-run.ts";

export class RepositoryAgentRequestFailed extends Schema.TaggedErrorClass<RepositoryAgentRequestFailed>()(
  "RepositoryAgentRequestFailed",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

type SandboxPath =
  | "/sandbox-runs/start"
  | "/sandbox-runs/status"
  | "/sandbox-runs/finalize"
  | "/sandbox-runs/cancel";

type RepositoryAgentFetch = (
  request: HttpClientRequest.HttpClientRequest,
) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  HttpClientError.RequestError,
  never
>;

const workerErrorMessage = (value: unknown, status: number): string => {
  if (typeof value === "object" && value !== null && "message" in value) {
    return String(value.message);
  }
  return `Sandbox runtime returned HTTP ${status}`;
};

export const makeRepositoryAgentClient = (
  fetchRepositoryAgent: RepositoryAgentFetch,
  token: Redacted.Redacted<string>,
) => {
  const post = <A, I>(path: SandboxPath, body: unknown, schema: Schema.Codec<A, I, never>) =>
    Effect.gen(function* () {
      const request = HttpClientRequest.post(
        `https://sandbox-runtime.internal${path}`,
      ).pipe(
        HttpClientRequest.setHeaders({
          Authorization: `Bearer ${Redacted.value(token)}`,
          "Content-Type": "application/json",
        }),
        HttpClientRequest.bodyJsonUnsafe(body),
      );
      const response = yield* fetchRepositoryAgent(request).pipe(
        Effect.mapError((cause) => new RepositoryAgentRequestFailed({
          operation: path,
          message: "Could not reach the Sandbox runtime",
          cause,
        })),
      );
      const value = yield* response.json.pipe(
        Effect.mapError((cause) => new RepositoryAgentRequestFailed({
          operation: path,
          message: "Sandbox runtime returned invalid JSON",
          cause,
        })),
      );
      if (response.status < 200 || response.status >= 300) {
        return yield* Effect.fail(new RepositoryAgentRequestFailed({
          operation: path,
          message: workerErrorMessage(value, response.status),
        }));
      }
      return yield* Schema.decodeUnknownEffect(schema)(value).pipe(
        Effect.mapError((cause) => new RepositoryAgentRequestFailed({
          operation: path,
          message: "Sandbox runtime response did not match its contract",
          cause,
        })),
      );
    });

  return {
    start: (input: unknown) => post("/sandbox-runs/start", input, SandboxRunStartResultSchema),
    status: (input: unknown) => post("/sandbox-runs/status", input, SandboxProcessStatusResultSchema),
    finalize: (input: unknown) => post("/sandbox-runs/finalize", input, SandboxRunResultSchema),
    cancel: (input: unknown) => post("/sandbox-runs/cancel", input, SandboxCancelResultSchema),
  };
};
