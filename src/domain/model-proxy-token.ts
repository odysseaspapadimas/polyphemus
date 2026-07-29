import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const TOKEN_LIFETIME_MS = 12 * 60_000;

export const ModelProxyGrantSchema = Schema.Struct({
  version: Schema.Literal(1),
  sandboxId: RequiredText,
  expiresAt: Schema.Number,
});
export type ModelProxyGrant = typeof ModelProxyGrantSchema.Type;

export class InvalidModelProxyToken extends Schema.TaggedErrorClass<InvalidModelProxyToken>()(
  "InvalidModelProxyToken",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

const encoder = new TextEncoder();
const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const fromBase64Url = (value: string): Uint8Array => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const importKey = (secret: string) => crypto.subtle.importKey(
  "raw",
  encoder.encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

export const issueModelProxyToken = (
  secret: string,
  sandboxId: string,
  issuedAt = Date.now(),
): Effect.Effect<string, InvalidModelProxyToken> => Effect.tryPromise({
  try: async () => {
    const grant: ModelProxyGrant = {
      version: 1,
      sandboxId,
      expiresAt: issuedAt + TOKEN_LIFETIME_MS,
    };
    const payload = toBase64Url(encoder.encode(JSON.stringify(grant)));
    const signature = await crypto.subtle.sign(
      "HMAC",
      await importKey(secret),
      encoder.encode(payload),
    );
    return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
  },
  catch: (cause) => new InvalidModelProxyToken({
    message: "Could not issue the scoped model proxy token",
    cause,
  }),
});

export const verifyModelProxyToken = (
  secret: string,
  token: string,
  now = Date.now(),
): Effect.Effect<ModelProxyGrant, InvalidModelProxyToken> => Effect.gen(function* () {
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length > 0) {
    return yield* Effect.fail(new InvalidModelProxyToken({ message: "Model proxy token is malformed" }));
  }
  const valid = yield* Effect.tryPromise({
    try: async () => crypto.subtle.verify(
      "HMAC",
      await importKey(secret),
      fromBase64Url(signature).buffer as ArrayBuffer,
      encoder.encode(payload),
    ),
    catch: (cause) => new InvalidModelProxyToken({
      message: "Model proxy token signature is malformed",
      cause,
    }),
  });
  if (!valid) {
    return yield* Effect.fail(new InvalidModelProxyToken({ message: "Model proxy token is invalid" }));
  }
  const unknownGrant = yield* Effect.try({
    try: () => JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as unknown,
    catch: (cause) => new InvalidModelProxyToken({
      message: "Model proxy token payload is malformed",
      cause,
    }),
  });
  const grant = yield* Schema.decodeUnknownEffect(ModelProxyGrantSchema)(unknownGrant).pipe(
    Effect.mapError((cause) => new InvalidModelProxyToken({
      message: "Model proxy token payload is invalid",
      cause,
    })),
  );
  if (grant.expiresAt <= now || grant.expiresAt > now + TOKEN_LIFETIME_MS) {
    return yield* Effect.fail(new InvalidModelProxyToken({ message: "Model proxy token has expired" }));
  }
  return grant;
});
