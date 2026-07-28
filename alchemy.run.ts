import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import ControlWorker from "./src/ControlWorker.ts";
import { RunArtifactsBucket } from "./src/RunArtifactsBucket.ts";
import { SpikeWorker } from "./src/SpikeWorker.ts";

export { SpikeWorker };

export const Website = Effect.gen(function* () {
  const controlWorker = yield* ControlWorker;

  return yield* Cloudflare.Website.Vite("Website", {
    name: "polyphemus",
    url: true,
    dev: { port: 1339, strictPort: true },
    compatibility: {
      date: "2026-07-28",
      flags: ["nodejs_compat"],
    },
    env: {
      CONTROL_WORKER: controlWorker,
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
    const spikeWorker = yield* SpikeWorker;
    const controlWorker = yield* ControlWorker;
    const runArtifacts = yield* RunArtifactsBucket;
    const website = yield* Website;
    return {
      controlWorkerName: controlWorker.workerName,
      runArtifactsBucketName: runArtifacts.bucketName,
      spikeWorkerUrl: spikeWorker.url,
      websiteUrl: website.url,
    };
  }),
);
