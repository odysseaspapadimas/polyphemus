import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  CircleStop,
  Clock3,
  Code2,
  Eye,
  FileCode2,
  GitBranch,
  LoaderCircle,
  Play,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  cancelRepositoryRun,
  getCurrentUser,
  getRepositoryRunResult,
  getRepositoryRunStatus,
  listRepositoryTasks,
  startAdditionalRepositoryRun,
  startRepositoryRun,
  type RepositoryRunRequest,
} from "../domain/run.functions.ts";
import {
  RepositoryRunHandleSchema,
  type AgentRunSnapshot,
  type RepositoryRunHandle,
  type RepositoryTaskSnapshot,
  type RunArtifact,
} from "../domain/repository-task.ts";
import type { SandboxRunResult } from "../domain/sandbox-run.ts";
import {
  FIXTURE_REPOSITORY,
  FIXTURE_TASK,
} from "../sandbox-config.ts";
import * as Schema from "effect/Schema";

export const Route = createFileRoute("/")({ component: Home });

const STAGES = ["Provision", "Clone", "Investigate", "Modify", "Validate", "Result"] as const;

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const handleFromLocation = (): RepositoryRunHandle | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    return Schema.decodeUnknownSync(RepositoryRunHandleSchema)({
      taskId: params.get("task"),
      runId: params.get("run"),
    });
  } catch {
    return null;
  }
};

const setHandleLocation = (handle: RepositoryRunHandle): void => {
  const url = new URL(window.location.href);
  url.searchParams.set("task", handle.taskId);
  url.searchParams.set("run", handle.runId);
  window.history.replaceState(null, "", url);
};

const isActiveRun = (run: AgentRunSnapshot | undefined): boolean =>
  run !== undefined && !["complete", "failed", "cancelled"].includes(run.stage);

function Home() {
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<RepositoryRunRequest>({
    repositoryUrl: FIXTURE_REPOSITORY,
    task: FIXTURE_TASK,
  });
  const [handle, setHandle] = useState<RepositoryRunHandle | null>(null);
  const [hydratedTaskId, setHydratedTaskId] = useState<string | null>(null);

  useEffect(() => setHandle(handleFromLocation()), []);

  const identityQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getCurrentUser(),
    staleTime: Infinity,
  });

  const taskIndexQuery = useQuery({
    queryKey: ["repository-task-index"],
    queryFn: () => listRepositoryTasks(),
    refetchInterval: 10_000,
  });

  const statusQuery = useQuery({
    queryKey: ["repository-task", handle?.taskId],
    queryFn: () => getRepositoryRunStatus({ data: handle! }),
    enabled: handle !== null,
    refetchInterval: (query) => query.state.data?.activeRunId === null ? false : 3_000,
    refetchIntervalInBackground: true,
  });

  const taskSnapshot = statusQuery.data;
  const currentRun = taskSnapshot?.agentRuns.find((run) => run.runId === handle?.runId);
  const activeRun = taskSnapshot?.agentRuns.find((run) => run.runId === taskSnapshot.activeRunId);

  useEffect(() => {
    if (taskSnapshot === undefined || hydratedTaskId === taskSnapshot.taskId) return;
    const selectedRequest = currentRun?.runRequest ?? taskSnapshot.runRequest;
    setRequest(selectedRequest);
    setHydratedTaskId(taskSnapshot.taskId);
  }, [currentRun?.runRequest, hydratedTaskId, taskSnapshot]);

  const resultQuery = useQuery({
    queryKey: ["run-result", handle?.taskId, handle?.runId, currentRun?.artifactKey],
    queryFn: () => getRepositoryRunResult({ data: handle! }),
    enabled: handle !== null && currentRun?.artifactKey !== null && currentRun?.artifactKey !== undefined,
    retry: 1,
  });

  const startMutation = useMutation({
    mutationFn: (input: RepositoryRunRequest) => startRepositoryRun({ data: input }),
    onSuccess: async (nextHandle) => {
      setHandle(nextHandle);
      setHandleLocation(nextHandle);
      await queryClient.invalidateQueries({ queryKey: ["repository-task-index"] });
    },
  });

  const rerunMutation = useMutation({
    mutationFn: (input: { taskId: string; runRequest: RepositoryRunRequest }) =>
      startAdditionalRepositoryRun({ data: input }),
    onSuccess: async (nextHandle) => {
      setHandle(nextHandle);
      setHandleLocation(nextHandle);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["repository-task", nextHandle.taskId] }),
        queryClient.invalidateQueries({ queryKey: ["repository-task-index"] }),
      ]);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (runHandle: RepositoryRunHandle) => cancelRepositoryRun({ data: runHandle }),
    onSuccess: async (snapshot) => {
      if (handle !== null) {
        queryClient.setQueryData(
          ["repository-task", handle.taskId],
          snapshot,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["repository-task-index"] });
    },
  });

  const busy = startMutation.isPending || rerunMutation.isPending || isActiveRun(activeRun);
  const shellError = startMutation.error ?? rerunMutation.error ?? statusQuery.error ??
    taskIndexQuery.error ?? identityQuery.error ?? resultQuery.error ?? cancelMutation.error;
  const artifact = resultQuery.data;

  return (
    <main className="page-shell">
      <header className="app-header">
        <a className="wordmark" href="/" aria-label="Polyphemus home">
          <span className="wordmark-eye"><Eye size={18} /></span>
          <span>POLYPHEMUS</span>
        </a>
        <div className="header-promise">One issue. One branch. One focused agent.</div>
        <div className="system-status"><span /> {identityQuery.data?.userId ?? "Private preview"}</div>
      </header>

      <section className="hero">
        <p className="eyebrow">A repository agent with its eye on the issue</p>
        <h1>Turn a bounded repository task into an inspectable Patch.</h1>
        <p className="hero-copy">
          Polyphemus works in an isolated Cloudflare Sandbox, shows its progress,
          and validates changes independently before presenting evidence.
        </p>
      </section>

      <div className="workspace-grid">
        <RunRequestPanel
          request={request}
          busy={busy}
          existingTask={taskSnapshot}
          error={startMutation.error ?? rerunMutation.error}
          onChange={setRequest}
          onSubmit={() => taskSnapshot === undefined
            ? startMutation.mutate(request)
            : rerunMutation.mutate({
                taskId: taskSnapshot.taskId,
                runRequest: { ...request, repositoryUrl: taskSnapshot.runRequest.repositoryUrl },
              })}
        />
        <RunProgressPanel
          run={activeRun ?? currentRun}
          starting={startMutation.isPending || rerunMutation.isPending}
          cancelling={cancelMutation.isPending}
          onCancel={() => taskSnapshot?.activeRunId && cancelMutation.mutate({
            taskId: taskSnapshot.taskId,
            runId: taskSnapshot.activeRunId,
          })}
        />
      </div>

      <RepositoryTaskIndex
        tasks={taskIndexQuery.data ?? []}
        selectedTaskId={handle?.taskId ?? null}
        onSelect={(task) => {
          const run = task.agentRuns.at(-1);
          if (run === undefined) return;
          const nextHandle = { taskId: task.taskId, runId: run.runId };
          setHandle(nextHandle);
          setHandleLocation(nextHandle);
        }}
      />

      {taskSnapshot ? (
        <RunHistory
          snapshot={taskSnapshot}
          selectedRunId={handle?.runId ?? null}
          onSelect={(runId) => {
            const nextHandle = { taskId: taskSnapshot.taskId, runId };
            setHandle(nextHandle);
            setHandleLocation(nextHandle);
          }}
        />
      ) : null}

      {shellError ? <div className="global-error" role="alert">{errorMessage(shellError)}</div> : null}
      {artifact?.terminal.status === "completed" ? <RunResultPanel result={artifact.terminal.result} /> : null}
      {artifact?.terminal.status === "failed" ? <TerminalRunPanel artifact={artifact} /> : null}
      {artifact?.terminal.status === "cancelled" ? <TerminalRunPanel artifact={artifact} /> : null}

      <footer className="app-footer">
        <span>Public repository preview</span>
        <span>Public repository · No GitHub writes · Independent validation</span>
      </footer>
    </main>
  );
}

function RunRequestPanel(props: Readonly<{
  request: RepositoryRunRequest;
  busy: boolean;
  existingTask: RepositoryTaskSnapshot | undefined;
  error: unknown;
  onChange: (request: RepositoryRunRequest) => void;
  onSubmit: () => void;
}>) {
  const valid = props.request.repositoryUrl.trim().length > 0 && props.request.task.trim().length > 0;
  return (
    <form
      className="panel request-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !props.busy) props.onSubmit();
      }}
    >
      <div className="panel-heading">
        <div><p className="eyebrow">Run Request</p><h2>{props.existingTask ? "Refine the next attempt" : "Focus the agent"}</h2></div>
        <span className="preview-badge">Public preview</span>
      </div>

      <label>
        Public GitHub repository
        <div className="input-shell"><GitBranch size={17} />
          <input
            value={props.existingTask?.runRequest.repositoryUrl ?? props.request.repositoryUrl}
            disabled={props.existingTask !== undefined}
            onChange={(event) => props.onChange({
              ...props.request,
              repositoryUrl: event.target.value,
            })}
            placeholder="https://github.com/owner/repository"
            spellCheck={false}
          />
        </div>
        <span className="field-note">{props.existingTask ? "All Agent Runs in this Repository Task use the same repository." : "Public GitHub repositories with Bun or npm lockfiles are supported."}</span>
      </label>

      <label>
        Objective
        <textarea
          value={props.request.task}
          onChange={(event) => props.onChange({ ...props.request, task: event.target.value })}
          placeholder="Describe one bounded repository change"
        />
      </label>

      <button className="primary-command" type="submit" disabled={!valid || props.busy}>
        {props.busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
        {props.busy ? "Agent Run active" : props.existingTask ? "Run again" : "Start Agent Run"}
      </button>
      <p className="authorization-note">
        Submitting authorizes one isolated Agent Run. It cannot write to GitHub.
      </p>
      {props.error ? <p className="inline-error">{errorMessage(props.error)}</p> : null}
    </form>
  );
}

function RepositoryTaskIndex(props: Readonly<{
  tasks: readonly RepositoryTaskSnapshot[];
  selectedTaskId: string | null;
  onSelect: (task: RepositoryTaskSnapshot) => void;
}>) {
  return (
    <section className="panel task-index" aria-label="Repository Task index">
      <div className="panel-heading">
        <div><p className="eyebrow">Private workspace</p><h2>Repository Tasks</h2></div>
        <span className="idle-badge">{props.tasks.length} task{props.tasks.length === 1 ? "" : "s"}</span>
      </div>
      {props.tasks.length === 0 ? (
        <p className="task-index-empty">Your submitted Repository Tasks will appear here.</p>
      ) : (
        <ol>
          {props.tasks.map((task) => {
            const latest = task.agentRuns.at(-1);
            return (
              <li key={task.taskId}>
                <button
                  type="button"
                  data-selected={task.taskId === props.selectedTaskId ? "true" : "false"}
                  onClick={() => props.onSelect(task)}
                >
                  <span className="task-index-repository">{repositoryLabel(task.runRequest.repositoryUrl)}</span>
                  <strong>{latest?.runRequest?.task ?? task.runRequest.task}</strong>
                  <span className="history-status" data-stage={latest?.stage ?? "submitted"}>
                    {humanize(latest?.stage ?? "submitted")}
                  </span>
                  <small>{task.agentRuns.length} attempt{task.agentRuns.length === 1 ? "" : "s"}</small>
                  <time>{formatTime(task.updatedAt)}</time>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function RunHistory(props: Readonly<{
  snapshot: RepositoryTaskSnapshot;
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}>) {
  return (
    <section className="panel run-history" aria-label="Agent Run history">
      <div className="panel-heading">
        <div><p className="eyebrow">Repository Task</p><h2>Agent Run history</h2></div>
        <span className="idle-badge">{props.snapshot.agentRuns.length} attempt{props.snapshot.agentRuns.length === 1 ? "" : "s"}</span>
      </div>
      <ol>
        {[...props.snapshot.agentRuns].reverse().map((run, reversedIndex) => {
          const attempt = props.snapshot.agentRuns.length - reversedIndex;
          const runRequest = run.runRequest ?? props.snapshot.runRequest;
          return (
            <li key={run.runId}>
              <button
                type="button"
                data-selected={run.runId === props.selectedRunId ? "true" : "false"}
                onClick={() => props.onSelect(run.runId)}
              >
                <span className="history-attempt">Attempt {attempt}</span>
                <span className="history-objective">{runRequest.task}</span>
                <span className="history-status" data-stage={run.stage}>{humanize(run.stage)}</span>
                <time>{formatTime(run.startedAt)}</time>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RunProgressPanel(props: Readonly<{
  run: AgentRunSnapshot | undefined;
  starting: boolean;
  cancelling: boolean;
  onCancel: () => void;
}>) {
  const events = props.run?.events ?? [];
  const active = props.starting || isActiveRun(props.run);
  const hasRun = props.starting || props.run !== undefined;
  const stageIndex = progressStage(props.run, props.starting);
  const statusLabel = props.starting
    ? "Submitting the Run Request"
    : props.run?.activity ?? "Ready for a Run Request";

  return (
    <section className="panel progress-panel" aria-label="Agent Run progress">
      <div className="panel-heading">
        <div><p className="eyebrow">Agent Run</p><h2>{statusLabel}</h2></div>
        {active ? (
          <button
            className="cancel-command"
            type="button"
            disabled={props.starting || props.cancelling || props.run?.stage === "cancelling"}
            onClick={props.onCancel}
          ><CircleStop size={16} /> {props.cancelling || props.run?.stage === "cancelling" ? "Cancelling" : "Cancel"}</button>
        ) : <span className="idle-badge">{hasRun ? "Durable" : "Idle"}</span>}
      </div>

      <ol className="run-stages">
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            data-state={!hasRun ? "pending" : index < stageIndex ? "done" : index === stageIndex ? "current" : "pending"}
          >
            <span>{index < stageIndex ? <Check size={12} /> : index + 1}</span>
            <small>{stage}</small>
          </li>
        ))}
      </ol>

      {active ? (
        <div className="activity-card">
          <div className="activity-orbit"><span /></div>
          <div>
            <strong>{statusLabel}</strong>
            <p>{activityDetail(props.run, props.starting)}</p>
          </div>
        </div>
      ) : props.run?.stage === "cancelled" ? (
        <div className="cancelled-state"><CircleStop size={20} /><div><strong>Run stopped safely</strong><p>The Sandbox reported {props.run.cleanup} cleanup.</p></div></div>
      ) : props.run?.stage === "failed" ? (
        <div className="cancelled-state"><CircleStop size={20} /><div><strong>Run failed safely</strong><p>{props.run.failure?.message ?? "Inspect the durable Run Result for details."}</p></div></div>
      ) : props.run?.stage === "complete" ? (
        <div className="cancelled-state"><ShieldCheck size={20} /><div><strong>Run Result persisted</strong><p>This result can be restored from its Repository Task URL.</p></div></div>
      ) : (
        <div className="empty-progress">
          <TerminalSquare size={30} />
          <strong>No active Agent Run</strong>
          <p>Submit one concrete objective to begin.</p>
        </div>
      )}

      {events.length > 0 ? (
        <div className="event-log">
          <div className="event-log-heading"><span>Recent activity</span><span>{events.length} events</span></div>
          <ul>{events.slice(-7).reverse().map((event, index) => (
            <li key={`${event.timestamp}-${index}`}>
              <span data-error={event.isError ? "true" : "false"} />
              <div><strong>{event.label}</strong><small>{event.tool ?? event.stage}</small></div>
              <time>{formatTime(event.timestamp)}</time>
            </li>
          ))}</ul>
        </div>
      ) : null}
    </section>
  );
}

function TerminalRunPanel({ artifact }: Readonly<{ artifact: RunArtifact }>) {
  if (artifact.terminal.status === "completed") return null;
  const cancelled = artifact.terminal.status === "cancelled";
  const message = cancelled
    ? "The Agent Run was cancelled without claiming a validated Patch."
    : artifact.terminal.failure.message;
  const cleanup = cancelled
    ? artifact.terminal.cancellation.cleanup
    : artifact.terminal.cleanup;
  return (
    <section className="result-section" aria-label="Terminal Agent Run result">
      <div className="result-banner" data-validated="false">
        <div className="result-icon"><CircleStop size={26} /></div>
        <div>
          <p className="eyebrow">Durable Run Result</p>
          <h2>{message}</h2>
        </div>
        <div className="validation-score">
          <strong>{cancelled ? "Cancelled" : "Failed"}</strong>
          <span>cleanup {cleanup ?? "unknown"}</span>
        </div>
      </div>
    </section>
  );
}

function RunResultPanel({ result }: Readonly<{ result: SandboxRunResult }>) {
  const passed = result.validation.filter((check) => check.passed).length;
  return (
    <section className="result-section" aria-label="Agent Run result">
      <div className="result-banner" data-validated={result.validated ? "true" : "false"}>
        <div className="result-icon"><ShieldCheck size={26} /></div>
        <div><p className="eyebrow">Run Result</p><h2>{result.pi.summary}</h2></div>
        <div className="validation-score"><strong>{passed}/{result.validation.length}</strong><span>checks passed</span></div>
      </div>

      <div className="result-grid">
        <article className="panel evidence-panel">
          <div className="section-title"><Code2 size={18} /><h3>Patch</h3><span>{result.changedFiles.length} file changed</span></div>
          <ul className="changed-files">{result.changedFiles.map((file) => <li key={file}><FileCode2 size={15} />{file}</li>)}</ul>
          <pre className="patch-view"><code>{result.patch}</code></pre>
        </article>

        <aside className="result-sidebar">
          <article className="panel evidence-panel">
            <div className="section-title"><ShieldCheck size={18} /><h3>Independent validation</h3></div>
            <ul className="validation-list">{result.validation.map((check) => (
              <li key={check.name} data-passed={check.passed ? "true" : "false"}>
                <span>{check.passed ? <Check size={13} /> : "!"}</span>
                <div><strong>{humanize(check.name)}</strong><small>{check.command}</small></div>
                <time>{formatDuration(check.durationMs)}</time>
              </li>
            ))}</ul>
          </article>

          <article className="panel evidence-panel">
            <div className="section-title"><Clock3 size={18} /><h3>Run budget</h3></div>
            <dl className="budget-list">
              <div><dt>Commands</dt><dd>{result.pi.budgetUsage.commands.used} / {result.pi.budgetUsage.commands.limit}</dd></div>
              <div><dt>Agent time</dt><dd>{formatDuration(result.pi.budgetUsage.wallClock.elapsedMs)}</dd></div>
              <div><dt>Model tokens</dt><dd>{result.pi.budgetUsage.model.totalTokens.toLocaleString()}</dd></div>
              <div><dt>Termination</dt><dd>{humanize(result.pi.terminationReason)}</dd></div>
            </dl>
          </article>
        </aside>
      </div>

      <div className="result-grid lower-result-grid">
        <article className="panel prose-panel"><p className="eyebrow">Findings</p><ul>{result.pi.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul></article>
        <article className="panel prose-panel"><p className="eyebrow">Run Assumptions</p><ul>{result.runAssumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></article>
      </div>
    </section>
  );
}

const progressStage = (run: AgentRunSnapshot | undefined, starting: boolean): number => {
  if (starting || run?.stage === "submitted") return 0;
  if (run?.stage === "provisioning") return 1;
  if (run?.stage === "investigating") return 2;
  if (run?.stage === "modifying" || run?.stage === "cancelling") return 3;
  if (run?.stage === "validating") return 4;
  if (run?.stage === "complete" || run?.stage === "failed" || run?.stage === "cancelled") return 5;
  return 0;
};

const activityDetail = (run: AgentRunSnapshot | undefined, starting: boolean): string => {
  if (starting) return "Creating a durable Repository Task and its first Agent Run.";
  if (run?.stage === "validating") {
    return "Pi has stopped. Polyphemus owns these checks and records their observed output.";
  }
  const event = run?.events.at(-1);
  if (event?.tool) return `${humanize(event.tool)} · durable Workflow`;
  if (run?.workflowId) return `Workflow ${run.workflowId}`;
  return "Waiting for the durable Workflow to begin.";
};

const repositoryLabel = (repositoryUrl: string): string => {
  try {
    return new URL(repositoryUrl).pathname.replace(/^\//, "");
  } catch {
    return repositoryUrl;
  }
};

const humanize = (value: string): string =>
  value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatTime = (value: string): string =>
  new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));

const formatDuration = (milliseconds: number): string =>
  milliseconds < 1_000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1_000).toFixed(1)}s`;
