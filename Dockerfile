FROM node:24-bookworm-slim

WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@10.26.1 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*

COPY . .

ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vendorai_ci
ENV NODE_OPTIONS=--max-old-space-size=6144
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV VISUAL_QA_BROWSER_TEST=1

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/vendor-brain typecheck
RUN pnpm --filter @workspace/api-server exec tsc -p tsconfig.launch-ci.json --noEmit
RUN pnpm --filter @workspace/api-server exec vitest run src/services/siteRenderedVisualQa.test.ts src/services/siteMediaQuality.test.ts
RUN pnpm --filter @workspace/api-server run audit:tenant:baseline
RUN pnpm --filter @workspace/api-server run build

CMD ["node", "-e", "console.log('Rendered visual QA validation passed'); setInterval(() => {}, 2147483647)"]
