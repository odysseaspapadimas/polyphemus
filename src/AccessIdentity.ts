import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  AccessPrincipalClaimsSchema,
  InvalidAccessToken,
  audienceContains,
  identityFromVerifiedAccessClaims,
  type AccessPrincipalClaims,
} from "./domain/access-principal.ts";
import type { ProductIdentity } from "./domain/product-identity.ts";

const MAX_ASSERTION_CHARACTERS = 32_768;
const DEFAULT_JWKS_TTL_MS = 5 * 60 * 1_000;
const MAX_JWKS_TTL_MS = 60 * 60 * 1_000;
const FORCED_JWKS_REFRESH_INTERVAL_MS = 5_000;

const AccessJwtHeaderSchema = Schema.Struct({
  alg: Schema.String,
  kid: Schema.Trim.check(Schema.isMinLength(1)),
  typ: Schema.optional(Schema.String),
});

const AccessJwkSchema = Schema.Struct({
  kty: Schema.Literal("RSA"),
  kid: Schema.Trim.check(Schema.isMinLength(1)),
  alg: Schema.optional(Schema.String),
  use: Schema.optional(Schema.String),
  n: Schema.Trim.check(Schema.isMinLength(1)),
  e: Schema.Trim.check(Schema.isMinLength(1)),
});
type AccessJwk = typeof AccessJwkSchema.Type;

const AccessJwksSchema = Schema.Struct({
  keys: Schema.Array(AccessJwkSchema),
});

export interface AccessIdentityConfig {
  readonly issuer: string;
  readonly audience: string;
}

export interface FetchedAccessJwks {
  readonly value: unknown;
  readonly maxAgeMs?: number;
}

export interface AccessIdentityDependencies {
  readonly fetchJwks?: () => Promise<FetchedAccessJwks>;
  readonly now?: () => number;
  readonly verifySignature?: (
    jwk: AccessJwk,
    signingInput: Uint8Array,
    signature: Uint8Array,
  ) => Promise<boolean>;
}

export interface AccessIdentityService {
  readonly verify: (
    assertion: unknown,
  ) => Effect.Effect<ProductIdentity, InvalidAccessToken>;
}

export class AccessIdentity extends Context.Service<AccessIdentity, AccessIdentityService>()(
  "Polyphemus/AccessIdentity",
) {}

interface JwksCache {
  readonly expiresAt: number;
  readonly keys: ReadonlyMap<string, AccessJwk>;
}

const invalid = (
  code: InvalidAccessToken["code"],
  message: string,
): InvalidAccessToken => new InvalidAccessToken({ code, message });

const decodeBase64Url = (input: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) throw new Error("Invalid base64url");
  const padded = input.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const decodeJsonPart = (part: string): unknown => {
  const bytes = decodeBase64Url(part);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

const defaultVerifySignature = async (
  jwk: AccessJwk,
  signingInput: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> => {
  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBuffer = new ArrayBuffer(signature.byteLength);
  new Uint8Array(signatureBuffer).set(signature);
  const signingInputBuffer = new ArrayBuffer(signingInput.byteLength);
  new Uint8Array(signingInputBuffer).set(signingInput);
  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    signatureBuffer,
    signingInputBuffer,
  );
};

const cacheTtl = (maxAgeMs: number | undefined): number => {
  if (maxAgeMs === undefined || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return DEFAULT_JWKS_TTL_MS;
  }
  return Math.min(maxAgeMs, MAX_JWKS_TTL_MS);
};

const parseCacheControlMaxAge = (value: string | null): number | undefined => {
  const match = value?.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i);
  if (match === undefined || match === null) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds * 1_000 : undefined;
};

export const fetchAccessJwks = async (issuer: string): Promise<FetchedAccessJwks> => {
  const response = await fetch(`${issuer.replace(/\/$/, "")}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Access JWKS request failed");
  return {
    value: await response.json() as unknown,
    maxAgeMs: parseCacheControlMaxAge(response.headers.get("cache-control")),
  };
};

export const makeAccessIdentity = (
  config: AccessIdentityConfig,
  dependencies: AccessIdentityDependencies = {},
): AccessIdentityService => {
  const now = dependencies.now ?? Date.now;
  const fetchJwks = dependencies.fetchJwks ?? (() => fetchAccessJwks(config.issuer));
  const verifySignature = dependencies.verifySignature ?? defaultVerifySignature;
  let cache: JwksCache | undefined;
  let refresh: Promise<JwksCache> | undefined;
  let lastForcedRefreshAt = Number.NEGATIVE_INFINITY;

  const refreshKeys = (): Promise<JwksCache> => {
    if (refresh !== undefined) return refresh;
    refresh = (async () => {
      const fetched = await fetchJwks();
      const decoded = Schema.decodeUnknownSync(AccessJwksSchema)(fetched.value);
      const keys = new Map<string, AccessJwk>();
      for (const key of decoded.keys) {
        if ((key.alg === undefined || key.alg === "RS256") &&
            (key.use === undefined || key.use === "sig")) {
          keys.set(key.kid, key);
        }
      }
      if (keys.size === 0) throw new Error("Access JWKS has no signing keys");
      const next = {
        expiresAt: now() + cacheTtl(fetched.maxAgeMs),
        keys,
      } satisfies JwksCache;
      cache = next;
      return next;
    })().finally(() => {
      refresh = undefined;
    });
    return refresh;
  };

  const keyFor = async (kid: string): Promise<AccessJwk | undefined> => {
    let current = cache;
    let refreshedCurrentGeneration = false;
    if (current === undefined || current.expiresAt <= now()) {
      current = await refreshKeys();
      refreshedCurrentGeneration = true;
    }
    const cached = current.keys.get(kid);
    if (cached !== undefined) return cached;
    // A cold or expired cache was already fetched for this assertion. Do not
    // amplify this cache generation into another immediate request.
    if (refreshedCurrentGeneration) {
      lastForcedRefreshAt = now();
      return undefined;
    }
    // Coalesce concurrent rotation signals, then bound distinct unknown-kid
    // refreshes within one isolate while still permitting prompt rotation.
    if (refresh !== undefined) return (await refresh).keys.get(kid);
    const forcedAt = now();
    if (forcedAt - lastForcedRefreshAt < FORCED_JWKS_REFRESH_INTERVAL_MS) return undefined;
    lastForcedRefreshAt = forcedAt;
    return (await refreshKeys()).keys.get(kid);
  };

  const verify = (assertion: unknown): Effect.Effect<ProductIdentity, InvalidAccessToken> =>
    Effect.gen(function* () {
      if (typeof assertion !== "string" || assertion.trim().length === 0) {
        return yield* Effect.fail(invalid("missing", "Cloudflare Access authentication is required"));
      }
      if (assertion.length > MAX_ASSERTION_CHARACTERS) {
        return yield* Effect.fail(invalid("malformed", "Cloudflare Access assertion is malformed"));
      }

      const parts = assertion.split(".");
      if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
        return yield* Effect.fail(invalid("malformed", "Cloudflare Access assertion is malformed"));
      }

      const parsed = yield* Effect.try({
        try: () => ({
          header: Schema.decodeUnknownSync(AccessJwtHeaderSchema)(decodeJsonPart(parts[0]!)),
          claims: Schema.decodeUnknownSync(AccessPrincipalClaimsSchema)(decodeJsonPart(parts[1]!)),
          signature: decodeBase64Url(parts[2]!),
        }),
        catch: () => invalid("malformed", "Cloudflare Access assertion is malformed"),
      });

      if (parsed.header.alg !== "RS256") {
        return yield* Effect.fail(invalid(
          "unsupported-algorithm",
          "Cloudflare Access assertion uses an unsupported signing algorithm",
        ));
      }
      if (parsed.claims.iss !== config.issuer) {
        return yield* Effect.fail(invalid("wrong-issuer", "Cloudflare Access assertion has the wrong issuer"));
      }
      if (!audienceContains(parsed.claims.aud, config.audience)) {
        return yield* Effect.fail(invalid("wrong-audience", "Cloudflare Access assertion has the wrong audience"));
      }

      const epochSeconds = Math.floor(now() / 1_000);
      if (!Number.isFinite(parsed.claims.exp) || epochSeconds >= parsed.claims.exp) {
        return yield* Effect.fail(invalid("expired", "Cloudflare Access assertion has expired"));
      }
      if (parsed.claims.nbf !== undefined &&
          (!Number.isFinite(parsed.claims.nbf) || epochSeconds < parsed.claims.nbf)) {
        return yield* Effect.fail(invalid("not-active", "Cloudflare Access assertion is not active"));
      }

      const key = yield* Effect.tryPromise({
        try: () => keyFor(parsed.header.kid),
        catch: () => invalid("jwks-unavailable", "Cloudflare Access signing keys are unavailable"),
      });
      if (key === undefined) {
        return yield* Effect.fail(invalid("unknown-key", "Cloudflare Access assertion uses an unknown signing key"));
      }

      const validSignature = yield* Effect.tryPromise({
        try: () => verifySignature(
          key,
          new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
          parsed.signature,
        ),
        catch: () => invalid("invalid-signature", "Cloudflare Access assertion signature is invalid"),
      });
      if (!validSignature) {
        return yield* Effect.fail(invalid("invalid-signature", "Cloudflare Access assertion signature is invalid"));
      }

      return yield* identityFromVerifiedAccessClaims(parsed.claims as AccessPrincipalClaims);
    });

  return AccessIdentity.of({ verify });
};

const services = new Map<string, AccessIdentityService>();

/** Isolate-local verifier cache; each verifier owns its rotating JWKS cache. */
export const accessIdentityFor = (config: AccessIdentityConfig): AccessIdentityService => {
  const key = `${config.issuer}\u0000${config.audience}`;
  const existing = services.get(key);
  if (existing !== undefined) return existing;
  const service = makeAccessIdentity(config);
  services.set(key, service);
  return service;
};
