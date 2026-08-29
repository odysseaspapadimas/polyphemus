import { createPrivateKey, createSign } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { RepositoryPublicationFailed } from "./RepositoryPublisher.ts";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const NumericIdentifier = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,19}$/));
const GitHubLogin = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/));

const GitHubAppConfigurationSchema = Schema.Struct({
  appId: NumericIdentifier,
  installationId: NumericIdentifier,
  privateKey: RequiredText,
  publisherLogin: GitHubLogin,
});

const InstallationTokenResponseSchema = Schema.Struct({
  token: RequiredText,
  expires_at: RequiredText,
});

export interface GitHubAppConfiguration {
  readonly appId: string;
  readonly installationId: string;
  readonly privateKey: Redacted.Redacted<string>;
  readonly publisherLogin: string;
}

const credentialFailure = (
  operation: string,
  message: string,
  retryable: boolean,
): RepositoryPublicationFailed => new RepositoryPublicationFailed({
  code: retryable ? "GitHubUnavailable" : "PublicationFailed",
  operation,
  message,
  retryable,
});

export const decodeGitHubAppConfiguration = (input: {
  readonly appId: unknown;
  readonly installationId: unknown;
  readonly privateKey: Redacted.Redacted<string>;
  readonly publisherLogin: unknown;
}): Effect.Effect<GitHubAppConfiguration, RepositoryPublicationFailed> =>
  Schema.decodeUnknownEffect(GitHubAppConfigurationSchema)({
    appId: input.appId,
    installationId: input.installationId,
    privateKey: Redacted.value(input.privateKey).replaceAll("\\n", "\n"),
    publisherLogin: input.publisherLogin,
  }).pipe(
    Effect.map((value) => ({
      appId: value.appId,
      installationId: value.installationId,
      privateKey: Redacted.make(value.privateKey),
      publisherLogin: value.publisherLogin,
    })),
    Effect.mapError(() => credentialFailure(
      "configure-github-app",
      "GitHub App publication credentials are invalid",
      false,
    )),
  );

const base64Url = (value: string | Uint8Array): string =>
  Buffer.from(value).toString("base64url");

const createAppJwt = (
  configuration: GitHubAppConfiguration,
  nowMs: number,
): Effect.Effect<string, RepositoryPublicationFailed> => Effect.try({
  try: () => {
    const nowSeconds = Math.floor(nowMs / 1_000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    // Backdate issuance to tolerate small clock skew; GitHub caps App JWTs at ten minutes.
    const payload = base64Url(JSON.stringify({
      iat: nowSeconds - 30,
      exp: nowSeconds + 540,
      iss: configuration.appId,
    }));
    const signingInput = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    const key = createPrivateKey(Redacted.value(configuration.privateKey));
    return `${signingInput}.${base64Url(signer.sign(key))}`;
  },
  catch: () => credentialFailure(
    "sign-github-app-jwt",
    "GitHub App publication credentials could not be used",
    false,
  ),
});

/** Issues a short-lived installation token without exposing either credential in failures. */
export const issueGitHubAppInstallationToken = (
  configuration: GitHubAppConfiguration,
  fetchImplementation: typeof fetch = fetch,
  now: () => number = Date.now,
): Effect.Effect<Redacted.Redacted<string>, RepositoryPublicationFailed> => Effect.gen(function* () {
  const jwt = yield* createAppJwt(configuration, now());
  const response = yield* Effect.tryPromise({
    try: () => fetchImplementation(
      `https://api.github.com/app/installations/${configuration.installationId}/access_tokens`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "User-Agent": "polyphemus-repository-agent",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    ),
    catch: () => credentialFailure(
      "issue-github-installation-token",
      "Could not reach GitHub to authorize publication",
      true,
    ),
  });
  if (!response.ok) {
    return yield* Effect.fail(credentialFailure(
      "issue-github-installation-token",
      response.status >= 500 || response.status === 429
        ? "GitHub is temporarily unavailable for publication authorization"
        : "GitHub App installation is not authorized for publication",
      response.status >= 500 || response.status === 429,
    ));
  }
  const unknownToken = yield* Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: () => credentialFailure(
      "issue-github-installation-token",
      "GitHub returned invalid publication authorization",
      true,
    ),
  });
  const token = yield* Schema.decodeUnknownEffect(InstallationTokenResponseSchema)(unknownToken).pipe(
    Effect.mapError(() => credentialFailure(
      "issue-github-installation-token",
      "GitHub returned invalid publication authorization",
      true,
    )),
  );
  const expiry = Date.parse(token.expires_at);
  if (!Number.isFinite(expiry) || expiry <= now() + 60_000) {
    return yield* Effect.fail(credentialFailure(
      "issue-github-installation-token",
      "GitHub returned expired publication authorization",
      true,
    ));
  }
  return Redacted.make(token.token);
});
