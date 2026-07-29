import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { MODEL_PROXY_ORIGIN } from "./ModelProxyWorker.ts";
import { SandboxContainer } from "./SandboxContainer.ts";

/** Private runtime boundary for the native Cloudflare Sandbox Durable Object. */
export const SandboxRuntimeWorker = Effect.gen(function* () {
  const sandboxApiToken = yield* Config.redacted("SANDBOX_API_TOKEN").pipe(
    Effect.orDie,
  );

  return yield* Cloudflare.Worker("SandboxRuntimeWorker", {
    name: "polyphemus-sandbox-runtime",
    main: `${import.meta.dirname}/sandbox-runtime-worker.ts`,
    url: false,
    compatibility: { date: "2026-07-28", flags: ["nodejs_compat"] },
    observability: { enabled: true, logs: { enabled: true, invocationLogs: true } },
    env: {
      MODEL_PROXY_ORIGIN,
      SANDBOX_API_TOKEN: sandboxApiToken,
      Sandbox: SandboxContainer,
    },
  });
});
