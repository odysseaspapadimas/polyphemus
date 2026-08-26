# Polyphemus

Polyphemus is a supervised repository agent that turns one bounded objective for a public GitHub repository into an inspectable, independently validated Patch and, when validation passes, a draft pull request.

> **Prototype:** Polyphemus currently targets a private single-user preview and supported public repositories. It does not merge pull requests or give GitHub credentials to the repository agent.

## How it works

```text
TanStack Start UI
  -> Cloudflare Access
  -> private Repository Agent Worker
  -> durable Repository Task + Agent Run Workflow
  -> private Sandbox Runtime Worker
  -> isolated Cloudflare Sandbox container
       -> Pi edits an uncredentialed working tree
       -> scoped Model Proxy grant
  -> independent install, test, typecheck, and diff validation
  -> immutable R2 Run Result + D1 task index
  -> post-run GitHub publisher
  -> agent-owned branch and draft pull request
```

A **Repository Task** is the durable workspace for one repository objective. Each execution attempt is an **Agent Run**. An Agent Run may produce a **Patch**, but it becomes a **Validated Patch** only after Polyphemus independently runs every configured check after Pi has stopped.

See [`CONTEXT.md`](./CONTEXT.md) for the complete product vocabulary.

## Security boundaries

- Repository and model data are decoded at Worker, process, file, and persistence boundaries.
- Repository code runs under a credential-free Unix identity in an isolated container.
- Pi receives a short-lived, Sandbox-scoped model grant—not the provider credential.
- GitHub credentials are available only to the publisher after Pi exits.
- Dependencies are reinstalled without lifecycle scripts before independent validation.
- The worktree is frozen before Patch evidence is collected.
- Agent-reported claims remain distinct from independently observed validation.
- Pull Request Publication creates a draft PR; it never merges it.

The current product and threat model are described in [`docs/mvp-spec.md`](./docs/mvp-spec.md). The original feasibility work remains in [`docs/sandbox-pi-feasibility-spike.md`](./docs/sandbox-pi-feasibility-spike.md).

## Stack

- [Effect](https://effect.website/) for application operations, failures, retries, and lifecycle
- [Pi](https://github.com/badlogic/pi-mono) for the repository agent runtime
- [Alchemy](https://alchemy.run/) for infrastructure as code
- Cloudflare Workers, Workflows, Durable Objects, Sandbox, R2, D1, and Access
- TanStack Start, React, and Vite for the product shell
- Bun for package management and tooling

## Requirements

- Bun 1.3.12
- Docker
- A Cloudflare account authenticated for Alchemy/Wrangler
- An OpenCode Go API key
- A GitHub credential for the account that will own Agent Branches and draft PRs

## Configuration

Copy the example environment file:

```sh
cp .env.example .env
```

Set these values without committing them:

```dotenv
OPENCODE_API_KEY=
SANDBOX_API_TOKEN=
GITHUB_TOKEN=
```

`SANDBOX_API_TOKEN` should be a strong random value. The GitHub credential must be able to create public forks, branches, commits, and draft pull requests. For the prototype, a classic personal access token with `public_repo` scope is the simplest option.

Before deploying to another account or domain, update the single-user Cloudflare Access configuration in [`src/PreviewAccess.ts`](./src/PreviewAccess.ts).

## Development

```sh
bun install --frozen-lockfile
bun run dev
```

Use Alchemy development rather than plain Vite when exercising Workflows, Durable Objects, service bindings, Sandbox, R2, D1, and secrets.

## Validation

```sh
bun test
bun run typecheck
bun run build
```

The test suite covers domain transitions, RPC and persistence boundaries, Sandbox lifecycle and isolation, validation evidence, Patch decoding, GitHub publication, and deployed edge exposure.

## Deployment

Preview the infrastructure changes:

```sh
bun run alchemy:plan
```

Deploy the application and Sandbox container:

```sh
bun run alchemy:deploy
```

For a non-interactive deployment:

```sh
bun alchemy deploy --yes
```

Then verify the deployed edge boundaries:

```sh
bun run test:deployed
```

## Current limitations

- Public GitHub repositories only
- Single-user Cloudflare Access preview
- One active Agent Run per Repository Task
- Fixed model provider and model route
- Textual Patches within configured size limits
- Draft pull requests only; no merge, release, or deployment authority

## License

No license has been selected yet.
