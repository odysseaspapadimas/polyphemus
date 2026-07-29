import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import { makeAccessIdentity } from "../src/AccessIdentity.ts";

const ISSUER = "https://odysseas-dev.cloudflareaccess.com";
const AUDIENCE = "access-audience";
const NOW = Date.parse("2026-07-29T12:00:00.000Z");

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const jsonPart = (value: unknown): string =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

const generateSigner = async (kid: string) => {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const sign = async (claims: Record<string, unknown>, header: Record<string, unknown> = {}) => {
    const encodedHeader = jsonPart({ alg: "RS256", typ: "JWT", kid, ...header });
    const encodedClaims = jsonPart(claims);
    const input = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
    const buffer = new ArrayBuffer(input.byteLength);
    new Uint8Array(buffer).set(input);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, buffer);
    return `${encodedHeader}.${encodedClaims}.${base64Url(new Uint8Array(signature))}`;
  };
  return {
    jwk: { ...publicJwk, kty: "RSA", kid, alg: "RS256", use: "sig" },
    sign,
  };
};

const claims = (overrides: Record<string, unknown> = {}) => ({
  iss: ISSUER,
  aud: AUDIENCE,
  exp: Math.floor(NOW / 1_000) + 300,
  nbf: Math.floor(NOW / 1_000) - 10,
  email: " Developer@Example.com ",
  ...overrides,
});

const failureCode = (effect: ReturnType<ReturnType<typeof makeAccessIdentity>["verify"]>) =>
  Effect.runPromise(effect.pipe(Effect.match({
    onFailure: (error) => error.code,
    onSuccess: () => "unexpected-success" as const,
  })));

describe("verified Cloudflare Access identity", () => {
  test("verifies RS256 and derives the normalized token email", async () => {
    const signer = await generateSigner("key-1");
    const verifier = makeAccessIdentity(
      { issuer: ISSUER, audience: AUDIENCE },
      {
        now: () => NOW,
        fetchJwks: async () => ({ value: { keys: [signer.jwk] }, maxAgeMs: 60_000 }),
      },
    );

    const identity = await Effect.runPromise(verifier.verify(await signer.sign(claims())));
    expect(identity).toEqual({ userId: "developer@example.com" });
  });

  test("fails closed for malformed, expired, not-active, issuer, audience, and signature errors", async () => {
    const signer = await generateSigner("key-1");
    const other = await generateSigner("key-2");
    const verifier = makeAccessIdentity(
      { issuer: ISSUER, audience: AUDIENCE },
      { now: () => NOW, fetchJwks: async () => ({ value: { keys: [signer.jwk] } }) },
    );

    expect(await failureCode(verifier.verify(undefined))).toContain("missing");
    expect(await failureCode(verifier.verify("not-a-jwt"))).toContain("malformed");
    expect(await failureCode(verifier.verify(await signer.sign(claims({ exp: NOW / 1_000 }))))).toContain("expired");
    expect(await failureCode(verifier.verify(await signer.sign(claims({ nbf: NOW / 1_000 + 1 }))))).toContain("not-active");
    expect(await failureCode(verifier.verify(await signer.sign(claims({ iss: "https://wrong.example" }))))).toContain("wrong-issuer");
    expect(await failureCode(verifier.verify(await signer.sign(claims({ aud: "wrong-audience" }))))).toContain("wrong-audience");
    expect(await failureCode(verifier.verify(await signer.sign(claims({ email: "not-an-email" }))))).toContain("invalid-email");
    expect(await failureCode(verifier.verify(await other.sign(claims(), { kid: "key-1" })))).toContain("invalid-signature");
  });

  test("refreshes a fresh JWKS when a rotated kid first appears", async () => {
    const first = await generateSigner("key-1");
    const second = await generateSigner("key-2");
    let requests = 0;
    const verifier = makeAccessIdentity(
      { issuer: ISSUER, audience: AUDIENCE },
      {
        now: () => NOW,
        fetchJwks: async () => ({
          value: { keys: requests++ === 0 ? [first.jwk] : [first.jwk, second.jwk] },
          maxAgeMs: 60_000,
        }),
      },
    );

    await Effect.runPromise(verifier.verify(await first.sign(claims())));
    await Effect.runPromise(verifier.verify(await second.sign(claims())));
    expect(requests).toBe(2);
  });

  test("bounds unknown-kid JWKS refreshes per cache generation", async () => {
    const signer = await generateSigner("key-1");
    let requests = 0;
    const verifier = makeAccessIdentity(
      { issuer: ISSUER, audience: AUDIENCE },
      {
        now: () => NOW,
        fetchJwks: async () => {
          requests += 1;
          return { value: { keys: [signer.jwk] }, maxAgeMs: 60_000 };
        },
      },
    );

    expect(await failureCode(verifier.verify(
      await signer.sign(claims(), { kid: "unknown-1" }),
    ))).toBe("unknown-key");
    expect(await failureCode(verifier.verify(
      await signer.sign(claims(), { kid: "unknown-2" }),
    ))).toBe("unknown-key");
    expect(requests).toBe(1);
  });
});
