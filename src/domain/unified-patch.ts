import * as Schema from "effect/Schema";

const MAX_PATCH_CHARACTERS = 2_000_000;
const MAX_PATCH_FILES = 200;
const MAX_PATH_CHARACTERS = 1_024;

export class UnsupportedValidatedPatch extends Schema.TaggedErrorClass<UnsupportedValidatedPatch>()(
  "UnsupportedValidatedPatch",
  { message: Schema.String },
) {}

export interface UnifiedPatchHunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly string[];
}

export interface UnifiedPatchFile {
  readonly oldPath: string | null;
  readonly newPath: string | null;
  readonly oldMode: string | null;
  readonly newMode: string | null;
  readonly hunks: readonly UnifiedPatchHunk[];
}

const unsupported = (message: string): never => {
  throw new UnsupportedValidatedPatch({ message });
};

const decodeQuotedGitPath = (input: string): string => {
  if (!input.startsWith('"') || !input.endsWith('"')) return input;
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let index = 1; index < input.length - 1; index += 1) {
    const character = input[index]!;
    if (character !== "\\") {
      bytes.push(...encoder.encode(character));
      continue;
    }
    index += 1;
    if (index >= input.length - 1) return unsupported("Patch contains an invalid quoted path");
    const escaped = input[index]!;
    const simple: Record<string, string> = {
      "\\": "\\",
      '"': '"',
      a: "\u0007",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\u000b",
    };
    if (escaped in simple) {
      bytes.push(...encoder.encode(simple[escaped]!));
      continue;
    }
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && index + 1 < input.length - 1 && /[0-7]/.test(input[index + 1]!)) {
        octal += input[++index]!;
      }
      bytes.push(Number.parseInt(octal, 8));
      continue;
    }
    return unsupported("Patch contains an unsupported quoted-path escape");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return unsupported("Patch path is not valid UTF-8");
  }
};

const decodeMarkerPath = (raw: string, prefix: "a/" | "b/"): string | null => {
  if (raw === "/dev/null") return null;
  const decoded = decodeQuotedGitPath(raw);
  if (!decoded.startsWith(prefix)) return unsupported("Patch file marker is invalid");
  return decoded.slice(prefix.length);
};

const validatePath = (path: string | null): void => {
  if (path === null) return;
  if (path.length === 0 || path.length > MAX_PATH_CHARACTERS || path.startsWith("/") || path.includes("\0")) {
    return unsupported("Patch contains an invalid repository path");
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
      segments.some((segment) => segment.toLowerCase() === ".git")) {
    return unsupported("Patch contains an unsafe repository path");
  }
};

const modeFrom = (lines: readonly string[], prefix: string): string | null => {
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line === undefined ? null : line.slice(prefix.length).trim();
};

const parseHunks = (lines: readonly string[]): readonly UnifiedPatchHunk[] => {
  const hunks: UnifiedPatchHunk[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index]!;
    if (!header.startsWith("@@ ")) continue;
    const match = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/);
    if (match === null) return unsupported("Patch contains an invalid hunk header");
    const oldStart = Number(match[1]);
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const newStart = Number(match[3]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);
    const hunkLines: string[] = [];
    let consumedOld = 0;
    let consumedNew = 0;
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (line.startsWith("@@ ")) {
        index -= 1;
        break;
      }
      if (line === "" && index === lines.length - 1) break;
      const prefix = line[0];
      if (prefix !== " " && prefix !== "+" && prefix !== "-" && prefix !== "\\") {
        return unsupported("Patch hunk contains an invalid line");
      }
      if (prefix === "\\" && line !== "\\ No newline at end of file") {
        return unsupported("Patch hunk contains an unsupported marker");
      }
      if (prefix === " " || prefix === "-") consumedOld += 1;
      if (prefix === " " || prefix === "+") consumedNew += 1;
      hunkLines.push(line);
      if (consumedOld === oldCount && consumedNew === newCount) {
        if (lines[index + 1] === "\\ No newline at end of file") {
          hunkLines.push(lines[++index]!);
        }
        break;
      }
      if (consumedOld > oldCount || consumedNew > newCount) {
        return unsupported("Patch hunk line counts are inconsistent");
      }
    }
    if (consumedOld !== oldCount || consumedNew !== newCount) {
      return unsupported("Patch hunk is incomplete");
    }
    hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
  }
  return hunks;
};

const parseSection = (lines: readonly string[]): UnifiedPatchFile => {
  if (lines.some((line) => line === "GIT binary patch" || line.startsWith("Binary files "))) {
    return unsupported("Binary Patches are not supported by the initial publisher");
  }
  if (lines.some((line) => line.startsWith("copy from ") || line.startsWith("copy to "))) {
    return unsupported("Copied files are not supported by the initial publisher");
  }

  const oldMarker = lines.find((line) => line.startsWith("--- "));
  const newMarker = lines.find((line) => line.startsWith("+++ "));
  const renameFrom = lines.find((line) => line.startsWith("rename from "));
  const renameTo = lines.find((line) => line.startsWith("rename to "));

  let oldPath = oldMarker === undefined
    ? renameFrom === undefined ? null : decodeQuotedGitPath(renameFrom.slice("rename from ".length))
    : decodeMarkerPath(oldMarker.slice(4), "a/");
  let newPath = newMarker === undefined
    ? renameTo === undefined ? null : decodeQuotedGitPath(renameTo.slice("rename to ".length))
    : decodeMarkerPath(newMarker.slice(4), "b/");

  // Empty-file additions/deletions and pure mode changes have no ---/+++
  // markers; recover their paths from the quoted-aware diff header.
  if (oldPath === null && newPath === null) {
    const header = lines[0] ?? "";
    const match = header.match(/^diff --git ("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|\S+)$/);
    if (match === null) return unsupported("Patch contains an invalid file header");
    const headerOldPath = decodeMarkerPath(match[1]!, "a/");
    const headerNewPath = decodeMarkerPath(match[2]!, "b/");
    if (lines.some((line) => line.startsWith("new file mode "))) {
      oldPath = null;
      newPath = headerNewPath;
    } else if (lines.some((line) => line.startsWith("deleted file mode "))) {
      oldPath = headerOldPath;
      newPath = null;
    } else {
      oldPath = headerOldPath;
      newPath = headerNewPath;
    }
  }

  validatePath(oldPath);
  validatePath(newPath);
  if (oldPath === null && newPath === null) return unsupported("Patch file has no path");

  const oldMode = modeFrom(lines, "old mode ") ??
    modeFrom(lines, "deleted file mode ") ??
    (lines.find((line) => line.startsWith("index "))?.match(/ (\d{6})$/)?.[1] ?? null);
  const newMode = modeFrom(lines, "new mode ") ??
    modeFrom(lines, "new file mode ") ??
    (lines.find((line) => line.startsWith("index "))?.match(/ (\d{6})$/)?.[1] ?? null);
  for (const mode of [oldMode, newMode]) {
    if (mode !== null && !/^(100644|100755|120000|160000)$/.test(mode)) {
      return unsupported("Patch contains an unsupported Git file mode");
    }
    if (mode === "160000") return unsupported("Git submodule Patches are not supported");
  }

  const hunks = parseHunks(lines);
  if (hunks.length === 0 && oldPath === newPath && oldMode === newMode) {
    return unsupported("Patch file section contains no material change");
  }
  return { oldPath, newPath, oldMode, newMode, hunks };
};

export const parseUnifiedPatch = (patch: string): readonly UnifiedPatchFile[] => {
  if (patch.trim().length === 0) return unsupported("Validated Patch is empty");
  if (patch.length > MAX_PATCH_CHARACTERS) return unsupported("Validated Patch exceeds the publication size limit");
  const lines = patch.split("\n");
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]!.startsWith("diff --git ")) starts.push(index);
  }
  if (starts.length === 0) return unsupported("Validated Patch has no Git file sections");
  if (starts.length > MAX_PATCH_FILES) return unsupported("Validated Patch changes too many files");
  if (lines.slice(0, starts[0]).some((line) => line.trim().length > 0)) {
    return unsupported("Validated Patch contains an unsupported preamble");
  }
  const files = starts.map((start, index) =>
    parseSection(lines.slice(start, starts[index + 1] ?? lines.length)));
  const touchedPaths = new Set<string>();
  for (const file of files) {
    const sectionPaths = new Set(
      [file.oldPath, file.newPath].filter((path): path is string => path !== null),
    );
    for (const path of sectionPaths) {
      if (touchedPaths.has(path)) {
        return unsupported("Validated Patch changes one path more than once");
      }
      touchedPaths.add(path);
    }
  }
  return files;
};

const splitText = (value: string): readonly string[] => {
  if (value.length === 0) return [];
  const lines = value.split("\n");
  if (value.endsWith("\n")) lines.pop();
  return lines;
};

export const applyTextFilePatch = (
  base: string,
  file: UnifiedPatchFile,
): string => {
  if (file.hunks.length === 0) return base;
  const source = splitText(base);
  const output: string[] = [];
  let sourceIndex = 0;
  let outputHasNoFinalNewline = false;

  for (const hunk of file.hunks) {
    const hunkIndex = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
    if (hunkIndex < sourceIndex || hunkIndex > source.length) {
      return unsupported("Patch hunk does not apply to its recorded base");
    }
    output.push(...source.slice(sourceIndex, hunkIndex));
    sourceIndex = hunkIndex;
    let previousPrefix = "";
    for (const line of hunk.lines) {
      const prefix = line[0]!;
      if (prefix === "\\") {
        if (previousPrefix === "+" || previousPrefix === " ") outputHasNoFinalNewline = true;
        continue;
      }
      const content = line.slice(1);
      if (prefix === " " || prefix === "-") {
        if (source[sourceIndex] !== content) {
          return unsupported("Patch context does not match its recorded base");
        }
        if (prefix === " ") output.push(content);
        sourceIndex += 1;
      } else if (prefix === "+") {
        output.push(content);
      }
      previousPrefix = prefix;
    }
  }
  output.push(...source.slice(sourceIndex));
  if (output.length === 0) return "";
  return `${output.join("\n")}${outputHasNoFinalNewline ? "" : "\n"}`;
};

export const validatePatchChangedFiles = (
  files: readonly UnifiedPatchFile[],
  changedFiles: readonly string[],
): void => {
  const paths = new Set(files.flatMap((file) =>
    [file.oldPath, file.newPath].filter((path): path is string => path !== null)));
  if (changedFiles.length === 0 || changedFiles.some((path) => !paths.has(path))) {
    return unsupported("Patch file list does not match the persisted Run Result");
  }
  for (const file of files) {
    if (!changedFiles.includes(file.newPath ?? file.oldPath!)) {
      return unsupported("Patch contains a file absent from the persisted Run Result");
    }
  }
};
