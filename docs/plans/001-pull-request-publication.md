# 001 — Pull Request Publication

Status: Ready

This plan turns the current deployed product shell into a cleaner typed Repository Agent foundation, adds recoverable live progress, and then uses that foundation for autonomous draft pull-request publication.

## Outcomes

A user can eventually provide one bounded objective for a public GitHub repository and Polyphemus will:

1. run one bounded Agent Run in an isolated Sandbox;
2. stream persisted progress live;
3. recover the authoritative Repository Task after disconnect or reload;
4. independently validate the resulting Patch;
5. create or reuse an agent-owned fork and branch;
6. publish the validated Patch as one draft pull request; and
7. return the pull request and independently observed evidence.

The initial autonomous publication policy creates draft pull requests only. It does not merge, deploy, release, mutate repository settings, force-push human branches, or expose GitHub credentials to Pi.

## Locked architecture

```text
Browser
  | HTTPS + Cloudflare Access
  v
Website Worker
  |-- typed RPC commands ------------------------------.
  |                                                    |
  |-- WebSocket upgrade via private Service Binding --|-->
                                                       v
                                            Repository Agent Worker
                                              |-- RPC --> Repository Task coordinator DO
                                              |-- Workflow --> Agent Run lifecycle
                                              |-- private HTTP --> Sandbox Runtime Worker
                                              |-- D1 --> user task index
                                              `-- R2 --> immutable Run Results

Sandbox Runtime Worker
  |-- Sandbox Durable Object + Container
  `-- scoped HTTP --> Model Proxy Worker
```

Protocol choices are intentional:

- Browser-to-Website remains HTTP and WebSocket.
- Website command operations use typed Worker RPC.
- Repository Task coordinator operations use Durable Object RPC.
- Live progress uses a hibernatable WebSocket owned by the per-task coordinator DO.
- Repository Agent-to-Sandbox Runtime remains private HTTP because it is a small infrastructure protocol crossing Effect-native and native Sandbox hosting models.

The Repository Agent backend remains one product boundary implemented by the private Repository Agent Worker and private Sandbox Runtime Worker.

## Locked decisions

### Access identity

The Website must validate `Cf-Access-Jwt-Assertion` before constructing a Product Identity. Validation includes:

- RS256 signature against the team JWKS;
- issuer `https://odysseas-dev.cloudflareaccess.com`;
- the deployed Access application's audience;
- expiry and not-before claims; and
- a non-empty, schema-valid email claim.

The authenticated email header is not independently trusted. The canonical Product Identity is derived from the verified token. The private Repository Agent decodes the forwarded principal at its own boundary.

### Worker RPC

Website-to-Repository-Agent command routes migrate from synthetic HTTP requests to explicit RPC methods:

- `createRepositoryTask`
- `startAdditionalRepositoryRun`
- `listRepositoryTasks`
- `getRepositoryTask`
- `getRunArtifact`
- `cancelRepositoryRun`

Each method has a shared Effect schema for its command and result. TypeScript types are derived from those schemas. Implementations still decode incoming values as unknown because RPC is a process boundary.

Expected domain failures cross RPC as plain discriminated result envelopes. Cloudflare transport failures remain rejected promises and are mapped to `ProductShellRequestFailed` by the Website adapter. Custom Effect error instances never cross RPC.

The Repository Agent uses Alchemy's Worker Layer form so its RPC shape can be imported by the Website without pulling the backend implementation into the Website bundle.

### Stateless Control DO removal

`RepositoryAgentControl` owns no authoritative state and no required global serialization invariant. Its application operations move into an Effect `RepositoryAgent` service hosted directly by the Repository Agent Worker.

The following remain authoritative:

- Repository Task coordinator DO: Repository Task and Agent Run state;
- Workflow: durable execution, retries, cancellation and cleanup;
- D1: user-scoped discovery projection;
- R2: immutable Run Results; and
- Sandbox DO: isolated runtime lifecycle.

The Control DO class and namespace are removed only after every Website command uses the new RPC surface. Its storage is empty, so no product data migration is required. The deployment plan must preserve the existing coordinator DO namespace, Workflow, D1 database and R2 bucket.

### Live progress

The Repository Task coordinator owns hibernatable WebSockets because it already owns task identity and authoritative state.

The live feed is WebSocket-first with polling fallback:

1. fetch an authoritative snapshot on page load;
2. open one WebSocket for the selected Repository Task;
3. receive an initial snapshot immediately after connection;
4. apply newer persisted snapshots as they arrive;
5. disable active-run polling while connected;
6. refetch immediately after disconnect or reconnect;
7. use slow polling while disconnected; and
8. reconnect with bounded exponential backoff.

Every coordinator transition follows persist-then-broadcast ordering. A broadcast failure cannot roll back or fail an already persisted transition. Reconnect always repairs a missed broadcast from authoritative storage.

The first implementation sends complete, versioned Repository Task snapshots rather than deltas. This is simpler to decode and recover. The snapshot gains a monotonic `revision`; the browser applies a message only when its revision is newer than the cached snapshot. Existing stored snapshots decode with a backward-compatible default revision.

A versioned live message has the conceptual shape:

```ts
{
  version: 1,
  type: "repository-task.snapshot",
  taskId: string,
  revision: number,
  snapshot: RepositoryTaskSnapshot
}
```

Only normalized product events are broadcast. Raw model output, provider payloads, credentials and process logs are excluded.

### WebSocket routing and authorization

The browser connects to a same-origin Website endpoint for one `taskId`. The Access-protected Website validates the JWT and forwards the upgrade over its private Repository Agent Service Binding. The Repository Agent validates the task handle and principal, then forwards the upgrade to the task's coordinator DO.

The Repository Agent retains `fetch` only for the WebSocket upgrade path and returns 404 for other HTTP paths after command RPC migration. WebSocket authorization must not reveal whether another user's Repository Task exists.

The coordinator stores only bounded connection metadata in serialized WebSocket attachments. It sends the current snapshot after accepting a connection and broadcasts after all state-changing methods. Client messages are limited to a versioned heartbeat/control contract; arbitrary commands are rejected.

### Autonomous draft pull requests

After the RPC and live-progress foundation is stable, a `PullRequestPublicationWorkflow` publishes a Validated Patch autonomously.

Initial publication rules:

- public repositories only;
- non-empty Validated Patches only;
- draft pull requests only;
- create or reuse an agent-owned fork when upstream is not writable;
- create or reuse deterministic branch `polyphemus/<task-id>`;
- publish exactly the selected Run Result's Patch against its recorded base revision;
- update only Polyphemus-owned branches and pull requests;
- never give Pi a remote GitHub credential; and
- fail safely for archived repositories, disabled pull requests, unavailable forks or incompatible base changes.

Publication is idempotent. Retries recover the same fork, branch, commit and pull request rather than creating duplicates. The implementation records source Run, Patch Artifact, base SHA, fork, branch, head SHA, pull-request number, URL and structured failure evidence.

The concrete GitHub credential mechanism remains behind a `RepositoryPublisher` service. It must support the product requirement—contributing to an arbitrary public repository through an agent-owned fork—without entering prompts, events, artifacts, repository configuration or logs.

## Implementation phases

### Phase 0 — protect the current baseline

Before refactoring:

- keep all root and runner typechecks green;
- keep unit and deployed edge tests green;
- record a successful create, observe, reconnect, cancel and terminal-result journey;
- inspect the Alchemy plan before every deployment; and
- reject any plan that replaces coordinator storage, D1 or R2.

### Phase 1 — verified Access identity

1. Bind the Access application audience and team issuer into the Website Worker.
2. Add a small JWT verification adapter with cached remote JWKS rotation support.
3. Decode verified claims into `ProductIdentity`.
4. Replace the current assertion-presence and authenticated-email-header check.
5. Use the same identity service for server functions and WebSocket upgrades.

Gate:

- missing, malformed, expired, wrong-issuer and wrong-audience tokens fail closed;
- valid tokens produce the normalized configured email;
- no token or claim is logged; and
- the deployed one-time-PIN login still succeeds.

### Phase 2 — extract the Repository Agent application service

1. Move command implementation from `RepositoryAgentControl` into a plain Effect application service.
2. Keep current HTTP routes as temporary adapters around that service.
3. Preserve all ownership, one-active-run, Workflow recovery, cancellation, D1 and R2 behavior.
4. Add direct service tests independent of HTTP and RPC adapters.

Gate:

- existing deployed behavior is unchanged;
- the Control DO contains no application logic; and
- current HTTP clients still pass.

### Phase 3 — introduce and migrate typed Worker RPC

1. Add shared command, result and failure schemas.
2. Convert the Repository Agent to Alchemy's Worker Layer form.
3. Add all six RPC methods while retaining HTTP compatibility.
4. Prove one read-only RPC method in deployment first.
5. Migrate each Website server function to the typed binding.
6. Decode every returned result envelope in the Website adapter.
7. Remove synthetic internal URLs, JSON bodies, identity headers and status-code mapping from command calls.

Deploy target first, caller second, and remove compatibility code last.

Gate:

- all six operations work through RPC;
- TypeScript rejects mismatched commands and results;
- runtime schema tests reject malformed RPC values;
- infrastructure rejections and domain failures remain distinguishable; and
- no command operation depends on backend HTTP routing.

### Phase 4 — remove the Control DO

1. Make the Repository Agent Worker invoke the extracted application service directly.
2. Remove the Control DO proxy, class export and binding.
3. Retain backend `fetch` as 404-only until the WebSocket upgrade route is added.
4. Deploy and inspect migrations before cleanup.

Gate:

- an existing pre-removal Repository Task remains readable and rerunnable;
- create, list, status, result and cancel still pass;
- the coordinator namespace and stored snapshots are preserved; and
- the final Alchemy plan converges to no-op.

### Phase 5 — prove the WebSocket route

Before implementing the full feed, prove one authenticated upgrade through:

```text
Browser -> Website -> private Service Binding -> Repository Agent -> coordinator DO
```

The proof must confirm that Cloudflare Access, TanStack Start, Service Binding forwarding, Alchemy's Effect bridge and hibernatable DO sockets preserve the 101 upgrade and close semantics.

Gate:

- authorized same-origin connection succeeds;
- unauthenticated and cross-user connections fail closed;
- coordinator hibernation does not terminate the connection; and
- no private Worker receives a public route.

### Phase 6 — implement recoverable live progress

1. Add backward-compatible snapshot revisions.
2. Add the live-message schema and decoder.
3. Add hibernatable WebSocket acceptance and handlers to the coordinator.
4. Centralize persist-then-broadcast in the coordinator.
5. Send the initial authoritative snapshot on connect.
6. Add a Website WebSocket route and browser live-query hook.
7. Update React Query only with newer revisions.
8. Disable polling while connected and restore it while disconnected.
9. Refetch on reconnect and after every mutation.

Gate:

- all friendly stages appear without normal polling delay;
- reload and network interruption recover the latest snapshot;
- duplicate and out-of-order messages do not regress UI state;
- broadcast failure does not fail Workflow persistence;
- terminal Run Result and cancellation behavior remain correct; and
- raw provider/model data never appears in messages.

### Phase 7 — prove repository publication

Use a controlled public fixture before general publication:

1. create or reuse an agent-owned fork;
2. create the deterministic task branch;
3. apply one persisted Validated Patch to the recorded base;
4. create and push one commit;
5. open one draft pull request against the original repository;
6. repeat every step to prove idempotent recovery; and
7. cleanly report base conflicts and unsupported repository settings.

The publication code runs after Pi has terminated. A credential is scoped to the publication adapter and is never written to Git configuration, prompts, result artifacts or user-visible events.

### Phase 8 — durable autonomous publication

1. Add `PullRequestPublication` domain schemas and coordinator transitions.
2. Add `PullRequestPublicationWorkflow` with bounded retries and checkpoints.
3. Persist publication evidence and structured failures.
4. Broadcast publication progress through the same live feed.
5. Show branch, commit and draft pull-request evidence in the Website.
6. Add retry, duplicate-prevention, conflict and cleanup tests.

Gate:

- one supported public repository plus bounded task produces one validated draft pull request;
- retries never create duplicate branches, commits or pull requests;
- publication never occurs for an unvalidated or empty Patch;
- Polyphemus cannot merge or mutate unrelated branches; and
- the final state independently records exactly what was published.

## Expected code organization

The exact file names may change during implementation, but responsibilities should remain separated:

```text
src/domain/access-principal.ts               Access claims and Product Identity schemas
src/domain/repository-agent-rpc.ts           RPC commands, results and failures
src/domain/repository-task-live.ts           snapshot revision and live-message schemas
src/domain/pull-request-publication.ts        publication state and transitions
src/AccessIdentity.ts                        Access JWT verification service
src/RepositoryAgent.ts                       application operations, no transport
src/RepositoryAgentBackend.ts                RPC and WebSocket transport adapters
src/RepositoryTaskCoordinator.ts             state, invariants and live sockets
src/RepositoryPublisher.ts                   GitHub publication capability
src/PullRequestPublicationWorkflow.ts        durable publication orchestration
```

## Validation matrix

Every phase runs:

- root TypeScript typecheck;
- root unit tests;
- runner typecheck;
- production Website build;
- `git diff --check`;
- Alchemy plan before deployment;
- deployed edge-security tests; and
- a post-deploy no-op plan.

Additional focused validation covers:

- Access JWT cryptography and claim decoding;
- RPC compile-time and runtime contracts;
- preservation of existing coordinator state;
- WebSocket authorization, hibernation, ordering and reconnect;
- polling fallback;
- publication idempotency and base conflicts; and
- absence of credentials in logs, artifacts, events and Git configuration.

## Explicit non-goals for this plan

- private repositories;
- automatic merge;
- deployment or release operations;
- broad repository-setting mutation;
- multiple simultaneous agents for one Repository Task;
- raw model-token streaming;
- replacing the private Sandbox Runtime HTTP protocol with RPC; and
- selecting a final multi-user product identity model.
