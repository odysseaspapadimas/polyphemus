import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import {
  SpikeCancelResultSchema,
  SpikeFinalResultSchema,
  SpikeStartResultSchema,
  SpikeStatusResultSchema,
} from "./spike.ts";

export class SpikeWorkerRequestFailed extends Schema.TaggedErrorClass<SpikeWorkerRequestFailed>()(
  "SpikeWorkerRequestFailed",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

type SpikePath = "/spike/start" | "/spike/status" | "/spike/finalize" | "/spike/cancel";
type SpikeFetch = (
  request: HttpClientRequest.HttpClientRequest,
) => Effect.Effect<HttpClientResponse.HttpClientResponse, unknown>;

const workerErrorMessage = (value: unknown, status: number): string => {
  if (typeof value === "object" && value !== null && "message" in value) {
    return String(value.message);
  }
  return `Sandbox runner returned HTTP ${status}`;
};

export const makeSpikeWorkerClient = (
  fetchSpike: SpikeFetch,
  token: Redacted.Redacted<string>,
) => {
  const post = <A, I>(path: SpikePath, body: unknown, schema: Schema.Codec<A, I, never>) =>
    Effect.gen(function* () {
      const request = yield* HttpClientRequest.bodyJson(
        HttpClientRequest.post(`https://spike.internal${path}`).pipe(
          HttpClientRequest.bearerToken(token),
        ),
        body,
      ).pipe(Effect.mapError((cause) => new SpikeWorkerRequestFailed({
        operation: path,
        message: "Could not encode the Sandbox runner request",
        cause,
      })));
      const response = yield* fetchSpike(request).pipe(
        Effect.mapError((cause) => new SpikeWorkerRequestFailed({
          operation: path,
          message: "Could not reach the Sandbox runner",
          cause,
        })),
      );
      const value = yield* response.json.pipe(
        Effect.mapError((cause) => new SpikeWorkerRequestFailed({
          operation: path,
          message: "Sandbox runner returned invalid JSON",
          cause,
        })),
      );
      if (response.status < 200 || response.status >= 300) {
        return yield* Effect.fail(new SpikeWorkerRequestFailed({
          operation: path,
          message: workerErrorMessage(value, response.status),
        }));
      }
      return yield* Schema.decodeUnknownEffect(schema)(value).pipe(
        Effect.mapError((cause) => new SpikeWorkerRequestFailed({
          operation: path,
          message: "Sandbox runner response did not match its contract",
          cause,
        })),
      );
    });

  return {
    start: (input: unknown) => post("/spike/start", input, SpikeStartResultSchema),
    status: (input: unknown) => post("/spike/status", input, SpikeStatusResultSchema),
    finalize: (input: unknown) => post("/spike/finalize", input, SpikeFinalResultSchema),
    cancel: (input: unknown) => post("/spike/cancel", input, SpikeCancelResultSchema),
  };
};
