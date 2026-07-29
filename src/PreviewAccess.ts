import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export const PREVIEW_ACCESS_EMAIL = "odysseas.patra@gmail.com";
export const PREVIEW_ACCESS_DOMAIN = "polyphemus.odysseas-patra.workers.dev";
export const PREVIEW_ACCESS_AUTH_DOMAIN = "odysseas-dev.cloudflareaccess.com";

export const PreviewAccess = Effect.gen(function* () {
  yield* Cloudflare.Access.Organization("PreviewAccessOrganization", {
    authDomain: PREVIEW_ACCESS_AUTH_DOMAIN,
    name: "odysseas-dev",
    sessionDuration: "24h",
  });

  const oneTimePin = yield* Cloudflare.Access.IdentityProvider(
    "PreviewOneTimePinIdentityProvider",
    {
      name: "Email one-time PIN",
      type: "onetimepin",
      config: {},
    },
  );

  const policy = yield* Cloudflare.Access.Policy("PreviewAccessPolicy", {
    name: "Polyphemus single-user preview",
    decision: "allow",
    include: [{ email: { email: PREVIEW_ACCESS_EMAIL } }],
    sessionDuration: "24h",
  });

  return yield* Cloudflare.Access.Application("PreviewAccessApplication", {
    type: "self_hosted",
    name: "Polyphemus preview",
    domain: PREVIEW_ACCESS_DOMAIN,
    sessionDuration: "24h",
    allowedIdps: [oneTimePin.identityProviderId],
    autoRedirectToIdentity: true,
    policies: [policy.policyId],
  });
});
