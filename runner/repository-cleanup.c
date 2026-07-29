#define _GNU_SOURCE

#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <grp.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define REPOSITORY_UID 10001
#define MAX_PASSES 64

static void fail(const char *operation) {
  fprintf(stderr, "polyphemus-repository-cleanup: %s: %s\n", operation, strerror(errno));
  _exit(126);
}

static int decimal_name(const char *value) {
  if (*value == '\0') return 0;
  for (const unsigned char *cursor = (const unsigned char *)value; *cursor != '\0'; cursor++) {
    if (!isdigit(*cursor)) return 0;
  }
  return 1;
}

static int repository_process(pid_t pid) {
  char path[64];
  if (snprintf(path, sizeof(path), "/proc/%ld/status", (long)pid) >= (int)sizeof(path)) {
    return 0;
  }
  FILE *status = fopen(path, "re");
  if (status == NULL) return 0;

  unsigned int real = 0, effective = 0, saved = 0, filesystem = 0;
  int have_uids = 0;
  int zombie = 0;
  char line[256];
  while (fgets(line, sizeof(line), status) != NULL) {
    if (strncmp(line, "Uid:", 4) == 0) {
      have_uids = sscanf(line + 4, "%u %u %u %u", &real, &effective, &saved, &filesystem) == 4;
    } else if (strncmp(line, "State:", 6) == 0) {
      const char *cursor = line + 6;
      while (*cursor == ' ' || *cursor == '\t') cursor++;
      zombie = *cursor == 'Z';
    }
  }
  fclose(status);
  return have_uids && !zombie &&
    real == REPOSITORY_UID && effective == REPOSITORY_UID &&
    saved == REPOSITORY_UID && filesystem == REPOSITORY_UID;
}

static int terminate_pass(void) {
  DIR *proc = opendir("/proc");
  if (proc == NULL) fail("opendir /proc");
  int found = 0;
  struct dirent *entry;
  while ((entry = readdir(proc)) != NULL) {
    if (!decimal_name(entry->d_name)) continue;
    char *end = NULL;
    errno = 0;
    long value = strtol(entry->d_name, &end, 10);
    if (errno != 0 || end == entry->d_name || *end != '\0' || value <= 1 || value > INT_MAX) {
      continue;
    }
    pid_t pid = (pid_t)value;
    int pidfd = (int)syscall(SYS_pidfd_open, pid, 0);
    if (pidfd < 0) {
      if (errno == ESRCH) continue;
      closedir(proc);
      fail("pidfd_open");
    }
    if (!repository_process(pid)) {
      close(pidfd);
      continue;
    }
    found++;
    if (syscall(SYS_pidfd_send_signal, pidfd, SIGKILL, NULL, 0) != 0 && errno != ESRCH) {
      close(pidfd);
      closedir(proc);
      fail("pidfd_send_signal");
    }
    close(pidfd);
  }
  closedir(proc);
  return found;
}

int main(int argc, char **argv) {
  (void)argv;
  if (argc != 1) {
    fputs("usage: polyphemus-repository-cleanup\n", stderr);
    return 64;
  }
  if (setgroups(0, NULL) != 0) fail("setgroups");
  if (clearenv() != 0) fail("clearenv");
  if (prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0) fail("prctl dumpable");
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) fail("prctl no_new_privs");

  long descriptor_limit = sysconf(_SC_OPEN_MAX);
  if (descriptor_limit < 0 || descriptor_limit > 65536) descriptor_limit = 65536;
  for (int descriptor = 3; descriptor < descriptor_limit; descriptor++) close(descriptor);

  const struct timespec pause = { .tv_sec = 0, .tv_nsec = 10 * 1000 * 1000 };
  for (int pass = 0; pass < MAX_PASSES; pass++) {
    if (terminate_pass() == 0) return 0;
    nanosleep(&pause, NULL);
  }
  fputs("polyphemus-repository-cleanup: repository processes did not terminate\n", stderr);
  return 1;
}
