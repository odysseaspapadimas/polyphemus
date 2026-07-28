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

The controlled feasibility fixture may use a limited model credential directly. Arbitrary public repositories require a credential proxy so the Sandbox never receives the real provider credential.

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

- **Control Worker / task coordinator:** Run Request boundary and Repository Task coordination.
- **Cloudflare Workflow:** durable Agent Run stages, retries, budgets, cancellation, persistence, and cleanup.
- **Official Cloudflare Sandbox SDK:** isolated repository filesystem, processes, Pi runtime, and validation environment.
- **Pi SDK:** adaptive repository investigation and bounded modification.
- **Effect v4:** schemas, services, typed failures, streams, and lifecycle boundaries.
- **Alchemy v2:** Worker, Workflow, Sandbox Container binding and image, storage, and deployed tests.
- **R2:** durable Run Results and Patch evidence.

A conversational Cloudflare Agent workspace remains a later product layer, not a prerequisite for proving the submit-and-observe path.

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

The full MVP foundation begins only after the deployed Sandbox + Pi feasibility spike passes its documented gate.
