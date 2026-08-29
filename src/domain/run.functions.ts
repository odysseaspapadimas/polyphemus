import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { toRpcAsync } from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { RepositoryAgentBackend } from "../RepositoryAgentBackend.ts";
import { accessIdentityFor } from "../AccessIdentity.ts";
import { env } from "../env.ts";
import {
  CancelRepositoryRunResultSchema,
  CreateRepositoryTaskResultSchema,
  GetRepositoryTaskResultSchema,
  GetRunArtifactResultSchema,
  ListRepositoryTasksResultSchema,
  RepositoryAgentFailureTagSchema,
  RetryPullRequestPublicationResultSchema,
  StartAdditionalRepositoryRunResultSchema,
} from "./repository-agent-rpc.ts";
import { ProductIdentitySchema } from "./product-identity.ts";
import {
  decodeRepositoryRunHandle,
  decodeRepositoryRunRequest,
  RepositoryRunHandleSchema,
  RepositoryRunRequestSchema,
  StartAdditionalRunRequestSchema,
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

export class ProductShellAuthenticationFailed extends Schema.TaggedErrorClass<ProductShellAuthenticationFailed>()(
  "ProductShellAuthenticationFailed",
  { message: Schema.String },
) {}

export class RepositoryAgentDomainFailure extends Schema.TaggedErrorClass<RepositoryAgentDomainFailure>()(
  "RepositoryAgentDomainFailure",
  {
    failureTag: RepositoryAgentFailureTagSchema,
    operation: Schema.String,
    message: Schema.String,
  },
) {}

type ProductShellFailure =
  | ProductShellRequestFailed
  | ProductShellAuthenticationFailed
  | RepositoryAgentDomainFailure;

const requireAccessIdentity = () => {
  const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
  const verifier = accessIdentityFor({
    issuer: Schema.decodeUnknownSync(RequiredText)(env.ACCESS_ISSUER),
    audience: Schema.decodeUnknownSync(RequiredText)(env.ACCESS_AUDIENCE),
  });
  return verifier.verify(getRequestHeader("cf-access-jwt-assertion")).pipe(
    Effect.mapError((error) => new ProductShellAuthenticationFailed({
      message: error.message,
    })),
  );
};

const decodeResponse = <A, I>(
  schema: Schema.Codec<A, I, never>,
  operation: string,
) => (value: unknown): Effect.Effect<A, ProductShellRequestFailed> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(() => new ProductShellRequestFailed({
      operation,
      message: "Repository Agent RPC returned data outside its contract",
    })),
  );

const repositoryAgentRpc = () =>
  toRpcAsync<RepositoryAgentBackend>(env.REPOSITORY_AGENT_BACKEND);

const callRepositoryAgent = <A, I>(
  operation: string,
  resultSchema: Schema.Codec<
    { readonly ok: true; readonly value: A } | {
      readonly ok: false;
      readonly error: {
        readonly _tag: typeof RepositoryAgentFailureTagSchema.Type;
        readonly message: string;
        readonly operation?: string;
      };
    },
    I,
    never
  >,
  invoke: (
    backend: ReturnType<typeof repositoryAgentRpc>,
    principal: typeof ProductIdentitySchema.Type,
  ) => Promise<unknown>,
): Effect.Effect<A, ProductShellFailure> => Effect.gen(function* () {
  const principal = yield* requireAccessIdentity();
  const unknownResult = yield* Effect.tryPromise({
    try: () => invoke(repositoryAgentRpc(), principal),
    catch: (cause) => new ProductShellRequestFailed({
      operation,
      message: "Could not reach the Repository Agent backend",
      cause,
    }),
  });
  const result = yield* decodeResponse(resultSchema, operation)(unknownResult);
  if (!result.ok) {
    return yield* Effect.fail(new RepositoryAgentDomainFailure({
      failureTag: result.error._tag,
      operation: result.error.operation ?? operation,
      message: result.error.message,
    }));
  }
  return result.value;
});

const toServerError = (error: ProductShellFailure): Error => new Error(error.message);

export const getCurrentUser = createServerFn({ method: "GET" })
  .handler(() => Effect.runPromise(
    requireAccessIdentity().pipe(
      Effect.flatMap((identity) => Schema.decodeUnknownEffect(ProductIdentitySchema)(identity)),
      Effect.mapError((error) => new Error(
        "message" in error ? String(error.message) : "Access returned an invalid product identity",
      )),
    ),
  ));

export const listRepositoryTasks = createServerFn({ method: "GET" })
  .handler(() => Effect.runPromise(
    callRepositoryAgent(
      "listRepositoryTasks",
      ListRepositoryTasksResultSchema,
      (backend, principal) => backend.listRepositoryTasks({ principal }),
    ).pipe(Effect.mapError(toServerError)),
  ));

export const startRepositoryRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunRequestSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    callRepositoryAgent(
      "createRepositoryTask",
      CreateRepositoryTaskResultSchema,
      (backend, principal) => backend.createRepositoryTask({ principal, request: data }),
    ).pipe(Effect.mapError(toServerError)),
  ));

export const startAdditionalRepositoryRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(StartAdditionalRunRequestSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    callRepositoryAgent(
      "startAdditionalRepositoryRun",
      StartAdditionalRepositoryRunResultSchema,
      (backend, principal) => backend.startAdditionalRepositoryRun({ principal, request: data }),
    ).pipe(Effect.mapError(toServerError)),
  ));

export const getRepositoryRunStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    callRepositoryAgent(
      "getRepositoryTask",
      GetRepositoryTaskResultSchema,
      (backend, principal) => backend.getRepositoryTask({ principal, handle: data }),
    ).pipe(Effect.mapError(toServerError)),
  ));

export const getRepositoryRunResult = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    callRepositoryAgent(
      "getRunArtifact",
      GetRunArtifactResultSchema,
      (backend, principal) => backend.getRunArtifact({ principal, handle: data }),
    ).pipe(Effect.mapError(toServerError)),
  ));

export const retryPullRequestPublication = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    callRepositoryAgent(
      "retryPullRequestPublication",
      RetryPullRequestPublicationResultSchema,
      (backend, principal) => backend.retryPullRequestPublication({ principal, handle: data }),
    ).pipe(Effect.mapError(toServerError)),
  ));

export const cancelRepositoryRun = createServerFn({ method: "POST" })
  .validator((input: unknown) => Schema.decodeUnknownSync(RepositoryRunHandleSchema)(input))
  .handler(({ data }) => Effect.runPromise(
    callRepositoryAgent(
      "cancelRepositoryRun",
      CancelRepositoryRunResultSchema,
      (backend, principal) => backend.cancelRepositoryRun({ principal, handle: data }),
    ).pipe(Effect.mapError(toServerError)),
  ));

// Export effectful decoders for non-React boundaries and integration tests.
export { decodeRepositoryRunHandle, decodeRepositoryRunRequest };
