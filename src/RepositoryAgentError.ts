import * as Schema from "effect/Schema";

export class RepositoryAgentBackendFailed extends Schema.TaggedErrorClass<RepositoryAgentBackendFailed>()(
  "RepositoryAgentBackendFailed",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
