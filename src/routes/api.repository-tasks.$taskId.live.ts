import { createFileRoute } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { accessIdentityFor } from "../AccessIdentity.ts";
import { RepositoryTaskIdSchema } from "../domain/repository-task-live.ts";
import { env } from "../env.ts";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));

const text = (body: string, status: number): Response => new Response(body, { status });

const forwardWebSocket = async (request: Request, unknownTaskId: unknown): Promise<Response> => {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return text("Not Found", 404);
  }
  const origin = request.headers.get("origin");
  if (origin === null || origin !== new URL(request.url).origin) {
    return text("Not Found", 404);
  }

  const taskId = await Effect.runPromise(
    Schema.decodeUnknownEffect(RepositoryTaskIdSchema)(unknownTaskId).pipe(
      Effect.match({ onFailure: () => null, onSuccess: (value) => value }),
    ),
  );
  if (taskId === null) return text("Not Found", 404);

  const issuer = Schema.decodeUnknownSync(RequiredText)(env.ACCESS_ISSUER);
  const audience = Schema.decodeUnknownSync(RequiredText)(env.ACCESS_AUDIENCE);
  const identity = await Effect.runPromise(
    accessIdentityFor({ issuer, audience }).verify(
      request.headers.get("cf-access-jwt-assertion"),
    ).pipe(Effect.match({ onFailure: () => null, onSuccess: (value) => value })),
  );
  if (identity === null) return text("Authentication required", 401);

  const headers = new Headers();
  for (const name of [
    "connection",
    "upgrade",
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-protocol",
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("X-Polyphemus-User-Id", identity.userId);

  try {
    const backend = env.REPOSITORY_AGENT_BACKEND as unknown as {
      readonly fetch: (request: Request) => Promise<Response>;
    };
    return await backend.fetch(new Request(
      `https://repository-agent.internal/repository-tasks/${encodeURIComponent(taskId)}/live`,
      { method: "GET", headers },
    ));
  } catch {
    return text("Live progress is temporarily unavailable", 502);
  }
};

export const Route = createFileRoute("/api/repository-tasks/$taskId/live")({
  server: {
    handlers: {
      GET: ({ request, params }) => forwardWebSocket(request, params.taskId),
    },
  },
});
