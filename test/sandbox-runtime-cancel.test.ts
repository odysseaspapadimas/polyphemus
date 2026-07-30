import { describe, expect, test } from "bun:test";
import {
  handleSandboxRuntimeRequest,
  type SandboxRuntimeEnv,
} from "../src/sandbox-runtime.ts";

const sandboxId = "sandbox-cancel-test";
const processId = `pi-${sandboxId}`;
const secret = "sandbox-cancel-secret";

describe("Sandbox Runtime cancellation strategy", () => {
  test("destroys the Sandbox without waiting for process inspection", async () => {
    let forceKilled = false;
    let destroyed = false;
    const sandbox = {
      async configure() { throw new Error("cancel must not configure the Sandbox"); },
      async mkdir() { throw new Error("not used"); },
      async gitCheckout() { throw new Error("not used"); },
      async exec() { throw new Error("not used"); },
      async writeFile() { throw new Error("not used"); },
      async readFile() { throw new Error("not used"); },
      async startProcess() { throw new Error("not used"); },
      async getProcess() { throw new Error("cancel must not inspect a process"); },
      async forceKill() { forceKilled = true; },
      async destroy() {
        expect(forceKilled).toBe(true);
        destroyed = true;
      },
    };
    const env = {
      Sandbox: { getByName: () => sandbox },
      MODEL_PROXY_ORIGIN: "https://model-proxy.example.test",
      SANDBOX_API_TOKEN: secret,
    } as unknown as SandboxRuntimeEnv;

    const response = await handleSandboxRuntimeRequest(new Request(
      "https://sandbox-runtime.example.test/sandbox-runs/cancel",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sandboxId, processId }),
      },
    ), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sandboxId,
      processId,
      status: "cancelled",
      events: [],
      cleanup: "destroyed",
    });
    expect(forceKilled).toBe(true);
    expect(destroyed).toBe(true);
  });
});
