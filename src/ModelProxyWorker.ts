import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export const MODEL_PROXY_ORIGIN = "https://polyphemus-model-proxy.odysseas-patra.workers.dev";

export const ModelProxyWorker = Effect.gen(function* () {
  const openCodeApiKey = yield* Config.redacted("OPENCODE_API_KEY");
  const signingKey = yield* Config.redacted("SANDBOX_API_TOKEN");

  return yield* Cloudflare.Worker("ModelProxyWorker", {
    name: "polyphemus-model-proxy",
    main: `${import.meta.dirname}/model-proxy.ts`,
    url: true,
    compatibility: { date: "2026-07-11", flags: ["nodejs_compat"] },
    observability: { enabled: true, logs: { enabled: true, invocationLogs: false } },
    env: {
      OPENCODE_API_KEY: openCodeApiKey,
      MODEL_PROXY_SIGNING_KEY: signingKey,
    },
  });
});
