CREATE TABLE IF NOT EXISTS repository_task_index (
  task_id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  objective TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS repository_task_index_owner_recent_idx
  ON repository_task_index (owner_id, updated_at DESC);
