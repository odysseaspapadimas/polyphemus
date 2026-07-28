import { expect, test } from "bun:test";
import * as Schema from "effect/Schema";
import {
  SpikeCancelResultSchema,
  SpikeFinalResultSchema,
  SpikeStartResultSchema,
  SpikeStatusResultSchema,
  type SpikeStartResult,
} from "../../src/domain/spike.ts";
import {
  SPIKE_FIXTURE_BASE_SHA,
  SPIKE_FIXTURE_REPOSITORY,
} from "../../src/spike-config.ts";

const workerUrl = (
  process.env.SPIKE_WORKER_URL ??
  "https://polyphemus-spike.odysseas-patra.workers.dev"
).replace(/\/$/, "");
const token = process.env.SPIKE_API_TOKEN;

if (!token) throw new Error("SPIKE_API_TOKEN is required for deployed tests");

const post = async (path: string, body: unknown): Promise<unknown> => {
  const response = await fetch(`${workerUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const value = await response.json() as unknown;
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(value)}`);
  }
  return value;
};

const runId = (kind: "happy" | "cancel"): string =>
  `spike-${kind}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;

const start = async (sandboxId: string, task: string) =>
  Schema.decodeUnknownSync(SpikeStartResultSchema)(await post("/spike/start", {
    sandboxId,
    repositoryUrl: SPIKE_FIXTURE_REPOSITORY,
    expectedBaseSha: SPIKE_FIXTURE_BASE_SHA,
    task,
  }));

const cancelQuietly = async (run: SpikeStartResult | undefined): Promise<void> => {
  if (!run) return;
  await post("/spike/cancel", {
    sandboxId: run.sandboxId,
    processId: run.processId,
  }).catch(() => undefined);
};

test.serial("deployed Sandbox runs Pi and independently validates its Patch", async () => {
  let run: SpikeStartResult | undefined;
  let destroyed = false;
  try {
    run = await start(
      runId("happy"),
      "Fix the failing mergeRanges behavior. Make the smallest correct change, run the repository checks, and finish with structured findings.",
    );
    expect(run.baseSha).toBe(SPIKE_FIXTURE_BASE_SHA);
    expect(run.initialTestExitCode).not.toBe(0);

    for (let attempt = 0; attempt < 48; attempt += 1) {
      const status = Schema.decodeUnknownSync(SpikeStatusResultSchema)(await post(
        "/spike/status",
        { sandboxId: run.sandboxId, processId: run.processId },
      ));
      if (status.status === "missing") {
        throw new Error("Pi process disappeared before finalization");
      }
      if (status.status !== "starting" && status.status !== "running") break;
      await Bun.sleep(15_000);
    }

    const result = Schema.decodeUnknownSync(SpikeFinalResultSchema)(await post(
      "/spike/finalize",
      { sandboxId: run.sandboxId, processId: run.processId },
    ));
    destroyed = result.cleanup === "destroyed";

    expect(result.repositoryUrl).toBe(SPIKE_FIXTURE_REPOSITORY);
    expect(result.runRequest).toBe(result.pi.runRequest);
    expect(result.runAssumptions).toEqual(result.pi.assumptions);
    expect(result.pi.status).toBe("completed");
    expect(result.pi.terminationReason).toBe("finish_run");
    expect(result.pi.budgetUsage.commands.used).toBeLessThanOrEqual(
      result.pi.budgetUsage.commands.limit,
    );
    expect(result.pi.budgetUsage.wallClock.elapsedMs).toBeLessThan(
      result.pi.budgetUsage.wallClock.limitMs,
    );
    expect(result.pi.budgetUsage.model.totalTokens).toBeGreaterThan(0);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.changedFiles).toEqual(["src/merge-ranges.ts"]);
    expect(result.patch).toContain("Math.max(current.end, next.end)");
    expect(result.validation.map(({ name, passed }) => ({ name, passed }))).toEqual([
      { name: "visible-tests", passed: true },
      { name: "typecheck", passed: true },
      { name: "held-out-tests", passed: true },
      { name: "diff-check", passed: true },
    ]);
    expect(result.validated).toBe(true);
    expect(result.cleanup).toBe("destroyed");
  } finally {
    if (!destroyed) await cancelQuietly(run);
  }
}, 15 * 60_000);

test.serial("deployed cancellation stops Pi and destroys its Sandbox", async () => {
  let run: SpikeStartResult | undefined;
  let destroyed = false;
  try {
    run = await start(
      runId("cancel"),
      "Investigate the mergeRanges failure thoroughly, fix it, run all checks, and finish with structured findings.",
    );
    let observedActive = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const status = Schema.decodeUnknownSync(SpikeStatusResultSchema)(await post(
        "/spike/status",
        { sandboxId: run.sandboxId, processId: run.processId },
      ));
      if (
        (status.status === "starting" || status.status === "running") &&
        status.events.length > 0
      ) {
        observedActive = true;
        break;
      }
      if (status.status !== "starting" && status.status !== "running") {
        throw new Error(`Pi reached ${status.status} before the interruption`);
      }
      await Bun.sleep(2_000);
    }
    expect(observedActive).toBe(true);

    const result = Schema.decodeUnknownSync(SpikeCancelResultSchema)(await post(
      "/spike/cancel",
      { sandboxId: run.sandboxId, processId: run.processId },
    ));
    destroyed = result.cleanup === "destroyed";

    expect(result.status).toBe("cancelled");
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.cleanup).toBe("destroyed");
    expect(result).not.toHaveProperty("validated");
  } finally {
    if (!destroyed) await cancelQuietly(run);
  }
}, 10 * 60_000);
