FROM node:22-bookworm-slim

WORKDIR /app

# O backend de producao e a API TypeScript do workspace. O antigo main.py
# expunha apenas uma API demonstrativa do Revenue Scout e, por isso, rotas
# como /api/onboarding/step/1 retornavam 404 no Railway.
#
# ffmpeg + fontconfig + fonts-liberation: o Content Studio (edição
# automática, clipes, legendagem — video_processing.ts) chama o binário
# ffmpeg via execFile. Sem essa instalação, todo o módulo de vídeo falha
# em produção (achado ao construir a legendagem automática — as rotas de
# edit/clips já existentes tinham o mesmo problema, nunca tinham sido
# testadas de ponta a ponta em produção). fonts-liberation dá uma fonte
# bold real pro libass usar na legenda queimada (Liberation Sans Bold,
# metricamente compatível com Arial — a família "Arial Black" em si é
# proprietária da Microsoft e não existe em nenhum pacote Debian).
#
# chromium: necessário pelo puppeteer-core para gerar PDFs reais das propostas.
# Sem ele, o endpoint de PDF caía no fallback HTML e o navegador recebia um
# arquivo .pdf inválido.
RUN corepack enable \
  && corepack prepare pnpm@10.26.1 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-liberation chromium \
  && rm -rf /var/lib/apt/lists/*

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @workspace/api-server run ci:railway

ENV NODE_ENV=production

EXPOSE 5000

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]