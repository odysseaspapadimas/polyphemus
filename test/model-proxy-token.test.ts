import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  issueModelProxyToken,
  verifyModelProxyToken,
} from "../src/domain/model-proxy-token.ts";

describe("model proxy grants", () => {
  test("issues and verifies a scoped short-lived grant", async () => {
    const issuedAt = Date.parse("2026-07-28T10:00:00.000Z");
    const token = await Effect.runPromise(issueModelProxyToken(
      "test-signing-secret",
      "sandbox-agent-1",
      issuedAt,
    ));
    const grant = await Effect.runPromise(verifyModelProxyToken(
      "test-signing-secret",
      token,
      issuedAt + 1_000,
    ));

    expect(grant.sandboxId).toBe("sandbox-agent-1");
    expect(grant.expiresAt).toBeGreaterThan(issuedAt);
    expect(token).not.toContain("test-signing-secret");
  });

  test("rejects tampered and expired grants", async () => {
    const issuedAt = Date.parse("2026-07-28T10:00:00.000Z");
    const token = await Effect.runPromise(issueModelProxyToken(
      "test-signing-secret",
      "sandbox-agent-1",
      issuedAt,
    ));

    await expect(Effect.runPromise(verifyModelProxyToken(
      "test-signing-secret",
      `${token.slice(0, -1)}x`,
      issuedAt + 1_000,
    ))).rejects.toMatchObject({ _tag: "InvalidModelProxyToken" });
    await expect(Effect.runPromise(verifyModelProxyToken(
      "test-signing-secret",
      token,
      issuedAt + 13 * 60_000,
    ))).rejects.toMatchObject({ _tag: "InvalidModelProxyToken" });
  });
});
