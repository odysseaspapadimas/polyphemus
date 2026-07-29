import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { decodeAccessIdentity, InvalidProductIdentity } from "../src/domain/product-identity.ts";

describe("product identity", () => {
  test("normalizes a Cloudflare Access email", async () => {
    const identity = await Effect.runPromise(decodeAccessIdentity("  Developer@Example.com "));
    expect(identity.userId).toBe("developer@example.com");
  });

  test("rejects missing and malformed identities", async () => {
    for (const input of [undefined, "not-an-email"]) {
      const exit = await Effect.runPromiseExit(decodeAccessIdentity(input));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(String(exit.cause)).toContain(InvalidProductIdentity.name);
      }
    }
  });
});
