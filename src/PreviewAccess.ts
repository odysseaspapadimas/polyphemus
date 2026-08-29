import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const Hostname = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9.-]+$/));
const OrganizationName = Schema.Trim.check(Schema.isMinLength(1));

const decodeHostname = (value: string, name: string) => Schema.decodeUnknownEffect(Hostname)(value).pipe(
  Effect.mapError(() => new Error(`${name} must be a hostname`)),
);

/** Email OTP provides sign-up/sign-in; product authorization remains in the application. */
export const PreviewAccess = Effect.gen(function* () {
  const configured = yield* Effect.all({
    applicationDomain: Config.string("POLYPHEMUS_ACCESS_DOMAIN").pipe(
      Config.withDefault("polyphemus.odysseas-patra.workers.dev"),
    ),
    authDomain: Config.string("POLYPHEMUS_ACCESS_AUTH_DOMAIN").pipe(
      Config.withDefault("odysseas-dev.cloudflareaccess.com"),
    ),
    organizationName: Config.string("POLYPHEMUS_ACCESS_ORGANIZATION").pipe(
      Config.withDefault("odysseas-dev"),
    ),
  });
  const applicationDomain = yield* decodeHostname(
    configured.applicationDomain,
    "POLYPHEMUS_ACCESS_DOMAIN",
  ).pipe(Effect.orDie);
  const authDomain = yield* decodeHostname(
    configured.authDomain,
    "POLYPHEMUS_ACCESS_AUTH_DOMAIN",
  ).pipe(Effect.orDie);
  const organizationName = yield* Schema.decodeUnknownEffect(OrganizationName)(
    configured.organizationName,
  ).pipe(Effect.orDie);
  const issuer = `https://${authDomain}`;

  yield* Cloudflare.Access.Organization("PreviewAccessOrganization", {
    authDomain,
    name: organizationName,
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
    name: "Polyphemus authenticated users",
    decision: "allow",
    include: [{ everyone: {} }],
    sessionDuration: "24h",
  });

  const application = yield* Cloudflare.Access.Application("PreviewAccessApplication", {
    type: "self_hosted",
    name: "Polyphemus",
    domain: applicationDomain,
    sessionDuration: "24h",
    allowedIdps: [oneTimePin.identityProviderId],
    autoRedirectToIdentity: true,
    policies: [policy.policyId],
  });
  return { ...application, issuer };
});
