# Project instructions

- Treat Polyphemus as a production Effect application even while the feasibility spike remains deliberately narrow.
- Decode unknown data at every Worker, Sandbox, process, model, file, and persistence boundary.
- Keep Promise and platform adapters small; express application operations, failures, retries, and lifecycle with Effect.
- Do not load project-local Pi extensions, settings, skills, prompts, or context from cloned repositories during the spike.
- Never expose model credentials in logs, result files, prompts, or user-visible events.
- Preserve the distinction between agent-reported claims and independently observed validation.
- Do not add the Workflow, task coordinator, R2 artifacts, or product UI until the feasibility gate in `docs/sandbox-pi-feasibility-spike.md` passes.
