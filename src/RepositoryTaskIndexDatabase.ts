import * as Cloudflare from "alchemy/Cloudflare";

export const RepositoryTaskIndexDatabase = Cloudflare.D1.Database(
  "RepositoryTaskIndexDatabase",
  {
    name: "polyphemus-repository-task-index",
    migrationsDir: "./migrations/d1",
  },
);
