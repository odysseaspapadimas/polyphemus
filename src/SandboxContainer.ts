import type { Sandbox } from "@cloudflare/sandbox";
import * as Cloudflare from "alchemy/Cloudflare";

export const SandboxContainer = Cloudflare.Container<Sandbox>("SandboxContainer", {
  className: "Sandbox",
  context: `${import.meta.dirname}/../runner`,
  // The current Alchemy preview resolves this path from the stack cwd.
  dockerfile: `${import.meta.dirname}/../runner/Dockerfile`,
  // Real TypeScript repositories can approach 1 GiB during validation before
  // accounting for the Sandbox server. standard-1 prevents basic-tier OOMs.
  instanceType: "standard-1",
  // Leave room for rollout overlap and independent Repository Tasks. Each
  // Repository Task still enforces at most one active Agent Run.
  maxInstances: 3,
  observability: { logs: { enabled: true } },
});
