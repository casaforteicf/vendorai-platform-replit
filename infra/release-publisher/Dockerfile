FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl jq git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
COPY artifacts/frontend/package.json artifacts/frontend/package.json
COPY artifacts/website/package.json artifacts/website/package.json
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/vendor-brain/package.json lib/vendor-brain/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json

RUN pnpm install --no-frozen-lockfile

COPY . .

COPY infra/release-publisher/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
