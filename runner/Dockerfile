FROM docker.io/cloudflare/sandbox:0.12.4

WORKDIR /opt/polyphemus
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts
COPY main.ts ./main.ts

WORKDIR /container-server
