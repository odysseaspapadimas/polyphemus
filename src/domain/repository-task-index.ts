import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));

export const RepositoryTaskIndexEntrySchema = Schema.Struct({
  taskId: RequiredText,
  ownerId: RequiredText,
  repositoryUrl: RequiredText,
  objective: RequiredText,
  createdAt: RequiredText,
  updatedAt: RequiredText,
});
export type RepositoryTaskIndexEntry = typeof RepositoryTaskIndexEntrySchema.Type;

export const RepositoryTaskIndexEntriesSchema = Schema.Array(RepositoryTaskIndexEntrySchema);

export class RepositoryTaskIndexFailed extends Schema.TaggedErrorClass<RepositoryTaskIndexFailed>()(
  "RepositoryTaskIndexFailed",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  static fromUnknown(operation: string, cause: unknown) {
    return new RepositoryTaskIndexFailed({
      operation,
      message: "Repository Task discovery is temporarily unavailable",
      cause,
    });
  }
}

export const decodeRepositoryTaskIndexEntries = (input: unknown) =>
  Schema.decodeUnknownEffect(RepositoryTaskIndexEntriesSchema)(input).pipe(
    Effect.mapError((cause) => RepositoryTaskIndexFailed.fromUnknown("decode-index", cause)),
  );
