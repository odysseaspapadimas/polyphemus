import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

const safeArgument = Type.String({
  minLength: 1,
  maxLength: 16_384,
  pattern: "^[^\\u0000]+$",
});
const safeDisplay = Type.String({
  minLength: 1,
  maxLength: 65_536,
  pattern: "^[^\\u0000\\r\\n]+$",
});

export const ValidationCheckNameSchema = Type.Union([
  Type.Literal("tests"),
  Type.Literal("typecheck"),
  Type.Literal("lint"),
]);
export type ValidationCheckName = Static<typeof ValidationCheckNameSchema>;

const ValidationEnvironmentSchema = Type.Object({}, { additionalProperties: false });

const ValidationCommandSchema = Type.Object({
  display: safeDisplay,
  program: Type.Literal("/bin/sh"),
  args: Type.Array(safeArgument, { minItems: 2, maxItems: 2 }),
  environment: ValidationEnvironmentSchema,
}, { additionalProperties: false });
export type ValidationCommand = Static<typeof ValidationCommandSchema>;

const ValidationPackageScriptSchema = Type.Union([
  Type.Literal("test"),
  Type.Literal("typecheck"),
  Type.Literal("lint"),
]);

const ValidationCheckSchema = Type.Object({
  name: ValidationCheckNameSchema,
  packageScript: ValidationPackageScriptSchema,
  expectedScript: Type.String({ maxLength: 16_384 }),
  command: ValidationCommandSchema,
}, { additionalProperties: false });

export const ValidationCommandsSchema = Type.Object({
  version: Type.Literal(1),
  checks: Type.Array(ValidationCheckSchema, { maxItems: 3 }),
}, { additionalProperties: false });
export type ValidationCommands = Static<typeof ValidationCommandsSchema>;

export const BoundedOperationSchema = Type.Union([
  ValidationCheckNameSchema,
  Type.Literal("git-status"),
  Type.Literal("git-diff"),
  Type.Literal("git-diff-check"),
]);
export type BoundedOperation = Static<typeof BoundedOperationSchema>;

export interface BoundedExecutable {
  readonly display: string;
  readonly program: "/bin/sh" | "git";
  readonly args: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
}

const SAFE_GIT_ARGS = [
  "--git-dir=/workspace/git-metadata",
  "--work-tree=/workspace/repository",
  "--no-replace-objects",
  "-c", "safe.directory=/workspace/repository",
  "-c", "core.hooksPath=/dev/null",
  "-c", "core.fsmonitor=false",
  "-c", "core.pager=cat",
  "-c", "diff.external=",
] as const;

const packageScriptForCheck = (name: ValidationCheckName): "test" | "typecheck" | "lint" =>
  name === "tests" ? "test" : name;

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const canonicalDisplay = (expectedScript: string): string =>
  `/bin/sh -c ${JSON.stringify(expectedScript)}`;

const substantivePackageScript = (script: string): boolean => {
  const normalized = script.trim().replace(/;+$/, "").trim().toLowerCase();
  return normalized.length > 0 &&
    !/^(?::|true|exit\s+0|(?:echo|printf)(?:\s+.*)?)$/.test(normalized) &&
    !/^node\s+(?:--eval|-e)\s+["']?(?:process\.)?exit\(0\);?["']?$/.test(normalized);
};

const commandMatchesCheck = (
  expectedScript: string,
  command: ValidationCommand,
): boolean => command.program === "/bin/sh" &&
  arraysEqual(command.args, ["-c", expectedScript]) &&
  Object.keys(command.environment).length === 0 &&
  command.display === canonicalDisplay(expectedScript);

export const decodeValidationCommands = (input: string | undefined): ValidationCommands => {
  if (input === undefined || input.trim().length === 0) {
    throw new Error("POLYPHEMUS_VALIDATION_COMMANDS is required");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    throw new Error("POLYPHEMUS_VALIDATION_COMMANDS must be valid JSON");
  }
  if (!Value.Check(ValidationCommandsSchema, parsed)) {
    throw new Error("POLYPHEMUS_VALIDATION_COMMANDS has an invalid shape");
  }
  const names = new Set(parsed.checks.map((check) => check.name));
  if (names.size !== parsed.checks.length ||
      !parsed.checks.every((check) =>
        check.packageScript === packageScriptForCheck(check.name) &&
        substantivePackageScript(check.expectedScript) &&
        commandMatchesCheck(check.expectedScript, check.command))) {
    throw new Error("POLYPHEMUS_VALIDATION_COMMANDS is internally inconsistent");
  }
  return parsed;
};

export const resolveBoundedOperation = (
  policy: ValidationCommands,
  operation: BoundedOperation,
): BoundedExecutable => {
  if (operation === "git-status") {
    return {
      display: "git status --short",
      program: "git",
      args: [...SAFE_GIT_ARGS, "status", "--short"],
      environment: {},
    };
  }
  if (operation === "git-diff") {
    return {
      display: "git diff --no-ext-diff --",
      program: "git",
      args: [...SAFE_GIT_ARGS, "diff", "--no-ext-diff", "--no-textconv", "--"],
      environment: {},
    };
  }
  if (operation === "git-diff-check") {
    return {
      display: "git diff --check",
      program: "git",
      args: [...SAFE_GIT_ARGS, "diff", "--no-ext-diff", "--no-textconv", "--check"],
      environment: {},
    };
  }

  const check = policy.checks.find((candidate) => candidate.name === operation);
  if (check === undefined) throw new Error(`Validation check is unavailable: ${operation}`);
  return {
    display: check.command.display,
    program: check.command.program,
    args: [...check.command.args],
    environment: { ...check.command.environment },
  };
};
