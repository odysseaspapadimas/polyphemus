import { describe, expect, test } from "bun:test";
import {
  applyTextFilePatch,
  parseUnifiedPatch,
  validatePatchChangedFiles,
} from "../src/domain/unified-patch.ts";

describe("Validated Patch materialization", () => {
  test("applies a textual modification against its recorded base", () => {
    const files = parseUnifiedPatch(`diff --git a/src/value.ts b/src/value.ts
index 1111111..2222222 100644
--- a/src/value.ts
+++ b/src/value.ts
@@ -1,3 +1,3 @@
 one
-two
+second
 three
`);
    expect(files).toHaveLength(1);
    expect(applyTextFilePatch("one\ntwo\nthree\n", files[0]!)).toBe("one\nsecond\nthree\n");
    validatePatchChangedFiles(files, ["src/value.ts"]);
  });

  test("preserves a new file without a final newline", () => {
    const files = parseUnifiedPatch(`diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+hello
\\ No newline at end of file
`);
    expect(files[0]?.oldPath).toBeNull();
    expect(applyTextFilePatch("", files[0]!)).toBe("hello");
  });

  test("represents deletes, empty additions, and rename-only changes exactly", () => {
    const empty = parseUnifiedPatch(`diff --git a/empty.txt b/empty.txt
new file mode 100644
index 0000000..e69de29
`);
    expect(empty[0]).toMatchObject({ oldPath: null, newPath: "empty.txt", hunks: [] });
    expect(applyTextFilePatch("", empty[0]!)).toBe("");

    const deleted = parseUnifiedPatch(`diff --git a/old.txt b/old.txt
deleted file mode 100644
index 1111111..0000000
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-old
`);
    expect(deleted[0]?.newPath).toBeNull();
    expect(applyTextFilePatch("old\n", deleted[0]!)).toBe("");

    const renamed = parseUnifiedPatch(`diff --git a/old-name.txt b/new-name.txt
similarity index 100%
rename from old-name.txt
rename to new-name.txt
`);
    expect(renamed[0]).toMatchObject({ oldPath: "old-name.txt", newPath: "new-name.txt", hunks: [] });
    expect(applyTextFilePatch("same\n", renamed[0]!)).toBe("same\n");
    validatePatchChangedFiles(renamed, ["new-name.txt"]);
  });

  test("fails safely for mismatched base context, binary data, and unsafe paths", () => {
    const text = parseUnifiedPatch(`diff --git a/file.txt b/file.txt
index 1111111..2222222 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old
+new
`);
    expect(() => applyTextFilePatch("different\n", text[0]!)).toThrow();
    expect(() => parseUnifiedPatch(`diff --git a/image.png b/image.png
GIT binary patch
literal 1
A
`)).toThrow();
    expect(() => parseUnifiedPatch(`diff --git a/.git/config b/.git/config
index 1111111..2222222 100644
--- a/.git/config
+++ b/.git/config
@@ -1 +1 @@
-old
+new
`)).toThrow();
    expect(() => parseUnifiedPatch(`diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
diff --git a/old.txt b/old.txt
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/old.txt
@@ -0,0 +1 @@
+replacement
`)).toThrow();
  });
});
