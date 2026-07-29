import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import RepositoryAgentControl from "./RepositoryAgentControl.ts";
import RepositoryRunWorkflow from "./RepositoryRunWorkflow.ts";
import RepositoryTaskCoordinator from "./RepositoryTaskCoordinator.ts";
import { SandboxRuntimeWorker } from "./SandboxRuntimeWorker.ts";

/** Private Effect-native backend for task coordination and orchestration. */
export default class RepositoryAgentBackend extends Cloudflare.Worker<RepositoryAgentBackend>()(
  "RepositoryAgentBackend",
  {
    name: "polyphemus-repository-agent",
    main: import.meta.url,
    url: false,
    compatibility: { date: "2026-07-28", flags: ["nodejs_compat"] },
    observability: { enabled: true, logs: { enabled: true, invocationLogs: true } },
    env: {
      SandboxRuntimeWorker,
    },
  },
  Effect.gen(function* () {
    // Register every bridge export in the Worker runtime. Dependencies used
    // only inside another Durable Object are visible to the deployment plan,
    // but must also be registered when the isolate builds its runtime export map.
    yield* RepositoryTaskCoordinator;
    yield* RepositoryRunWorkflow;
    const control = yield* RepositoryAgentControl;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        return yield* control.getByName("global").fetch(request);
      }),
    };
  }),
) {}
