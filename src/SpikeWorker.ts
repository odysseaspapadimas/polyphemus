import type { Sandbox } from "@cloudflare/sandbox";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export const SpikeWorker = Effect.gen(function* () {
  const openCodeApiKey = yield* Config.redacted("OPENCODE_API_KEY");
  const spikeApiToken = yield* Config.redacted("SPIKE_API_TOKEN");

  const sandboxContainer = Cloudflare.Container<Sandbox>("SandboxContainer", {
    className: "Sandbox",
    context: `${import.meta.dirname}/../runner`,
    // beta.65 resolves this path from the stack cwd rather than `context`.
    dockerfile: `${import.meta.dirname}/../runner/Dockerfile`,
    instanceType: "lite",
    maxInstances: 1,
    observability: { logs: { enabled: true } },
  });

  const worker = yield* Cloudflare.Worker("SpikeWorker", {
    name: "polyphemus-spike",
    main: `${import.meta.dirname}/worker.ts`,
    url: true,
    compatibility: {
      date: "2026-07-28",
      flags: ["nodejs_compat"],
    },
    observability: { enabled: true, logs: { enabled: true, invocationLogs: true } },
    env: {
      Sandbox: sandboxContainer,
      OPENCODE_API_KEY: openCodeApiKey,
      SPIKE_API_TOKEN: spikeApiToken,
      SANDBOX_TRANSPORT: "rpc",
    },
  });

  return worker;
});
