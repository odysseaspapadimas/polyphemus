import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const STORAGE_KEY = "run-admission";
const RequiredText = Schema.Trim.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const MAX_RUNS_PER_DAY = 10;
const ACTIVE_LEASE_MS = 45 * 60 * 1_000;

const AdmissionInputSchema = Schema.Struct({
  ownerId: RequiredText,
  runId: RequiredText,
  now: RequiredText,
});

const AdmissionStateSchema = Schema.Struct({
  version: Schema.Literal(1),
  ownerId: RequiredText,
  utcDay: RequiredText,
  startedToday: NonNegativeInteger,
  activeRun: Schema.NullOr(Schema.Struct({
    runId: RequiredText,
    expiresAt: RequiredText,
  })),
});
type AdmissionState = typeof AdmissionStateSchema.Type;

export class RunAdmissionRejected extends Schema.TaggedErrorClass<RunAdmissionRejected>()(
  "RunAdmissionRejected",
  {
    message: Schema.String,
    retryAfterSeconds: Schema.Number,
  },
) {}

export class InvalidRunAdmission extends Schema.TaggedErrorClass<InvalidRunAdmission>()(
  "InvalidRunAdmission",
  { message: Schema.String },
) {}

const decodeInput = (input: unknown) => Schema.decodeUnknownEffect(AdmissionInputSchema)(input).pipe(
  Effect.mapError(() => new InvalidRunAdmission({ message: "Invalid Run admission request" })),
);

const utcDay = (milliseconds: number): string => new Date(milliseconds).toISOString().slice(0, 10);
const secondsUntil = (future: number, now: number): number =>
  Math.max(1, Math.ceil((future - now) / 1_000));

/** Atomic per-owner admission: one active Run and ten starts per UTC day. */
export default class RunAdmissionCoordinator extends Cloudflare.DurableObject<RunAdmissionCoordinator>()(
  "RunAdmissionCoordinator",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
    const read = Effect.fn("RunAdmissionCoordinator.read")(function* () {
      const stored = yield* state.storage.get<unknown>(STORAGE_KEY);
      if (stored === undefined) return null;
      return yield* Schema.decodeUnknownEffect(AdmissionStateSchema)(stored).pipe(
        Effect.mapError(() => new InvalidRunAdmission({ message: "Stored Run admission is invalid" })),
      );
    });

    const acquire = Effect.fn("RunAdmissionCoordinator.acquire")(function* (unknownInput: unknown) {
      const input = yield* decodeInput(unknownInput);
      const now = Date.parse(input.now);
      if (!Number.isFinite(now)) {
        return yield* Effect.fail(new InvalidRunAdmission({ message: "Run admission time is invalid" }));
      }
      const day = utcDay(now);
      const existing = yield* read();
      if (existing?.ownerId !== undefined && existing.ownerId !== input.ownerId) {
        return yield* Effect.fail(new InvalidRunAdmission({ message: "Run admission owner does not match" }));
      }
      const startedToday = existing?.utcDay === day ? existing.startedToday : 0;
      const activeExpiry = existing?.activeRun === null || existing?.activeRun === undefined
        ? 0
        : Date.parse(existing.activeRun.expiresAt);
      if (existing?.activeRun?.runId === input.runId && activeExpiry > now) return { admitted: true as const };
      if (existing?.activeRun !== null && existing?.activeRun !== undefined && activeExpiry > now) {
        return yield* Effect.fail(new RunAdmissionRejected({
          message: "Finish the active Agent Run before starting another one",
          retryAfterSeconds: secondsUntil(activeExpiry, now),
        }));
      }
      if (startedToday >= MAX_RUNS_PER_DAY) {
        const tomorrow = Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1_000;
        return yield* Effect.fail(new RunAdmissionRejected({
          message: "Daily Agent Run limit reached",
          retryAfterSeconds: secondsUntil(tomorrow, now),
        }));
      }
      const next: AdmissionState = {
        version: 1,
        ownerId: input.ownerId,
        utcDay: day,
        startedToday: startedToday + 1,
        activeRun: {
          runId: input.runId,
          expiresAt: new Date(now + ACTIVE_LEASE_MS).toISOString(),
        },
      };
      yield* state.storage.put(STORAGE_KEY, next);
      return { admitted: true as const };
    });

    const release = Effect.fn("RunAdmissionCoordinator.release")(function* (unknownInput: unknown) {
      const input = yield* decodeInput(unknownInput);
      const existing = yield* read();
      if (existing === null || existing.ownerId !== input.ownerId ||
          existing.activeRun?.runId !== input.runId) return { released: false as const };
      yield* state.storage.put(STORAGE_KEY, { ...existing, activeRun: null } satisfies AdmissionState);
      return { released: true as const };
    });

    return { acquire, release };
    });
  }),
) {}
