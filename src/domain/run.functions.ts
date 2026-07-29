import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { env } from "../env.ts";
import { decodeAccessIdentity, ProductIdentitySchema } from "./product-identity.ts";
import {
  decodeRepositoryRunHandle,
  decodeRepositoryRunRequest,
  RepositoryRunHandleSchema,
  RepositoryRunRequestSchema,
  StartAdditionalRunRequestSchema,
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

type BackendPath =
  | "/repository-tasks"
  | "/repository-tasks/runs"
  | "/repository-tasks/index"
  | "/repository-tasks/status"
  | "/repository-tasks/result"
  | "/repository-tasks/cancel";

const workerErrorMessage = (value: unknown, status: number): string => {
  if (typeof value === "object" && value !== null && "message" in value) {
    return String(value.message);
  }
  return `Repository Agent backend returned HTTP ${status}`;
};

const requireAccessIdentity = () => Effect.gen(function* () {
  const assertion = getRequestHeader("cf-access-jwt-assertion");
  if (assertion === undefined || assertion.trim().length === 0) {
    return yield* Effect.fail(new ProductShellRequestFailed({
      operation: "access-identity",
      message: "Cloudflare Access authentication is required",
    }));
  }
  return yield* decodeAccessIdentity(
    getRequestHeader("cf-access-authenticated-user-email"),
  ).pipe(Effect.mapError((cause) => new ProductShellRequestFailed({
    operation: "access-identity",
    message: cause.message,
    cause,
  })));
});

const postRepositoryAgentBackend = (path: BackendPath, body: unknown) => Effect.gen(function* () {
  const identity = yield* requireAccessIdentity();
  const response = yield* Effect.tryPromise({
    try: () => env.REPOSITORY_AGENT_BACKEND.fetch(new Request(`https://repository-agent.internal${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Polyphemus-User-Id": identity.userId,
      },
      body: JSON.stringify(body),
    })),
    catch: (cause) => new ProductShellRequestFailed({
      operation: path,
      message: "Could not reach the Repository Agent backend",
      cause,
    }),
  });
  const value = yield* Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: (cause) => new ProductShellRequestFailed({
      operation: path,
      message: "Repository Agent backend returned invalid JSON",
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

export const getCurrentUser = createServerFn({ method: "GET" })
  .handler(() => Effect.runPromise(
    requireAccessIdentity().pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        ProductIdentitySchema,
        "Access returned an invalid product identity",
      )),
    ),
  ));

export const listRepositoryTasks = createServerFn({ method: "GET" })
  .handler(() => Effect.runPromise(
    postRepositoryAgentBackend("/repository-tasks/index", {}).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        Schema.Array(RepositoryTaskSnapshotSchema),
        "Repository Agent backend returned an invalid Repository Task index",
      )),
    ),
  ));

export const startRepositoryRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunRequestSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postRepositoryAgentBackend("/repository-tasks", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        RepositoryRunHandleSchema,
        "Repository Agent backend returned an invalid Repository Task handle",
      )),
    ),
  ));

export const startAdditionalRepositoryRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(StartAdditionalRunRequestSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postRepositoryAgentBackend("/repository-tasks/runs", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        RepositoryRunHandleSchema,
        "Repository Agent backend returned an invalid additional Agent Run handle",
      )),
    ),
  ));

export const getRepositoryRunStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postRepositoryAgentBackend("/repository-tasks/status", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        RepositoryTaskSnapshotSchema,
        "Repository Agent backend returned an invalid Repository Task snapshot",
      )),
    ),
  ));

export const getRepositoryRunResult = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postRepositoryAgentBackend("/repository-tasks/result", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(RunArtifactSchema, "Repository Agent backend returned an invalid Run Result")),
    ),
  ));

export const cancelRepositoryRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    postRepositoryAgentBackend("/repository-tasks/cancel", data).pipe(
      Effect.mapError(toServerError),
      Effect.flatMap(decodeResponse(
        RepositoryTaskSnapshotSchema,
        "Repository Agent backend returned an invalid cancelled Repository Task",
      )),
    ),
  ));

// Export effectful decoders for non-React boundaries and integration tests.
export { decodeRepositoryRunHandle, decodeRepositoryRunRequest };
