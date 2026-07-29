#define _GNU_SOURCE

#include <errno.h>
#include <grp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define REPOSITORY_UID 10001
#define REPOSITORY_GID 20000
#define EVIDENCE_INDEX_PATH "/workspace/git-evidence/index"
#define EVIDENCE_OBJECTS_PATH "/workspace/git-evidence/objects"
#define TRUSTED_OBJECTS_PATH "/workspace/git-metadata/objects"
#define SAFE_YARN_RC_FILENAME ".polyphemus-yarnrc.yml"

static void fail(const char *operation) {
  fprintf(stderr, "polyphemus-repository-exec: %s: %s\n", operation, strerror(errno));
  _exit(126);
}

static void set_fixed_environment(
  int preserve_yarn_ignore_path,
  int preserve_yarn_script_shell,
  int preserve_yarn_rc_filename,
  int preserve_evidence_git,
  int package_script_path
) {
  if (clearenv() != 0) fail("clearenv");
  const char *path = package_script_path
    ? "/workspace/repository/node_modules/.bin:/usr/local/bin:/usr/bin:/bin"
    : "/usr/local/bin:/usr/bin:/bin";
  if (setenv("PATH", path, 1) != 0 ||
      setenv("HOME", "/home/polyphemus-repository", 1) != 0 ||
      setenv("XDG_CACHE_HOME", "/home/polyphemus-repository/.cache", 1) != 0 ||
      setenv("COREPACK_HOME", "/var/lib/polyphemus-corepack", 1) != 0 ||
      setenv("COREPACK_ENABLE_DOWNLOAD_PROMPT", "0", 1) != 0 ||
      setenv("COREPACK_ENABLE_PROJECT_SPEC", "0", 1) != 0 ||
      setenv("npm_config_ignore_scripts", "true", 1) != 0 ||
      setenv("npm_config_node_options", "", 1) != 0 ||
      setenv("npm_config_script_shell", "/bin/sh", 1) != 0 ||
      setenv("npm_config_shell", "/bin/sh", 1) != 0 ||
      setenv("npm_config_userconfig", "/dev/null", 1) != 0 ||
      setenv("YARN_ENABLE_SCRIPTS", "false", 1) != 0 ||
      setenv("YARN_ENABLE_TELEMETRY", "0", 1) != 0 ||
      setenv("GIT_CONFIG_NOSYSTEM", "1", 1) != 0 ||
      setenv("GIT_CONFIG_GLOBAL", "/dev/null", 1) != 0 ||
      setenv("GIT_OPTIONAL_LOCKS", "0", 1) != 0 ||
      setenv("GIT_CONFIG_COUNT", "1", 1) != 0 ||
      setenv("GIT_CONFIG_KEY_0", "safe.directory", 1) != 0 ||
      setenv("GIT_CONFIG_VALUE_0", "/workspace/repository", 1) != 0 ||
      setenv("TMPDIR", "/tmp", 1) != 0 ||
      setenv("CI", "1", 1) != 0 ||
      setenv("NO_COLOR", "1", 1) != 0 ||
      setenv("TERM", "dumb", 1) != 0 ||
      setenv("SHELL", "/bin/sh", 1) != 0 ||
      setenv("USER", "polyphemus-repository", 1) != 0 ||
      setenv("LOGNAME", "polyphemus-repository", 1) != 0) {
    fail("setenv");
  }
  if (preserve_yarn_ignore_path && setenv("YARN_IGNORE_PATH", "1", 1) != 0) {
    fail("setenv YARN_IGNORE_PATH");
  }
  if (preserve_yarn_script_shell && setenv("YARN_SCRIPT_SHELL", "/bin/sh", 1) != 0) {
    fail("setenv YARN_SCRIPT_SHELL");
  }
  if (preserve_yarn_rc_filename &&
      setenv("YARN_RC_FILENAME", SAFE_YARN_RC_FILENAME, 1) != 0) {
    fail("setenv YARN_RC_FILENAME");
  }
  if (preserve_evidence_git &&
      (setenv("GIT_INDEX_FILE", EVIDENCE_INDEX_PATH, 1) != 0 ||
       setenv("GIT_OBJECT_DIRECTORY", EVIDENCE_OBJECTS_PATH, 1) != 0 ||
       setenv("GIT_ALTERNATE_OBJECT_DIRECTORIES", TRUSTED_OBJECTS_PATH, 1) != 0)) {
    fail("setenv Git evidence environment");
  }
}

int main(int argc, char **argv) {
  if (argc < 2) {
    fputs("usage: polyphemus-repository-exec PROGRAM [ARG ...]\n", stderr);
    return 64;
  }

  const char *yarn_ignore_path = getenv("YARN_IGNORE_PATH");
  const int preserve_yarn_ignore_path =
    yarn_ignore_path != NULL && strcmp(yarn_ignore_path, "1") == 0;
  const char *yarn_script_shell = getenv("YARN_SCRIPT_SHELL");
  const int preserve_yarn_script_shell =
    yarn_script_shell != NULL && strcmp(yarn_script_shell, "/bin/sh") == 0;
  const char *yarn_rc_filename = getenv("YARN_RC_FILENAME");
  const int preserve_yarn_rc_filename =
    yarn_rc_filename != NULL && strcmp(yarn_rc_filename, SAFE_YARN_RC_FILENAME) == 0;
  const char *git_index_file = getenv("GIT_INDEX_FILE");
  const char *git_object_directory = getenv("GIT_OBJECT_DIRECTORY");
  const char *git_alternate_object_directories = getenv("GIT_ALTERNATE_OBJECT_DIRECTORIES");
  const int preserve_evidence_git =
    git_index_file != NULL && strcmp(git_index_file, EVIDENCE_INDEX_PATH) == 0 &&
    git_object_directory != NULL && strcmp(git_object_directory, EVIDENCE_OBJECTS_PATH) == 0 &&
    git_alternate_object_directories != NULL &&
      strcmp(git_alternate_object_directories, TRUSTED_OBJECTS_PATH) == 0;

  if (setgroups(0, NULL) != 0) fail("setgroups");
  if (setresgid(REPOSITORY_GID, REPOSITORY_GID, REPOSITORY_GID) != 0) fail("setresgid");
  if (setresuid(REPOSITORY_UID, REPOSITORY_UID, REPOSITORY_UID) != 0) fail("setresuid");
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) fail("prctl");

  umask(0002);
  const int package_script_path = strcmp(argv[1], "/bin/sh") == 0;
  set_fixed_environment(
    preserve_yarn_ignore_path,
    preserve_yarn_script_shell,
    preserve_yarn_rc_filename,
    preserve_evidence_git,
    package_script_path
  );
  long descriptor_limit = sysconf(_SC_OPEN_MAX);
  if (descriptor_limit < 0 || descriptor_limit > 65536) descriptor_limit = 65536;
  for (int descriptor = 3; descriptor < descriptor_limit; descriptor++) close(descriptor);
  execvp(argv[1], &argv[1]);
  fail("execvp");
  return 126;
}
