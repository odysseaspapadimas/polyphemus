import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  decodeAccessIdentity,
  InvalidProductIdentity,
  ProductIdentitySchema,
  type ProductIdentity,
} from "./product-identity.ts";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));

export const AccessTokenAudienceSchema = Schema.Union([
  RequiredText,
  Schema.Array(RequiredText),
]);
export type AccessTokenAudience = typeof AccessTokenAudienceSchema.Type;

/** The only Access claims used to construct a Product Identity. */
export const AccessPrincipalClaimsSchema = Schema.Struct({
  iss: RequiredText,
  aud: AccessTokenAudienceSchema,
  exp: Schema.Number,
  nbf: Schema.optional(Schema.Number),
  email: RequiredText,
});
export type AccessPrincipalClaims = typeof AccessPrincipalClaimsSchema.Type;

/** The normalized principal forwarded across the private Worker boundary. */
export const AccessPrincipalSchema = ProductIdentitySchema;
export type AccessPrincipal = ProductIdentity;

export class InvalidAccessToken extends Schema.TaggedErrorClass<InvalidAccessToken>()(
  "InvalidAccessToken",
  {
    code: Schema.Literals([
      "missing",
      "malformed",
      "unsupported-algorithm",
      "unknown-key",
      "invalid-signature",
      "wrong-issuer",
      "wrong-audience",
      "expired",
      "not-active",
      "invalid-email",
      "jwks-unavailable",
    ] as const),
    message: Schema.String,
  },
) {}

export const audienceContains = (
  audience: AccessTokenAudience,
  expectedAudience: string,
): boolean => Array.isArray(audience)
  ? audience.includes(expectedAudience)
  : audience === expectedAudience;

export const identityFromVerifiedAccessClaims = (
  claims: AccessPrincipalClaims,
): Effect.Effect<ProductIdentity, InvalidAccessToken> =>
  decodeAccessIdentity(claims.email).pipe(
    Effect.mapError((_error: InvalidProductIdentity) => new InvalidAccessToken({
      code: "invalid-email",
      message: "Cloudflare Access returned an invalid email claim",
    })),
  );
