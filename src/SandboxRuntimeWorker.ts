import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { SandboxContainer } from "./SandboxContainer.ts";

/** Private runtime boundary for the native Cloudflare Sandbox Durable Object. */
export const SandboxRuntimeWorker = Effect.gen(function* () {
  const sandboxApiToken = yield* Config.redacted("SANDBOX_API_TOKEN").pipe(Effect.orDie);
  const validationPolicySigningKey = yield* Config.redacted(
    "VALIDATION_POLICY_SIGNING_KEY",
  ).pipe(Effect.orDie);
  const modelGrantSigningKey = yield* Config.redacted("MODEL_GRANT_SIGNING_KEY").pipe(
    Effect.orDie,
  );
  const modelProxyOriginValue = yield* Config.string("POLYPHEMUS_MODEL_PROXY_ORIGIN");
  const modelProxyOrigin = yield* Effect.try({
    try: () => {
      const url = new URL(modelProxyOriginValue);
      if (url.protocol !== "https:" || url.pathname !== "/" || url.search !== "" ||
          url.hash !== "" || url.username !== "" || url.password !== "") {
        throw new Error("invalid origin");
      }
      return url.origin;
    },
    catch: () => new Error("POLYPHEMUS_MODEL_PROXY_ORIGIN must be an uncredentialed HTTPS origin"),
  }).pipe(Effect.orDie);

  return yield* Cloudflare.Worker("SandboxRuntimeWorker", {
    name: "polyphemus-sandbox-runtime",
    main: `${import.meta.dirname}/sandbox-runtime-worker.ts`,
    workersDev: false,
    compatibility: { date: "2026-07-11", flags: ["nodejs_compat"] },
    observability: { enabled: true, logs: { enabled: true, invocationLogs: true } },
    env: {
      MODEL_PROXY_ORIGIN: modelProxyOrigin,
      SANDBOX_API_TOKEN: sandboxApiToken,
      VALIDATION_POLICY_SIGNING_KEY: validationPolicySigningKey,
      MODEL_GRANT_SIGNING_KEY: modelGrantSigningKey,
      Sandbox: SandboxContainer,
    },
  });
});
