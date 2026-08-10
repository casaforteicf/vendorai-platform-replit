FROM node:22-bookworm-slim

WORKDIR /app

# O backend de producao e a API TypeScript do workspace. O antigo main.py
# expunha apenas uma API demonstrativa do Revenue Scout e, por isso, rotas
# como /api/onboarding/step/1 retornavam 404 no Railway.
RUN corepack enable \
  && corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

EXPOSE 5000

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
