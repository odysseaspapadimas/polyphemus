import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ProductIdentitySchema = Schema.Struct({
  userId: RequiredText,
});
export type ProductIdentity = typeof ProductIdentitySchema.Type;

export class InvalidProductIdentity extends Schema.TaggedErrorClass<InvalidProductIdentity>()(
  "InvalidProductIdentity",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

export const decodeAccessIdentity = (
  input: unknown,
): Effect.Effect<ProductIdentity, InvalidProductIdentity> => Effect.gen(function* () {
  const decoded = yield* Schema.decodeUnknownEffect(ProductIdentitySchema)({
    userId: input,
  }).pipe(
    Effect.mapError((cause) => new InvalidProductIdentity({
      message: "Cloudflare Access identity is required",
      cause,
    })),
  );
  const userId = decoded.userId.toLowerCase();
  if (!EMAIL.test(userId)) {
    return yield* Effect.fail(new InvalidProductIdentity({
      message: "Cloudflare Access returned an invalid user identity",
    }));
  }
  return { userId };
});
