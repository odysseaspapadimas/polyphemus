import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import RepositoryAgentBackend from "./src/RepositoryAgentBackend.ts";
import { ModelProxyWorker } from "./src/ModelProxyWorker.ts";
import { PreviewAccess } from "./src/PreviewAccess.ts";
import { RepositoryTaskIndexDatabase } from "./src/RepositoryTaskIndexDatabase.ts";
import { RunArtifactsBucket } from "./src/RunArtifactsBucket.ts";
import { SandboxRuntimeWorker } from "./src/SandboxRuntimeWorker.ts";

export { RepositoryAgentBackend };

export const Website = Effect.gen(function* () {
  const repositoryAgentBackend = yield* RepositoryAgentBackend;

  return yield* Cloudflare.Website.Vite("Website", {
    name: "polyphemus",
    url: true,
    dev: { port: 1339, strictPort: true },
    compatibility: {
      date: "2026-07-28",
      flags: ["nodejs_compat"],
    },
    env: {
      REPOSITORY_AGENT_BACKEND: repositoryAgentBackend,
    },
  });
});

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "Polyphemus",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const modelProxy = yield* ModelProxyWorker;
    const repositoryAgentBackend = yield* RepositoryAgentBackend;
    const sandboxRuntime = yield* SandboxRuntimeWorker;
    const runArtifacts = yield* RunArtifactsBucket;
    const taskIndex = yield* RepositoryTaskIndexDatabase;
    const website = yield* Website;
    const access = yield* PreviewAccess;
    return {
      accessApplicationId: access.applicationId,
      repositoryAgentBackendName: repositoryAgentBackend.workerName,
      sandboxRuntimeWorkerName: sandboxRuntime.workerName,
      runArtifactsBucketName: runArtifacts.bucketName,
      repositoryTaskIndexName: taskIndex.databaseName,
      modelProxyUrl: modelProxy.url,
      websiteUrl: website.url,
    };
  }),
);
