import * as Cloudflare from "alchemy/Cloudflare";

export const RunArtifactsBucket = Cloudflare.R2.Bucket(
  "RunArtifactsBucket",
  { name: "polyphemus-run-artifacts" },
);
