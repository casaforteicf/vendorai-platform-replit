FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app

# O frontend faz parte de um monorepo pnpm. O Railpack estava detectando
# Python no repositório e executando o build sem pnpm. Mantemos o contexto
# completo do workspace e fixamos explicitamente Node + pnpm.
RUN corepack enable \
  && corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --no-frozen-lockfile \
  && pnpm --filter @workspace/frontend test \
  && pnpm --filter @workspace/frontend build

ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm --filter @workspace/frontend serve -- --port ${PORT:-4173}"]
