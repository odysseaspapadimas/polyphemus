FROM docker.io/library/ubuntu:22.04@sha256:0e0a0fc6d18feda9db1590da249ac93e8d5abfea8f4c3c0c849ce512b5ef8982 AS repository-exec-build

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*
COPY repository-exec.c repository-cleanup.c /tmp/
RUN gcc -O2 -Wall -Wextra -Werror -o /tmp/polyphemus-repository-exec /tmp/repository-exec.c \
  && gcc -O2 -Wall -Wextra -Werror -o /tmp/polyphemus-repository-cleanup /tmp/repository-cleanup.c

FROM docker.io/cloudflare/sandbox:0.12.4@sha256:e83bb4d6d9748b93a4b876ce0852b5e93d8e0893da10c59d425770aef0d73738

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_HOME=/var/lib/polyphemus-corepack

# Repository code and the token-bearing agent run under distinct identities.
# The setuid helper can only drop callers to the fixed, credential-free
# repository identity; it never executes with retained privilege.
RUN groupadd --gid 20000 polyphemus-workspace \
  && useradd --uid 10001 --gid 20000 --create-home \
    --home-dir /home/polyphemus-repository --shell /usr/sbin/nologin \
    polyphemus-repository \
  && useradd --uid 10002 --gid 20000 --create-home \
    --home-dir /home/polyphemus-agent --shell /usr/sbin/nologin \
    polyphemus-agent \
  && mkdir -p /home/polyphemus-agent/.cache /home/polyphemus-agent/tmp /home/polyphemus-agent/run \
  && chown -R 10002:20000 /home/polyphemus-agent \
  && chmod 0700 /home/polyphemus-repository /home/polyphemus-agent \
    /home/polyphemus-agent/.cache /home/polyphemus-agent/tmp /home/polyphemus-agent/run \
  && npm install --global corepack@0.35.0 \
  && corepack enable \
  && mkdir -p /var/lib/polyphemus-corepack \
  && corepack install --global npm@10.9.8 pnpm@11.17.0 yarn@1.22.22 \
  && chmod -R a-w /var/lib/polyphemus-corepack
COPY --from=repository-exec-build /tmp/polyphemus-repository-exec /usr/local/bin/polyphemus-repository-exec
COPY --from=repository-exec-build /tmp/polyphemus-repository-cleanup /usr/local/bin/polyphemus-repository-cleanup
COPY agent-exec.sh /usr/local/bin/polyphemus-agent-exec
# Pi may elevate only through the two fixed helpers. Each helper immediately
# constrains the operation or drops to the credential-free repository identity.
RUN find / -xdev -type f -perm /6000 -exec chmod a-s {} + \
  && chown root:root /usr/local/bin/polyphemus-repository-exec \
    /usr/local/bin/polyphemus-repository-cleanup /usr/local/bin/polyphemus-agent-exec \
  && chmod 4755 /usr/local/bin/polyphemus-repository-exec \
    /usr/local/bin/polyphemus-repository-cleanup \
  && chmod 0755 /usr/local/bin/polyphemus-agent-exec \
  && /usr/local/bin/polyphemus-agent-exec \
    /usr/local/bin/polyphemus-repository-exec /usr/bin/true \
  && { setpriv --reuid=10001 --regid=20000 --clear-groups sleep 30 & repository_pid=$!; \
    sleep 0.1; \
    /usr/local/bin/polyphemus-agent-exec /usr/local/bin/polyphemus-repository-cleanup \
      && ! kill -0 "$repository_pid" 2>/dev/null; smoke_status=$?; \
    wait "$repository_pid" 2>/dev/null || true; \
    test "$smoke_status" -eq 0; \
  }

WORKDIR /opt/polyphemus
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts
COPY main.ts validation-commands.ts repository-path.ts repository-files.ts ./
RUN chmod -R a-w /opt/polyphemus \
  && install -d -m 0700 -o 10002 -g 20000 /workspace/result \
  && POLYPHEMUS_TASK=container-build-smoke /usr/local/bin/polyphemus-agent-exec \
    bun --config=/dev/null /opt/polyphemus/main.ts >/dev/null 2>&1 \
  && bun -e 'const result = await Bun.file("/workspace/result/pi-result.json").json(); if (result.terminationReason !== "runner_error" || result.runRequest !== "container-build-smoke") process.exit(1)' \
  && rm -rf /workspace/result

WORKDIR /container-server
