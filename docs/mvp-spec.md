# Polyphemus MVP Specification

**Status:** Active planning baseline
**Product promise:** One issue. One branch. One focused agent.

## Objective

Prove that a developer can submit one bounded objective for a public GitHub repository, let an autonomous repository agent attempt it in isolation, observe useful progress, and inspect the resulting Patch and independent validation evidence.

The prototype optimizes for learning and agent autonomy. It does not require a generated plan or separate approval before execution.

## User experience

The first user-facing prototype is **submit and observe**, not a conversational workspace:

1. Enter a public GitHub repository and concrete objective or issue URL.
2. Submit the Run Request, immediately authorizing one Agent Run.
3. Watch concise progress while the isolated run executes.
4. Inspect findings, Run Assumptions, Patch, and validation evidence.
5. Start a new Agent Run in the same Repository Task when another attempt is needed.

Polyphemus proceeds with explicit Run Assumptions when information is incomplete. It pauses only when execution is impossible or unsafe.

## Inputs

Required:

- Public GitHub repository URL.
- Concrete objective or issue URL belonging to that repository.

Optional:

- Acceptance criteria or scope constraints.

Defaults:

- Use the repository's default branch at the exact revision resolved when the Agent Run starts.
- Process one repository and one objective per Repository Task.
- Permit at most one active Agent Run per Repository Task.
- Reject private, inaccessible, malformed, or mismatched inputs.

## Golden path

```text
submit Run Request
  -> provision isolated Sandbox
  -> clone and record exact base revision
  -> run restricted Pi session
  -> stream normalized progress
  -> collect structured findings and Patch
  -> stop Pi
  -> validate independently
  -> persist Run Result
  -> destroy Sandbox
```

## Agent boundaries

An Agent Run may inspect, edit, and execute bounded repository commands inside its Sandbox. System policy—not prompt instructions—owns tool availability, budgets, lifecycle, and cleanup.

An Agent Run must not:

- access another repository;
- use repository or user credentials;
- write to a GitHub remote;
- publish a branch, commit, pull request, release, or deployment;
- continue beyond its configured budgets;
- expose raw reasoning, secrets, or unrestricted command output.

The Sandbox never receives the real model-provider credential. It receives only a short-lived, Sandbox-scoped grant for the Polyphemus model proxy; the proxy authenticates the grant, fixes the allowed provider/model and upstream route, and adds the real credential outside the Sandbox.

## Progress

The prototype exposes durable product-level stages:

```text
submitted -> provisioning -> cloning -> investigating
  -> modifying -> validating -> complete | failed | cancelled
```

Snapshots contain a stage, friendly activity label, bounded detail, update time, and available budget usage. Examples include:

- “Cloning the repository”
- “Inspecting test configuration”
- “Updating the parser”
- “Running independent validation”

Raw chain-of-thought and unbounded terminal output are never user-facing progress.

## Run Result

Every terminal Agent Run produces a structured Run Result, including safe partial evidence when execution fails or is cancelled.

A Run Result contains:

- repository URL, branch, and exact base revision;
- normalized Run Request;
- Run Assumptions;
- concise findings;
- Patch and changed-file summary, when changes are appropriate;
- independent validation commands and observed results;
- agent-reported checks, clearly separated from independent evidence;
- budgets, timings, and termination reason;
- unresolved risks and suggested human review;
- Sandbox cleanup outcome.

“No Patch is appropriate” is a valid evidence-backed result.

## Validation semantics

Validation runs after Pi stops and is owned by Polyphemus. It records actual commands, exit status, duration, and bounded output excerpts. Pi's claims never make a Patch validated.

An Agent Run that returns a Patch but fails required validation is **completed, not validated**. Execution failure is reserved for a run that cannot produce a usable Run Result.

## Included

- Public GitHub repositories.
- Direct objective or matching issue URL.
- Submission-authorized autonomous execution.
- Run Assumptions instead of non-blocking clarification.
- One isolated Sandbox and one restricted Pi session per Agent Run.
- Reconnectable friendly progress.
- Local uncommitted Patch generation.
- Independent validation.
- Structured terminal results and typed failures.
- Repeated Agent Runs within one Repository Task, with at most one active.

## Excluded

- Generated Task Plans and pre-execution approval gates.
- Conversational workspace in the first user-facing prototype.
- Private repositories and GitHub App installation.
- GitHub write access, branches, commits, or pull requests.
- User or repository secrets.
- Deployment, release, infrastructure mutation, or auto-merge.
- Multiple repositories or agent swarms.
- Broad autonomous goals and long-lived development environments.
- Name, domain, npm, GitHub, or trademark validation.

## Architecture direction

- **Repository Agent backend:** one private product boundary implemented by two service-bound Workers.
- **Repository Agent Worker:** Effect-native Repository Task commands, status, cancellation, Run Results, coordinator Durable Objects, and Workflows; no public route.
- **Sandbox Runtime Worker:** native official Sandbox SDK and Container binding behind an authenticated service binding; no public route.
- **Repository Task coordinator Durable Object:** authoritative per-task Agent Run snapshot and active-run invariant.
- **Cloudflare Workflow:** durable Agent Run stages, retries, budgets, cancellation, persistence, and cleanup.
- **Official Cloudflare Sandbox SDK:** isolated repository filesystem, processes, Pi runtime, and validation environment.
- **Model proxy Worker:** exchanges a short-lived Sandbox-scoped grant for one fixed model endpoint without exposing the provider credential.
- **Pi SDK:** adaptive repository investigation and bounded modification.
- **Effect v4:** schemas, services, typed failures, streams, and lifecycle boundaries.
- **Alchemy v2:** Worker, Workflow, Sandbox Container binding and image, storage, and deployed tests.
- **R2:** durable Run Results and Patch evidence.
- **D1:** user-scoped Repository Task discovery projection; Durable Objects remain authoritative for current task state.
- **Cloudflare Access:** single-user preview authentication at the Website edge through an explicit email one-time PIN login method and allow policy.

A conversational Cloudflare Agent workspace remains a later product layer, not a prerequisite for proving the submit-and-observe path.

## Deployed product shell

The deployed shell exercises the intended user journey against supported public GitHub repositories: submit, observe normalized progress, cancel, and inspect the Patch, findings, budgets, and independent validation evidence. Cloudflare Access protects the Website, and a TanStack Start server-function boundary forwards the authenticated identity to the private Repository Agent Worker through a service binding, so the browser never receives internal credentials.

The Repository Agent backend is one product boundary with two private deployment units. The Effect-native Repository Agent Worker creates one Repository Task coordinator Durable Object and one Cloudflare Workflow for each submitted Run Request. It calls the native Sandbox Runtime Worker through an authenticated service binding; that Worker alone hosts the official Sandbox Durable Object and Container binding. Neither Worker has a public route. This division follows the supported Alchemy hosting models without exposing an additional product API.

The coordinator is authoritative for the current Repository Task and Agent Run snapshot; the Workflow owns provisioning, observation, independent validation, terminal persistence, and cleanup; R2 owns immutable completed, failed, and cancelled Run Result artifacts. A user-scoped D1 projection makes tasks discoverable across devices, while selected task state is reconstructed from its coordinator rather than browser storage.

The shell supports multiple fresh Agent Runs within one Repository Task while enforcing at most one active attempt. Every attempt resolves its own base revision, keeps its own R2 Run Result, and remains selectable in the task's run history. Workflow creation uses deterministic run identifiers so an interrupted start can recover the existing instance rather than create a duplicate.

Repository URLs are canonicalized and restricted to public HTTPS `github.com/{owner}/{repository}` roots. The compatibility policy accepts unambiguous Bun, npm, and pnpm lockfiles when they are compatible with pinned container defaults; an exact `packageManager` declaration selects npm, pnpm, or Yarn through Corepack, can disambiguate mixed lockfiles, and must match a committed lockfile. Every Yarn repository must declare an exact version, repository `yarnPath` overrides are ignored, and Bun declarations must match the container runtime. Installs are frozen or immutable with lifecycle scripts disabled; pnpm hook files are ignored, Bun uses an external empty configuration, and modern Yarn uses a root-protected configuration with scripts disabled and the `node-modules` linker. Independent test, typecheck, and lint checks are derived only from substantive recognized package scripts and execute the authenticated exact script body through a fixed `/bin/sh`, without package-manager pre/post hooks. Changing a validation script after the baseline makes that check fail instead of running a weakened replacement. Missing, conflicting, mismatched, version-incompatible, configuration-conflicting, or no-op metadata fails provisioning safely or cannot receive a validated claim.

Repository dependency installation, file-tool, and validation operations run through a fixed credential-free Unix identity, while the model-token-bearing Pi runner uses a distinct no-new-privileges identity and a separate private result directory. The scoped model grant is delivered through a mode-`0600` private file, removed after loading, and never placed in the runner environment. Runner code, package-manager caches, sanitized package-manager configuration, control evidence, and the external root-owned Git metadata directory are not writable or replaceable by repository scripts. Detached repository processes are terminated after install and validation operations. Dependencies are rebuilt without lifecycle scripts from the frozen or immutable lockfile after the agent exits, then the worktree is made read-only before final Patch evidence is collected. A separate sealed evidence index marks untracked files with intent-to-add so new files are included without making trusted Git metadata writable. Git inspection fixes the trusted Git directory and worktree, ignores replacement objects, and disables external diff, text conversion, hooks, and filesystem monitors. The stored validation policy is HMAC-authenticated by the private Sandbox Runtime Worker before final checks, and Pi can invoke only configured check names plus fixed read-only Git operations. A rolling finalizer rejects pre-strategy Sandboxes rather than converting their weaker unsigned checks and replaceable Git state into a current validated claim. Validation evidence means that Polyphemus independently executed and observed the recorded repository checks after Pi stopped; it does not claim that repository-owned test implementation or configuration is an independent correctness oracle, and all such changes remain visible in the Patch for review.

The deployed arbitrary-repository proof cloned `khalidx/typescript-cli-starter`, ran Pi through the credential proxy, changed two TypeScript files, independently passed `npm test` and `git diff --check`, persisted the Run Result, and destroyed the Sandbox. The Sandbox container uses the `standard-1` tier because real TypeScript validation can approach the `basic` tier's 1 GiB memory limit before accounting for the Sandbox server; the preview permits bounded rollout overlap and independent Repository Tasks while each Repository Task still enforces one active Agent Run.

The private preview uses an explicit Cloudflare Access email one-time PIN identity provider, restricts the application to that login method, auto-redirects to it, and allows only the configured preview email. A user-scoped Repository Task index provides cross-device discovery. Product-grade multi-user identity and GitHub publication remain subsequent work.

## Acceptance criteria

The MVP is accepted when a user can submit a bounded objective for a public TypeScript repository and Polyphemus reliably:

1. starts exactly one isolated Agent Run from the Run Request;
2. records the exact base revision;
3. runs Pi with enforced finite tools and budgets;
4. reports understandable progress and restores current state after reconnect;
5. produces a Patch or evidence-backed no-Patch result;
6. runs independent validation without overstating success;
7. distinguishes completed-but-not-validated from execution failure;
8. preserves a structured Run Result and destroys the Sandbox;
9. performs no GitHub writes and exposes no repository credentials.

The original deployed Sandbox + Pi gate has passed. The current preview has subsequently proven durable multi-run orchestration, credential proxying, arbitrary supported public repository execution, and an independently validated Patch path. The historical gate and evidence remain in `docs/sandbox-pi-feasibility-spike.md`.

## Approved next increment

The implementation sequence for verified Access identity, typed Repository Agent RPC, removal of the stateless Control DO, recoverable WebSocket progress, and autonomous draft pull-request publication is locked in `docs/plans/001-pull-request-publication.md`. Those capabilities extend this proven shell and do not retroactively change the exclusions or acceptance record of this MVP specification.
