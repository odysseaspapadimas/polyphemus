import { expect, test } from "bun:test";

const requiredOrigin = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is required for deployed tests`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value.replace(/\/$/, "") ||
      url.username !== "" || url.password !== "") {
    throw new Error(`${name} must be an uncredentialed HTTPS origin`);
  }
  return url.origin;
};

const WEBSITE_URL = requiredOrigin("POLYPHEMUS_DEPLOYED_WEBSITE_URL");
const MODEL_PROXY_URL = requiredOrigin("POLYPHEMUS_MODEL_PROXY_ORIGIN");
const REPOSITORY_AGENT_URL = requiredOrigin("POLYPHEMUS_DEPLOYED_REPOSITORY_AGENT_URL");
const SANDBOX_RUNTIME_URL = requiredOrigin("POLYPHEMUS_DEPLOYED_SANDBOX_RUNTIME_URL");

test("deployed Website is protected by Cloudflare Access", async () => {
  const response = await fetch(WEBSITE_URL, { redirect: "manual" });
  expect([302, 303, 307, 403]).toContain(response.status);
  if (response.status !== 403) {
    expect(response.headers.get("location")).toContain("cloudflareaccess.com");
  }
});

test("deployed Model Proxy rejects requests without a scoped grant", async () => {
  const response = await fetch(`${MODEL_PROXY_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "kimi-k2.7-code", messages: [] }),
  });
  expect(response.status).toBe(401);
});

test("private Repository Agent has no workers.dev route", async () => {
  const response = await fetch(`${REPOSITORY_AGENT_URL}/repository-tasks/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(404);
});

test("private Sandbox Runtime has no workers.dev route", async () => {
  const response = await fetch(`${SANDBOX_RUNTIME_URL}/health`);
  expect(response.status).toBe(404);
});
