# Imagem do backend para o deploy da migração de storage p/ Cloudflare R2.
# Igual ao backend/Dockerfile, porém o passo de build roda SOMENTE o esbuild
# (pnpm run build) em vez de todo o ci:railway (tsc + testes + auditorias).
# Motivo: o tsc e o build já foram validados localmente nesta mudança, e as
# auditorias/testes do ci:railway podem depender de banco/ambiente durante o
# build do Docker. Mantém o build rápido e sem dependência de DB.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@10.26.1 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-liberation chromium \
  && rm -rf /var/lib/apt/lists/*

COPY . .

RUN pnpm install --no-frozen-lockfile \
  && pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

EXPOSE 5000

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
