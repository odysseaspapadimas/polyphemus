# Sandbox + Pi Feasibility Spike

**Status:** Passed on 2026-07-28

## Purpose

Prove the riskiest technical path before building the Polyphemus control plane or UI: a Cloudflare Sandbox can host a restricted Pi SDK run against a public TypeScript repository and return an independently validated Patch.

## Decisions so far

- A Run Request immediately authorizes one Agent Run; the prototype has no generated plan or separate approval gate.
- An Agent Run proceeds with explicit Run Assumptions unless the request is impossible or unsafe.
- The spike must create a real bounded Patch, not only inspect a repository.
- The target is [`odysseaspapadimas/polyphemus-spike-fixture`](https://github.com/odysseaspapadimas/polyphemus-spike-fixture), a purpose-built public Bun + TypeScript repository pinned at defective commit `3ef76abc46761bee1faad7335959d2f856452c21`.
- Its localized behavioral defect lets a contained interval shrink the accumulated endpoint before a later overlap; one visible test fails while typechecking passes.
- After Pi stops, validation reruns the visible test and an immutable held-out acceptance test supplied from outside the repository.
- The controlled-fixture spike pins `opencode-go/kimi-k2.7-code` and injects an OpenCode Go API key directly into its Sandbox; arbitrary public repositories require a Worker credential proxy first.
- Pi's unrestricted built-in filesystem and bash tools are disabled. Repository-rooted read, edit, write, find, and list definitions plus a bounded Bun/read-only-Git command tool enforce the spike boundary; exact command policy is reversible.
- The spike uses the official `@cloudflare/sandbox` SDK deployed through Alchemy's Container binding with a version-matched custom image containing Pi.
- Local Docker may support development, but the feasibility gate passes only when an automated Alchemy deployed integration test completes the full path on Cloudflare.
- GitHub writes, private repositories, repository credentials, application UI, and pull requests remain out of scope.

## What we have verified

### Cloudflare Sandbox and Alchemy

Current official documentation provides:

- one isolated VM-backed filesystem and process environment per Sandbox;
- public Git checkout through `gitCheckout()`;
- command execution and timeout support;
- background processes with accumulated or streaming logs;
- process-tree termination and explicit `destroy()`;
- ephemeral state that disappears after destruction or an idle container restart.

Alchemy's published `2.0.0-beta.65` cannot attach a Container to a Durable Object class exported by an async Worker. [Issue #953](https://github.com/alchemy-run/alchemy/issues/953) describes this exact gap. Merged [PR #956](https://github.com/alchemy-run/alchemy/pull/956) adds the required `Cloudflare.Container<Sandbox>` async binding, but it is available only through the commit-addressed preview `https://pkg.ing/alchemy/98209fc` at the time of this spike.

With that preview, Alchemy emits the Durable Object namespace binding, marks the class as container-backed, provisions the Container application and custom image, attaches it to the namespace, and manages the class migration. Moving to an official release containing PR #956 remains routine dependency maintenance, not a feasibility or product-foundation blocker.

The spike uses the current Sandbox RPC transport and base command APIs rather than deprecated HTTP/WebSocket transport and `execStream()` APIs.

Final evidence therefore cannot live only inside the Sandbox.

### Pi SDK

The installed Pi SDK provides:

- programmatic sessions through `createAgentSession()`;
- explicit working directory, model, tools, settings, and resource loader configuration;
- event subscriptions for agent, turn, message, and tool lifecycle events;
- in-memory sessions;
- custom tools;
- terminating structured-output tools.

The runner does not use Pi's default project discovery because a cloned repository may contain untrusted settings, extensions, skills, or context instructions.

### Briefsmith lessons to retain

- Application code owns deterministic orchestration and budgets.
- External data and persisted state are decoded at every boundary.
- Expected failures become typed user-visible outcomes; defects remain observable.
- Live state is persisted before it is broadcast and reconciled on reconnect.
- Workflow tasks require stable names and idempotent effects.
- Final artifacts must distinguish claims from independently observed evidence.

## Minimum successful path

```text
create Sandbox
  -> clone pinned public TypeScript repository
  -> record exact base revision
  -> start restricted Pi runner
  -> normalize lifecycle events
  -> create one bounded Patch
  -> stop Pi
  -> run independent validation
  -> collect findings, diff, and evidence
  -> copy result outside Sandbox
  -> destroy Sandbox
```

## Implemented spike

1. Created the public Bun + TypeScript fixture and pinned defective revision.
2. Built a Pi runner with an empty resource loader, in-memory settings/session, repository-rooted filesystem tools, a bounded Bun/read-only-Git command tool, normalized JSONL activity, structured completion, a 12-command limit, 60-second command timeout, and eight-minute run timeout.
3. Added an async Worker exporting the official `Sandbox` class with authenticated start, status, finalize, and cancel boundaries.
4. Added post-Pi independent validation for visible tests, typechecking, held-out tests, and `git diff --check`.
5. Deployed a custom image based on `docker.io/cloudflare/sandbox:0.12.4` through Alchemy and added repeatable deployed integration tests in `test/deployed/spike.integration.ts`.
6. Proved both the happy and deliberately interrupted paths against the deployed Worker.

The deployed evidence closes the feasibility gate. Workflow, coordinator, persistence, and UI work may now proceed in the documented MVP order.

## Deliverable

One machine-readable spike result containing:

- repository URL and exact base revision;
- Run Request and Run Assumptions;
- normalized lifecycle events;
- structured Pi findings;
- changed-file summary and unified diff;
- independently executed validation results;
- budget usage and termination reason;
- Sandbox cleanup outcome.

## Observed deployed evidence

Environment:

- `@cloudflare/sandbox@0.12.4`
- `@earendil-works/pi-coding-agent@0.82.1`
- `effect@4.0.0-beta.102`
- Alchemy PR preview at commit `98209fcb975311f28e849b06328e9e60201a64b6` (reports `2.0.0-beta.65`)
- `opencode-go/kimi-k2.7-code`
- Alchemy-managed Worker and Container application on Cloudflare

Happy path:

- The final deployed test completed in 258.4 seconds.
- The exact base SHA matched the pinned defective revision and the baseline test failed before Pi ran.
- Pi changed only `src/merge-ranges.ts`, replacing the shrinking endpoint assignment with `Math.max(current.end, next.end)`.
- Normalized events, structured findings, assumptions, termination reason, command/wall-clock/model usage, changed files, and Patch were copied out.
- Visible tests, typechecking, two held-out acceptance tests, and `git diff --check` passed independently.
- The result was marked validated only after those checks and reported `cleanup: "destroyed"`.

Interrupted path:

- The test observed an active Pi process and partial normalized events, then sent cancellation.
- The process was terminated, no validated-Patch claim was returned, and cleanup reported `destroyed`.
- The final-image cancellation test completed in 17.4 seconds in the combined deployed run.

Observed constraints and failures:

- The first request immediately after initial provisioning failed with a typed Sandbox runtime-connection interruption; a later request succeeded.
- The first request immediately after a Container rollout lost its process before finalization; after the rollout settled, the same test passed. Production orchestration needs deployment readiness and retry/recovery semantics rather than assuming immediate Container stability.
- On the `lite` instance, one agent-initiated typecheck was killed with exit 137 and succeeded on retry; an independently run typecheck later passed. Resource sizing and command-specific retry policy need explicit budgets.
- The direct model credential remains acceptable only for the controlled fixture. Arbitrary repositories still require a credential proxy.

## Go/no-go gate

The spike passes only when both deployed tests succeed:

### Happy path

- Alchemy deploys a version-matched official Sandbox SDK image and binding.
- The Sandbox clones the pinned fixture and records its exact base revision.
- Pi emits normalized lifecycle events and produces a bounded Patch.
- Pi stops before independent validation begins.
- The visible test and immutable held-out acceptance test both pass.
- The result is copied outside the Sandbox before `destroy()` succeeds.

### Interrupted path

- The test interrupts an active Pi process deliberately.
- The process tree stops and no further tool activity occurs.
- Safe partial events and a typed termination result remain available.
- The Sandbox is destroyed without claiming a validated Patch.

A Wrangler-only deployment, local-only result, unvalidated agent claim, or successful run without confirmed cleanup does not pass the gate.

**Conclusion:** the Sandbox + Pi technical path is a **go**, and the product-foundation build is unblocked. Replace the preview package with an official Alchemy release containing PR #956 when available and rerun the deployed tests as normal dependency-upgrade verification.

## Explicit non-goals

- Production UI or conversational workspace
- Cloudflare Agent integration
- Durable multi-run Workflow orchestration
- Global task index
- Private repository authentication
- Branch, commit, or pull-request publication
- General support for arbitrary repositories

## Open decisions

- What account limit makes the direct spike credential acceptably low-risk?

Exact command syntax, path guards, event transport, and initial numeric budgets are reversible implementation details and will use conservative defaults during the spike.

## References

- [Cloudflare Sandbox lifecycle](https://developers.cloudflare.com/sandbox/concepts/sandboxes/)
- [Cloudflare Sandbox Git workflows](https://developers.cloudflare.com/sandbox/guides/git-workflows/)
- [Cloudflare Sandbox background processes](https://developers.cloudflare.com/sandbox/guides/background-processes/)
- [Cloudflare Sandbox security](https://developers.cloudflare.com/sandbox/concepts/security/)
- [Cloudflare Sandbox 2026 migration guide](https://developers.cloudflare.com/sandbox/guides/2026-deprecation/)
- [Alchemy Containers](https://alchemy.run/cloudflare/compute/containers/)
- [Alchemy issue #953](https://github.com/alchemy-run/alchemy/issues/953)
- [Alchemy PR #956](https://github.com/alchemy-run/alchemy/pull/956)
- [Pi SDK documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
