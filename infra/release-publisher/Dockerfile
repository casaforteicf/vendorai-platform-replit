FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl jq git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile

COPY infra/release-publisher/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
