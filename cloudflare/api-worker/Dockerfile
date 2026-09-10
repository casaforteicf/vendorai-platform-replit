FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV PORT=8080

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --no-frozen-lockfile \
  && pnpm --filter @workspace/api-server run build \
  && pnpm store prune

EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
