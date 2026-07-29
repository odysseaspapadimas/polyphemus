# Polyphemus

Polyphemus is a supervised repository-agent product for turning one bounded repository objective into inspectable findings and validated changes.

## Language

**Repository Task**:
The durable supervised workspace for one repository objective, including its conversation and execution history.
_Avoid_: Task, job, issue

**Agent Run**:
One execution attempt within a Repository Task.
_Avoid_: Task, job, session

**Run Request**:
A user's submitted repository objective that creates a Repository Task and authorizes its first Agent Run.
_Avoid_: Approval, approved plan, job submission

**Run Assumption**:
An explicit interpretation an Agent Run adopts when its Run Request omits non-blocking information.
_Avoid_: Clarification, inferred requirement

**Patch**:
The consolidated uncommitted repository changes proposed by an Agent Run relative to its base revision.
_Avoid_: Commit, branch, pull request

**Run Result**:
The terminal account of an Agent Run's findings, assumptions, Patch, validation status, and unresolved risks.
_Avoid_: Agent answer, final message, artifact

**Validated Patch**:
A Patch that passes every required independent check for its Agent Run.
_Avoid_: Successful run, agent-approved patch

**Pull Request Publication**:
The autonomous contribution that turns one Validated Patch into an agent-owned branch and draft pull request against the Patch's source repository.
_Avoid_: Deployment, merge, agent write access

**Agent Branch**:
A repository branch owned and updated only by Polyphemus for one Pull Request Publication.
_Avoid_: User branch, working tree, Patch

## Relationships

- A **Repository Task** has one or more **Agent Runs** over its lifetime
- A **Repository Task** has at most one active **Agent Run** at a time
- An **Agent Run** belongs to exactly one **Repository Task**
- A **Run Request** authorizes one **Agent Run** without a separate approval
- An **Agent Run** may make one or more **Run Assumptions** rather than pausing for non-blocking clarification
- An **Agent Run** produces exactly one **Run Result**, including safe partial evidence when execution cannot finish
- An **Agent Run** produces at most one **Patch**
- A **Patch** becomes a **Validated Patch** only after every required independent check passes
- A **Validated Patch** may produce at most one **Pull Request Publication**
- A **Pull Request Publication** owns exactly one **Agent Branch** and at most one draft pull request
- A **Pull Request Publication** does not authorize Polyphemus to merge its draft pull request

## Example dialogue

> **Dev:** “Validation failed. Should retrying create another **Repository Task**?”
> **Domain expert:** “No. Keep the same **Repository Task** and start a new **Agent Run** after revising the objective or constraints.”

## Flagged ambiguities

- “task” was used for both the durable workspace and an execution attempt — resolved: **Repository Task** is the workspace; **Agent Run** is an attempt.
- The original MVP required a plan approval before execution — resolved for the prototype: a **Run Request** itself authorizes the first **Agent Run**.
- “clarification” could mean any missing detail or only a true blocker — resolved: an **Agent Run** proceeds with documented **Run Assumptions** unless execution is impossible or unsafe.
- “failed run” was used for both execution failure and failing Patch checks — resolved: an **Agent Run** may complete with a non-validated **Patch**; execution failure means no usable result could be completed.
- “agent write access” blurred local editing and remote contribution — resolved: an **Agent Run** writes only its isolated working tree; a **Pull Request Publication** contributes a Validated Patch through an Agent Branch.
