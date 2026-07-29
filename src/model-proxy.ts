import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { verifyModelProxyToken } from "./domain/model-proxy-token.ts";

interface Env {
  readonly OPENCODE_API_KEY: string;
  readonly MODEL_PROXY_SIGNING_KEY: string;
}

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const UPSTREAM_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const ProxyRequestSchema = Schema.Struct({
  model: Schema.Literal("kimi-k2.7-code"),
});

const json = (value: unknown, init?: ResponseInit): Response => Response.json(value, init);

const authorize = (request: Request, env: Env) => Effect.gen(function* () {
  const authorization = request.headers.get("Authorization");
  if (authorization === null || !authorization.startsWith("Bearer ")) {
    return yield* Effect.fail("unauthorized" as const);
  }
  return yield* verifyModelProxyToken(
    env.MODEL_PROXY_SIGNING_KEY,
    authorization.slice("Bearer ".length),
  ).pipe(Effect.mapError(() => "unauthorized" as const));
});

const proxyModelRequest = (request: Request, env: Env) => Effect.gen(function* () {
  yield* authorize(request, env);
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: "Model request is too large" }, { status: 413 });
  }
  const body = yield* Effect.tryPromise({
    try: () => request.arrayBuffer(),
    catch: () => "invalid-body" as const,
  });
  if (body.byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "Model request is too large" }, { status: 413 });
  }
  const unknownPayload = yield* Effect.try({
    try: () => JSON.parse(new TextDecoder().decode(body)) as unknown,
    catch: () => "invalid-json" as const,
  });
  yield* Schema.decodeUnknownEffect(ProxyRequestSchema)(unknownPayload).pipe(
    Effect.mapError(() => "invalid-model-request" as const),
  );

  const upstream = yield* Effect.tryPromise({
    try: () => fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        Accept: request.headers.get("Accept") ?? "text/event-stream",
        Authorization: `Bearer ${env.OPENCODE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body,
    }),
    catch: () => "upstream-unavailable" as const,
  });
  const headers = new Headers();
  const contentType = upstream.headers.get("Content-Type");
  if (contentType !== null) headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
});

const handle = (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
    return Effect.succeed(json({ error: "Not found" }, { status: 404 }));
  }
  return proxyModelRequest(request, env).pipe(
    Effect.catch((error) => Effect.succeed(json({
      error: error === "unauthorized" ? "Unauthorized" : "Invalid model request",
    }, { status: error === "unauthorized" ? 401 : error === "upstream-unavailable" ? 502 : 400 }))),
    Effect.catchDefect(() => Effect.succeed(json({ error: "Model proxy failed" }, { status: 500 }))),
  );
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return Effect.runPromise(handle(request, env));
  },
};
