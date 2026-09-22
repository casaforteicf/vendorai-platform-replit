FROM node:24-bookworm-slim

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --filter @workspace/e2e... --frozen-lockfile \
  && pnpm --filter @workspace/e2e exec playwright install --with-deps chromium

ENV CI=1
ENV E2E_BASE_URL=https://app.appvendorai.com

CMD ["node", "e2e/scripts/railway-p0-runner.mjs"]
