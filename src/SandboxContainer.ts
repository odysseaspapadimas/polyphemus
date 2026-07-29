import type { Sandbox } from "@cloudflare/sandbox";
import * as Cloudflare from "alchemy/Cloudflare";

export const SandboxContainer = Cloudflare.Container<Sandbox>("SandboxContainer", {
  className: "Sandbox",
  context: `${import.meta.dirname}/../runner`,
  // The current Alchemy preview resolves this path from the stack cwd.
  dockerfile: `${import.meta.dirname}/../runner/Dockerfile`,
  // Public repositories routinely exceed the 256 MiB lite tier during install
  // or validation; basic keeps the preview bounded while avoiding known OOMs.
  instanceType: "basic",
  // Leave room for rollout overlap and independent Repository Tasks. Each
  // Repository Task still enforces at most one active Agent Run.
  maxInstances: 3,
  observability: { logs: { enabled: true } },
});
