import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { env } from "../env.ts";
import {
  decodeRepositoryRunHandle,
  decodeRepositoryRunRequest,
  RepositoryRunHandleSchema,
  RepositoryRunRequestSchema,
  RepositoryTaskSnapshotSchema,
  RunArtifactSchema,
  type RepositoryRunRequest,
} from "./repository-task.ts";

export { RepositoryRunRequestSchema, type RepositoryRunRequest };

export class ProductShellRequestFailed extends Schema.TaggedErrorClass<ProductShellRequestFailed>()(
  "ProductShellRequestFailed",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

type ControlPath =
  | "/repository-tasks"
  | "/repository-tasks/status"
  | "/repository-tasks/result"
  | "/repository-tasks/cancel";

const workerErrorMessage = (value: unknown, status: number): string => {
  if (typeof value === "object" && value !== null && "message" in value) {
    return String(value.message);
  }
  return `Repository Task control plane returned HTTP ${status}`;
};

const postControlWorker = (path: ControlPath, body: unknown) => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: () => env.CONTROL_WORKER.fetch(new Request(`https://control.internal${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })),
    catch: (cause) => new ProductShellRequestFailed({
      operation: path,
      message: "Could not reach the Repository Task control plane",
      cause,
    }),
  });
  const value = yield* Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: (cause) => new ProductShellRequestFailed({
      operation: path,
      message: "Repository Task control plane returned invalid JSON",
      cause,
    }),
  });
  if (!response.ok) {
    return yield* Effect.fail(new ProductShellRequestFailed({
      operation: path,
      message: workerErrorMessage(value, response.status),
    }));
  }
  return value;
});

const toServerError = (error: ProductShellRequestFailed): Error => new Error(error.message);

const decodeResponse = <A, I>(
  schema: Schema.Codec<A, I, never>,
  invalidMessage: string,
) => (value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError(() => new Error(invalidMessage)),
);

export const startRepositoryRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunRequestSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postControlWorker("/repository-tasks", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        RepositoryRunHandleSchema,
        "Control plane returned an invalid Repository Task handle",
      )),
    ),
  ));

export const getRepositoryRunStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postControlWorker("/repository-tasks/status", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        RepositoryTaskSnapshotSchema,
        "Control plane returned an invalid Repository Task snapshot",
      )),
    ),
  ));

export const getRepositoryRunResult = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postControlWorker("/repository-tasks/result", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(RunArtifactSchema, "Control plane returned an invalid Run Result")),
    ),
  ));

export const cancelRepositoryRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postControlWorker("/repository-tasks/cancel", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        RepositoryTaskSnapshotSchema,
        "Control plane returned an invalid cancelled Repository Task",
      )),
    ),
  ));

// Export effectful decoders for non-React boundaries and integration tests.
export { decodeRepositoryRunHandle, decodeRepositoryRunRequest };
