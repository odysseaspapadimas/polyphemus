import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import {
  decodeGitHubAppConfiguration,
  issueGitHubAppInstallationToken,
} from "../src/GitHubAppCredential.ts";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
  type: "pkcs8",
  format: "pem",
}).toString();

const configuration = Effect.runSync(decodeGitHubAppConfiguration({
  appId: "12345",
  installationId: "67890",
  privateKey: Redacted.make(privateKey),
  publisherLogin: "polyphemus-bot",
}));

describe("GitHub App publication credentials", () => {
  test("exchanges a bounded App JWT for a short-lived installation token", async () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z");
    let authorization = "";
    let requestedUrl = "";
    const token = await Effect.runPromise(issueGitHubAppInstallationToken(
      configuration,
      (async (input, init) => {
        requestedUrl = String(input);
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify({
          token: "installation-token",
          expires_at: new Date(now + 3_600_000).toISOString(),
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch,
      () => now,
    ));

    expect(Redacted.value(token)).toBe("installation-token");
    expect(requestedUrl).toEndWith("/app/installations/67890/access_tokens");
    const jwt = authorization.replace("Bearer ", "");
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString()) as {
      iss: string;
      iat: number;
      exp: number;
    };
    expect(payload.iss).toBe("12345");
    expect(payload.exp - payload.iat).toBe(570);
  });

  test("fails safely without exposing the App private key", async () => {
    const failure = await Effect.runPromise(issueGitHubAppInstallationToken(
      configuration,
      (async () => new Response("forbidden", { status: 401 })) as unknown as typeof fetch,
    ).pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => null })));

    expect(failure?.operation).toBe("issue-github-installation-token");
    expect(JSON.stringify(failure)).not.toContain(privateKey.slice(30, 80));
  });
});
